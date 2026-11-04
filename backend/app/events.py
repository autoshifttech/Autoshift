"""Events sent out to a business's own URL (n8n, Zapier ...).

Each delivery is signed so the receiver can prove it came from AutoShift:
    X-AutoShift-Signature: sha256=<hex hmac of "<timestamp>.<body>" with the subscription secret>
    X-AutoShift-Timestamp: <unix seconds>
Emitting never breaks the thing that caused it (a payment must succeed even if a webhook is down).
Failed deliveries retry with growing gaps and are marked failed after six attempts.
"""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx

from .config import Settings
from .db import Db
from .security import decrypt

log = logging.getLogger("autoshift.events")

EVENT_TYPES = (
    "wallet.topped_up", "wallet.refunded", "wallet.low", "subscription.updated", "test.ping",
    # forwarded by the web app, which runs WhatsApp
    "message.received", "message.status_updated", "conversation.created", "lead.created", "conversation.handoff",
)
BACKOFF_MINUTES = [1, 5, 30, 120, 360]  # after attempts 1..5; the 6th failure is final
MAX_ATTEMPTS = 6

Send = Callable[[str, dict[str, str], bytes], Awaitable[int]]


class UnsafeUrl(ValueError):
    pass


def sign(secret: str, timestamp: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


async def check_url(url: str, resolver: Callable[[str], list[str]] | None = None) -> None:
    """Only public https addresses. Stops a business pointing us at our own network."""
    parts = urlparse(url)
    if parts.scheme != "https" or not parts.hostname:
        raise UnsafeUrl("The URL must start with https://")
    if parts.username or parts.password:
        raise UnsafeUrl("The URL can't contain a username or password")
    resolve = resolver or (lambda h: [i[4][0] for i in socket.getaddrinfo(h, parts.port or 443, type=socket.SOCK_STREAM)])
    try:
        addrs = await asyncio.get_running_loop().run_in_executor(None, resolve, parts.hostname)
    except OSError as exc:
        raise UnsafeUrl("That address can't be found") from exc
    for a in addrs:
        ip = ipaddress.ip_address(a)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise UnsafeUrl("That address isn't public")


async def emit(sdb: Db, account_id: str, event: str, data: dict[str, Any], *, only_subscription: str | None = None) -> int:
    """Queue the event for every matching subscription. Returns how many were queued; never raises."""
    try:
        subs = await sdb.select("webhook_subscriptions", {"account_id": account_id, "enabled": "true"})
        payload = {"id": f"evt_{uuid.uuid4().hex}", "type": event, "created_at": datetime.now(timezone.utc).isoformat(), "account_id": account_id, "data": data}
        queued = 0
        for s in subs:
            if only_subscription and s["id"] != only_subscription:
                continue
            if "*" not in s["events"] and event not in s["events"]:
                continue
            await sdb.insert("webhook_deliveries", {"subscription_id": s["id"], "account_id": account_id, "event": event, "payload": payload, "status": "pending", "attempts": 0, "next_attempt_at": datetime.now(timezone.utc).isoformat()})
            queued += 1
        return queued
    except Exception:  # noqa: BLE001 - must never break the caller
        log.exception("could not queue event %s", event)
        return 0


async def _http_send(url: str, headers: dict[str, str], body: bytes) -> int:
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        return (await client.post(url, content=body, headers=headers)).status_code


async def deliver_pending(sdb: Db, settings: Settings, *, send: Send | None = None, resolver=None, now: datetime | None = None, limit: int = 50) -> dict[str, int]:
    send = send or _http_send
    now = now or datetime.now(timezone.utc)
    due = [d for d in await sdb.select("webhook_deliveries", {"status": "pending"}, order="created_at.asc", limit=500) if str(d["next_attempt_at"]) <= now.isoformat()][:limit]
    done = {"delivered": 0, "retry": 0, "failed": 0}
    for d in due:
        subs = await sdb.select("webhook_subscriptions", {"id": d["subscription_id"]}, limit=1)
        attempts = int(d["attempts"]) + 1
        status_code, error = None, None
        if not subs or not subs[0]["enabled"]:
            error = "Subscription removed or switched off"
            attempts = MAX_ATTEMPTS
        else:
            sub = subs[0]
            body = json.dumps(d["payload"], separators=(",", ":")).encode()
            ts = str(int(now.timestamp()))
            headers = {"Content-Type": "application/json", "User-Agent": "AutoShift-Webhooks/1", "X-AutoShift-Event": d["event"], "X-AutoShift-Timestamp": ts, "X-AutoShift-Signature": sign(decrypt(sub["secret_cipher"], settings), ts, body)}
            try:
                await check_url(sub["url"], resolver)  # re-checked on every send: DNS can change
                status_code = await send(sub["url"], headers, body)
                if 200 <= status_code < 300:
                    await sdb.update("webhook_deliveries", {"id": d["id"]}, {"status": "delivered", "attempts": attempts, "last_status": status_code, "last_error": None})
                    done["delivered"] += 1
                    continue
                error = f"The receiver answered {status_code}"
            except UnsafeUrl as exc:
                error, attempts = str(exc), MAX_ATTEMPTS
            except httpx.HTTPError as exc:
                error = f"Could not reach the receiver ({type(exc).__name__})"
        if attempts >= MAX_ATTEMPTS:
            await sdb.update("webhook_deliveries", {"id": d["id"]}, {"status": "failed", "attempts": attempts, "last_status": status_code, "last_error": error})
            done["failed"] += 1
        else:
            nxt = now + timedelta(minutes=BACKOFF_MINUTES[attempts - 1])
            await sdb.update("webhook_deliveries", {"id": d["id"]}, {"attempts": attempts, "last_status": status_code, "last_error": error, "next_attempt_at": nxt.isoformat()})
            done["retry"] += 1
    return done

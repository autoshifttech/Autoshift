"""WhatsApp webhook verification and processing. Events are matched to tenants by WABA ID
(`entry[].id`), the identifier Meta sends for every `whatsapp_business_account` change.
"""

import hashlib
import hmac
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.models import (
    ConnectionStatus,
    InboundMessage,
    MessageStatus,
    WhatsAppAccount,
    utcnow,
)
from app.repositories.base import Repository

logger = logging.getLogger(__name__)

# account_update events that mean the business can no longer use the integration.
DISCONNECT_EVENTS = {"PARTNER_REMOVED"}
RESTRICT_EVENTS = {"ACCOUNT_VIOLATION", "ACCOUNT_RESTRICTION", "DISABLED_UPDATE", "ACCOUNT_DELETED"}


def verify_signature(app_secret: str, body: bytes, header: str | None) -> bool:
    """Validate `X-Hub-Signature-256: sha256=<hex>` (HMAC-SHA256 of the raw body)."""
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


def _timestamp(value: Any) -> datetime:
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError):
        return utcnow()


def _message_text(message: dict[str, Any]) -> str | None:
    kind = message.get("type")
    if kind == "text":
        return message.get("text", {}).get("body")
    if kind in {"image", "video", "document"}:
        return message.get(kind, {}).get("caption")
    if kind == "button":
        return message.get("button", {}).get("text")
    if kind == "interactive":
        interactive = message.get("interactive", {})
        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
        return reply.get("title")
    if kind == "reaction":
        return message.get("reaction", {}).get("emoji")
    return None


class WebhookProcessor:
    def __init__(self, repo: Repository) -> None:
        self.repo = repo

    async def record(self, payload: dict[str, Any]) -> list[tuple[UUID, dict[str, Any]]]:
        """Store every change raw (fast, inside the request) and return the work to process."""
        work: list[tuple[UUID, dict[str, Any]]] = []
        if payload.get("object") != "whatsapp_business_account":
            return work
        for entry in payload.get("entry", []) or []:
            waba_id = str(entry.get("id")) if entry.get("id") is not None else None
            account = await self.repo.get_account_by_waba(waba_id) if waba_id else None
            for change in entry.get("changes", []) or []:
                event_id = await self.repo.insert_webhook_event(
                    field=str(change.get("field", "unknown")),
                    waba_id=waba_id,
                    tenant_id=account.tenant_id if account else None,
                    payload={"entry_id": waba_id, **change},
                )
                work.append((event_id, {"waba_id": waba_id, **change}))
        return work

    async def process(self, work: list[tuple[UUID, dict[str, Any]]]) -> None:
        for event_id, change in work:
            error: str | None = None
            try:
                await self._process_change(change)
            except Exception as exc:  # keep processing the rest of the batch
                logger.exception("Webhook event %s failed", event_id)
                error = f"{type(exc).__name__}: {exc}"
            await self.repo.mark_webhook_event_processed(event_id, error)

    async def _process_change(self, change: dict[str, Any]) -> None:
        waba_id = change.get("waba_id")
        account = await self.repo.get_account_by_waba(waba_id) if waba_id else None
        if account is None:
            logger.info("Webhook for unknown WABA %s (field=%s)", waba_id, change.get("field"))
            return

        field = change.get("field")
        value = change.get("value", {}) or {}
        if field == "messages":
            await self._handle_messages(account, value)
        elif field == "account_update":
            self._handle_account_update(account, value)
        else:
            logger.info("Ignoring webhook field %s for WABA %s", field, waba_id)

        account.last_webhook_at = utcnow()
        await self.repo.save_account(account)

    async def _handle_messages(self, account: WhatsAppAccount, value: dict[str, Any]) -> None:
        phone_number_id = str(value.get("metadata", {}).get("phone_number_id", ""))
        if phone_number_id and phone_number_id != account.phone_number_id:
            logger.warning(
                "Webhook phone %s does not match stored phone %s for WABA %s",
                phone_number_id,
                account.phone_number_id,
                account.waba_id,
            )
        names = {
            c.get("wa_id"): c.get("profile", {}).get("name")
            for c in value.get("contacts", []) or []
        }
        for message in value.get("messages", []) or []:
            await self.repo.insert_message(
                InboundMessage(
                    tenant_id=account.tenant_id,
                    wamid=str(message.get("id")),
                    phone_number_id=phone_number_id or account.phone_number_id,
                    from_number=str(message.get("from", "")),
                    contact_name=names.get(message.get("from")),
                    message_type=str(message.get("type", "unknown")),
                    text=_message_text(message),
                    payload=message,
                    sent_at=_timestamp(message.get("timestamp")),
                )
            )
        for status in value.get("statuses", []) or []:
            await self.repo.insert_message_status(
                MessageStatus(
                    tenant_id=account.tenant_id,
                    wamid=str(status.get("id")),
                    status=str(status.get("status", "unknown")),
                    recipient_id=status.get("recipient_id"),
                    errors=status.get("errors"),
                    occurred_at=_timestamp(status.get("timestamp")),
                )
            )

    def _handle_account_update(self, account: WhatsAppAccount, value: dict[str, Any]) -> None:
        event = str(value.get("event", ""))
        logger.info("account_update %s for WABA %s", event, account.waba_id)
        if event in DISCONNECT_EVENTS:
            account.connection_status = ConnectionStatus.DISCONNECTED
            account.webhooks_subscribed = False
            account.token_ciphertext = None
            account.pin_ciphertext = None
            account.last_error = {"step": "account_update", "event": event}
        elif event in RESTRICT_EVENTS:
            account.connection_status = ConnectionStatus.RESTRICTED
            account.last_error = {"step": "account_update", "event": event, "details": value}

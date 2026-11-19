"""Razorpay webhooks: the source of truth for what was actually paid."""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from .. import audit, billing, shop_payments
from ..config import Settings, get_settings
from ..deps import Bridge, ServiceDb
from .. import cashfree
from ..razorpay import verify_webhook_signature
from ..security import decrypt

router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])


def _entity(payload: dict[str, Any], name: str) -> dict[str, Any]:
    return (payload.get("payload", {}).get(name) or {}).get("entity") or {}


async def _handle(event: str, payload: dict[str, Any], sdb, settings: Settings, bridge=None) -> str:
    """Returns 'processed' or 'ignored'. Every branch is idempotent."""
    if event.startswith("payment_link.") and bridge is not None:
        # A business's shop link whose webhook points here (the same Razorpay account can be both).
        # The payload isn't trusted: Razorpay is asked about the link with the business's own keys.
        link = _entity(payload, "payment_link")
        rows = await sdb.select("payment_links", {"razorpay_link_id": link.get("id", "")}, limit=1) if link.get("id") else []
        if not rows:
            return "ignored"
        return "processed" if await shop_payments.reconcile(sdb, settings, bridge, rows[0]) in ("paid", "expired") else "ignored"
    if event == "order.paid":
        payment, order = _entity(payload, "payment"), _entity(payload, "order")
        rows = await sdb.select("payment_orders", {"razorpay_order_id": order.get("id", "")}, limit=1)
        if not rows:
            return "ignored"  # not an order we created
        if int(payment.get("amount", -1)) != rows[0]["total_paise"]:
            await audit.record(sdb, scope="platform", action="payment.amount_mismatch", actor_id=None, account_id=rows[0]["account_id"], target=payment.get("id", ""), details={"expected": rows[0]["total_paise"], "paid": payment.get("amount")})
            raise ValueError("Paid amount does not match the order")
        await billing.credit_topup(sdb, settings, rows[0], payment["id"])
        return "processed"

    if event in ("subscription.activated", "subscription.charged"):
        sub = _entity(payload, "subscription")
        row = await billing.sync_subscription(sdb, sub.get("id", ""), sub, "active")
        if not row:
            return "ignored"
        payment = _entity(payload, "payment")
        if event == "subscription.charged" and payment.get("id"):
            await billing.ensure_invoice(sdb, account_id=row["account_id"], kind="subscription", description=f"{row['plan_id'].capitalize()} plan ({row['cycle']})", total_paise=int(payment["amount"]), payment_id=payment["id"], settings=settings)
        return "processed"

    if event in ("subscription.halted", "subscription.pending"):
        sub = _entity(payload, "subscription")
        return "processed" if await billing.sync_subscription(sdb, sub.get("id", ""), sub, "past_due") else "ignored"
    if event == "subscription.cancelled":
        sub = _entity(payload, "subscription")
        return "processed" if await billing.sync_subscription(sdb, sub.get("id", ""), sub, "cancelled") else "ignored"
    if event == "subscription.completed":
        sub = _entity(payload, "subscription")
        return "processed" if await billing.sync_subscription(sdb, sub.get("id", ""), sub, "expired") else "ignored"

    if event == "refund.processed":
        refund = _entity(payload, "refund")
        rows = await sdb.select("payment_orders", {"razorpay_payment_id": refund.get("payment_id", "")}, limit=1)
        if not rows:
            return "ignored"
        result = await billing.debit_refund(sdb, rows[0], refund["id"], int(refund["amount"]))
        if result["shortfall_paise"]:
            await audit.record(sdb, scope="platform", action="refund.shortfall", actor_id=None, account_id=rows[0]["account_id"], target=refund["id"], details=result)
        return "processed"

    return "ignored"


@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    sdb: ServiceDb,
    bridge: Bridge,
    settings: Annotated[Settings, Depends(get_settings)],
    x_razorpay_signature: Annotated[str | None, Header()] = None,
    x_razorpay_event_id: Annotated[str | None, Header()] = None,
):
    raw = await request.body()
    if not verify_webhook_signature(raw, x_razorpay_signature or "", settings.razorpay_webhook_secret):
        raise HTTPException(400, "Invalid signature")
    try:
        payload = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(400, "Body is not JSON") from exc

    event = str(payload.get("event", ""))
    event_id = x_razorpay_event_id or hashlib.sha256(raw).hexdigest()

    existing = await sdb.select("razorpay_events", {"event_id": event_id}, limit=1)
    if existing and existing[0]["status"] in ("processed", "ignored"):
        return {"status": "duplicate"}
    if not existing:
        await sdb.insert("razorpay_events", {"event_id": event_id, "event_type": event, "payload": payload})

    try:
        outcome = await _handle(event, payload, sdb, settings, bridge)
    except Exception as exc:  # noqa: BLE001 - recorded, then Razorpay retries
        await sdb.update("razorpay_events", {"event_id": event_id}, {"status": "failed", "error": str(exc)[:300]})
        raise HTTPException(500, "Could not process the event") from exc

    await sdb.update("razorpay_events", {"event_id": event_id}, {"status": outcome, "processed_at": datetime.now(timezone.utc).isoformat()})
    return {"status": outcome}


@router.post("/razorpay/c/{connection_id}")
async def business_razorpay_webhook(
    connection_id: str,
    request: Request,
    sdb: ServiceDb,
    bridge: Bridge,
    settings: Annotated[Settings, Depends(get_settings)],
    x_razorpay_signature: Annotated[str | None, Header()] = None,
    x_razorpay_event_id: Annotated[str | None, Header()] = None,
):
    """A business's own Razorpay account: its customers paid a link or QR code a flow sent."""
    rows = await sdb.select("flow_connections", {"id": connection_id, "kind": "razorpay"}, limit=1) if _uuid(connection_id) else []
    if not rows:
        raise HTTPException(404, "Unknown connection")
    secrets = await sdb.select("flow_connection_secrets", {"connection_id": connection_id}, limit=1)
    keys = json.loads(decrypt(secrets[0]["ciphertext"], settings)) if secrets else {}
    raw = await request.body()
    if not keys.get("webhook_secret"):
        raise HTTPException(400, "Add the webhook secret to this Razorpay connection")
    if not verify_webhook_signature(raw, x_razorpay_signature or "", keys["webhook_secret"]):
        raise HTTPException(400, "Invalid signature")
    try:
        payload = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(400, "Body is not JSON") from exc

    event = str(payload.get("event", ""))
    event_id = "c:" + (x_razorpay_event_id or hashlib.sha256(raw).hexdigest())
    existing = await sdb.select("razorpay_events", {"event_id": event_id}, limit=1)
    if existing and existing[0]["status"] in ("processed", "ignored"):
        return {"status": "duplicate"}
    if not existing:
        await sdb.insert("razorpay_events", {"event_id": event_id, "event_type": event, "payload": payload})
    try:
        outcome = await shop_payments.handle_event(sdb, bridge, rows[0], keys, event, payload)
    except Exception as exc:  # noqa: BLE001 - recorded, then Razorpay retries
        await sdb.update("razorpay_events", {"event_id": event_id}, {"status": "failed", "error": str(exc)[:300]})
        raise HTTPException(500, "Could not process the event") from exc
    await sdb.update("razorpay_events", {"event_id": event_id}, {"status": outcome, "processed_at": datetime.now(timezone.utc).isoformat()})
    return {"status": outcome}


@router.post("/cashfree/c/{connection_id}")
async def business_cashfree_webhook(
    connection_id: str,
    request: Request,
    sdb: ServiceDb,
    bridge: Bridge,
    settings: Annotated[Settings, Depends(get_settings)],
    x_webhook_signature: Annotated[str | None, Header()] = None,
    x_webhook_timestamp: Annotated[str | None, Header()] = None,
):
    """A business's own Cashfree account: a payment link changed. The payload only tells us which
    link; whether it was paid is then asked of Cashfree itself, so a webhook can't fake a payment."""
    rows = await sdb.select("flow_connections", {"id": connection_id, "kind": "cashfree"}, limit=1) if _uuid(connection_id) else []
    if not rows:
        raise HTTPException(404, "Unknown connection")
    secrets = await sdb.select("flow_connection_secrets", {"connection_id": connection_id}, limit=1)
    keys = json.loads(decrypt(secrets[0]["ciphertext"], settings)) if secrets else {}
    raw = await request.body()
    if not cashfree.verify_webhook_signature(raw, x_webhook_timestamp or "", x_webhook_signature or "", keys.get("secret_key", "")):
        raise HTTPException(400, "Invalid signature")
    try:
        payload = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(400, "Body is not JSON") from exc
    data = payload.get("data") or {}
    link_id = str(data.get("link_id") or (data.get("order") or {}).get("order_tags", {}).get("link_id") or "")
    if not link_id:
        return {"status": "ignored"}
    links = await sdb.select("payment_links", {"razorpay_link_id": link_id, "connection_id": connection_id}, limit=1)
    if not links:
        return {"status": "ignored"}
    try:
        outcome = await shop_payments.cashfree_status(sdb, settings, bridge, links[0], rows[0], keys)
    except Exception as exc:  # noqa: BLE001 - Cashfree retries
        raise HTTPException(500, "Could not process the event") from exc
    return {"status": outcome}


def _uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False

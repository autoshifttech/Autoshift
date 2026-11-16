"""Payments a business collects from its own customers (an e-commerce flow on WhatsApp).

A flow's "Razorpay payment link" step asks for a link here. The money goes to the business's own
Razorpay account (Flows → Connections), never through AutoShift. The link page offers UPI (with a
QR code on a computer), cards and net banking; a separate single-use UPI QR picture can be made too.

When Razorpay says it was paid (a webhook signed with that connection's webhook secret), the order
moves to the "Paid" stage on the Leads page and the web app tells the customer and starts any
"Payment received" flow.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from . import audit, events
from .config import Settings
from .db import Db
from .razorpay import API, RazorpayError
from .security import decrypt

log = logging.getLogger("autoshift.shop_payments")

MIN_PAISE = 100  # Razorpay's smallest payment: ₹1
MAX_PAISE = 50_000_000  # ₹5,00,000 per order: a typo guard
LINK_HOURS = 24


class PaymentLinkError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def to_paise(amount: str | float) -> int:
    """'1,498.50', '₹ 999' or 999 → paise. Raises PaymentLinkError for anything else."""
    raw = re.sub(r"[^\d.]", "", str(amount))
    try:
        value = Decimal(raw)
    except InvalidOperation:
        raise PaymentLinkError(422, "The amount is not a number") from None
    paise = int((value * 100).quantize(Decimal(1)))
    if paise < MIN_PAISE:
        raise PaymentLinkError(422, "The amount must be at least ₹1")
    if paise > MAX_PAISE:
        raise PaymentLinkError(422, "The amount is too large")
    return paise


async def rzp_post(key_id: str, key_secret: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
    """One call to Razorpay with the business's own keys. Replaced in tests."""
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(f"{API}{path}", json=body, auth=(key_id, key_secret))
    if res.status_code >= 400:
        raise RazorpayError(res.status_code, res.text[:300])
    return res.json()


async def connection_keys(sdb: Db, settings: Settings, account_id: str, connection_id: str | None) -> tuple[dict, dict]:
    """The business's Razorpay connection and its decrypted keys. Picks the newest one when no id is given."""
    filters = {"account_id": account_id, "kind": "razorpay"}
    if connection_id:
        filters["id"] = connection_id
    rows = await sdb.select("flow_connections", filters, order="created_at.desc", limit=1)
    if not rows:
        raise PaymentLinkError(409, "Connect your Razorpay account first (Flows → Connections)")
    secret_rows = await sdb.select("flow_connection_secrets", {"connection_id": rows[0]["id"]}, limit=1)
    if not secret_rows:
        raise PaymentLinkError(409, "The Razorpay connection has no keys; add it again")
    return rows[0], json.loads(decrypt(secret_rows[0]["ciphertext"], settings))


async def create_link(
    sdb: Db,
    settings: Settings,
    *,
    account_id: str,
    connection_id: str | None,
    amount: str | float,
    description: str,
    contact_id: str | None = None,
    conversation_id: str | None = None,
    flow_run_id: str | None = None,
    lead_id: str | None = None,
    customer_name: str | None = None,
    customer_phone: str | None = None,
    send_qr: bool = False,
) -> dict:
    paise = to_paise(amount)
    conn, keys = await connection_keys(sdb, settings, account_id, connection_id)
    row_id = str(uuid.uuid4())
    description = (description or "Order payment").strip()[:2000]
    expire = datetime.now(timezone.utc) + timedelta(hours=LINK_HOURS)
    notes = {"autoshift_account": account_id, "autoshift_payment": row_id}

    customer: dict[str, str] = {}
    if customer_name:
        customer["name"] = customer_name[:100]
    phone = re.sub(r"\D", "", customer_phone or "")
    if phone:
        customer["contact"] = f"+{phone}"
    body: dict[str, Any] = {
        "amount": paise,
        "currency": "INR",
        "accept_partial": False,
        "description": description,
        "reference_id": row_id,
        "expire_by": int(expire.timestamp()),
        "notify": {"sms": False, "email": False},  # the customer gets the link on WhatsApp
        "reminder_enable": False,
        "notes": notes,
    }
    if customer:
        body["customer"] = customer
    try:
        link = await rzp_post(keys["key_id"], keys["key_secret"], "/payment_links", body)
    except RazorpayError as exc:
        raise PaymentLinkError(502, f"Razorpay refused the payment link ({exc.status})") from exc
    except httpx.HTTPError as exc:
        raise PaymentLinkError(502, "Razorpay could not be reached") from exc

    qr: dict[str, Any] = {}
    qr_problem = None
    if send_qr:
        try:
            qr = await rzp_post(keys["key_id"], keys["key_secret"], "/payments/qr_codes", {
                "type": "upi_qr", "name": description[:40] or "Order", "usage": "single_use", "fixed_amount": True,
                "payment_amount": paise, "description": description[:500], "close_by": int(expire.timestamp()), "notes": notes,
            })
        except (RazorpayError, httpx.HTTPError) as exc:
            # QR codes need the feature switched on in Razorpay; the link still works without it.
            qr_problem = f"QR code not made ({getattr(exc, 'status', 'network')})"
            log.warning("razorpay qr failed for %s: %s", account_id, exc)

    await sdb.insert("payment_links", {
        "id": row_id, "account_id": account_id, "connection_id": conn["id"], "contact_id": contact_id,
        "conversation_id": conversation_id, "flow_run_id": flow_run_id, "lead_id": lead_id,
        "description": description, "amount_paise": paise, "currency": "INR",
        "razorpay_link_id": link.get("id"), "short_url": link.get("short_url"),
        "razorpay_qr_id": qr.get("id"), "qr_image_url": qr.get("image_url"), "status": "created",
    })
    return {
        "id": row_id, "short_url": link.get("short_url"), "qr_image_url": qr.get("image_url"),
        "amount_paise": paise, "mode": conn.get("mode"), "qr_problem": qr_problem,
    }


def rupees(paise: int) -> str:
    whole, part = divmod(int(paise), 100)
    return f"{whole:,}" if not part else f"{whole:,}.{part:02d}"


async def _move_lead_to_paid(sdb: Db, account_id: str, lead_id: str | None) -> bool:
    if not lead_id:
        return False
    deals = await sdb.select("deals", {"id": lead_id, "account_id": account_id}, limit=1)
    if not deals:
        return False
    stages = await sdb.select("pipeline_stages", {"pipeline_id": deals[0]["pipeline_id"], "name": ("ilike", "paid")}, limit=1)
    if not stages:
        return False
    await sdb.update("deals", {"id": lead_id, "account_id": account_id}, {"stage_id": stages[0]["id"]})
    return True


async def mark_paid(sdb: Db, bridge, row: dict, payment: dict, keys: dict) -> str:
    """Record the payment, move the order, tell the customer. Safe to repeat until the customer is told."""
    account_id = row["account_id"]
    if row["status"] == "paid" and row.get("notified_at"):
        return "processed"
    if int(payment.get("amount", -1)) != int(row["amount_paise"]):
        await audit.record(sdb, scope="account", action="shop_payment.amount_mismatch", actor_id=None, account_id=account_id, target=row["id"], details={"expected": row["amount_paise"], "paid": payment.get("amount")})
        raise ValueError("Paid amount does not match the payment link")

    if row["status"] != "paid":
        now = datetime.now(timezone.utc).isoformat()
        await sdb.update("payment_links", {"id": row["id"]}, {"status": "paid", "paid_at": now, "razorpay_payment_id": payment.get("id")})
        row = {**row, "status": "paid", "paid_at": now, "razorpay_payment_id": payment.get("id")}
        moved = await _move_lead_to_paid(sdb, account_id, row.get("lead_id"))
        await audit.record(sdb, scope="account", action="shop_payment.paid", actor_id=None, account_id=account_id, target=row["id"], details={"amount_paise": row["amount_paise"], "payment_id": payment.get("id"), "lead_moved": moved})
        await events.emit(sdb, account_id, "payment.received", {
            "payment_link_id": row["id"], "amount_paise": row["amount_paise"], "description": row.get("description"),
            "razorpay_payment_id": payment.get("id"), "contact_id": row.get("contact_id"), "lead_id": row.get("lead_id"),
        })
        # The customer paid one way; close the other so they can't pay twice.
        try:
            if payment.get("_via") == "link" and row.get("razorpay_qr_id"):
                await rzp_post(keys["key_id"], keys["key_secret"], f"/payments/qr_codes/{row['razorpay_qr_id']}/close", {})
            elif payment.get("_via") == "qr" and row.get("razorpay_link_id"):
                await rzp_post(keys["key_id"], keys["key_secret"], f"/payment_links/{row['razorpay_link_id']}/cancel", {})
        except (RazorpayError, httpx.HTTPError) as exc:
            log.warning("could not close the other payment option for %s: %s", row["id"], exc)

    if row.get("conversation_id"):
        accounts = await sdb.select("accounts", {"id": account_id}, limit=1)
        owner = accounts[0].get("owner_user_id") if accounts else None
        if owner:
            # Raises when the web app is down, so Razorpay retries and the customer still hears back.
            await bridge.call("payment_paid", account_id, owner, "owner", payment_link_id=row["id"])
    await sdb.update("payment_links", {"id": row["id"]}, {"notified_at": datetime.now(timezone.utc).isoformat()})
    return "processed"


async def handle_event(sdb: Db, bridge, connection: dict, keys: dict, event: str, payload: dict) -> str:
    def entity(name: str) -> dict:
        return (payload.get("payload", {}).get(name) or {}).get("entity") or {}

    if event == "payment_link.paid":
        link = entity("payment_link")
        rows = await sdb.select("payment_links", {"razorpay_link_id": link.get("id", ""), "connection_id": connection["id"]}, limit=1)
        if not rows:
            return "ignored"
        return await mark_paid(sdb, bridge, rows[0], {**entity("payment"), "_via": "link"}, keys)

    if event == "qr_code.credited":
        qr = entity("qr_code")
        rows = await sdb.select("payment_links", {"razorpay_qr_id": qr.get("id", ""), "connection_id": connection["id"]}, limit=1)
        if not rows:
            return "ignored"
        return await mark_paid(sdb, bridge, rows[0], {**entity("payment"), "_via": "qr"}, keys)

    if event in ("payment_link.expired", "payment_link.cancelled"):
        link = entity("payment_link")
        rows = await sdb.select("payment_links", {"razorpay_link_id": link.get("id", ""), "connection_id": connection["id"]}, limit=1)
        if not rows or rows[0]["status"] != "created":
            return "ignored"
        await sdb.update("payment_links", {"id": rows[0]["id"]}, {"status": "expired" if event.endswith("expired") else "cancelled"})
        return "processed"

    return "ignored"

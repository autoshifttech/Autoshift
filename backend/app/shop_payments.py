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

from . import audit, cashfree, events, shop_orders
from .cashfree import CashfreeError
from .config import Settings
from .db import Db
from .razorpay import API, RazorpayError
from .security import decrypt

log = logging.getLogger("autoshift.shop_payments")

MIN_PAISE = 100  # Razorpay's smallest payment: ₹1
MAX_PAISE = 50_000_000  # ₹5,00,000 per order: a typo guard
LINK_HOURS = 24
PAYMENT_KINDS = ("razorpay", "cashfree")
# A paid order moves to the stage with one of these names (the "Paid" stage in each app language).
PAID_STAGE_NAMES = {"paid", "pago", "pagado", "pagada", "결제 완료", "결제완료"}


class PaymentLinkError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def provider_text(value: str | None) -> str:
    """Text a payment provider accepts: no emoji or other characters outside the basic plane (Razorpay
    refuses them), no control characters, single spaces. A customised order's message keeps its emoji in
    the order itself; only the copy sent to the provider is cleaned."""
    kept = "".join(ch for ch in str(value or "") if ord(ch) <= 0xFFFF and (ch.isprintable() or ch == " ") and not 0xFE00 <= ord(ch) <= 0xFE0F and ord(ch) != 0x200D)
    text = " ".join(kept.split()).replace("( ", "(").replace(" )", ")")
    return " ".join(text.replace("()", "").split())


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


async def rzp_get(key_id: str, key_secret: str, path: str) -> dict[str, Any]:
    """Read from Razorpay with the business's own keys. Replaced in tests."""
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{API}{path}", auth=(key_id, key_secret))
    if res.status_code >= 400:
        raise RazorpayError(res.status_code, res.text[:300])
    return res.json()


async def connection_keys(sdb: Db, settings: Settings, account_id: str, connection_id: str | None) -> tuple[dict, dict]:
    """The business's payment connection (Razorpay or Cashfree) and its decrypted keys.
    Picks the newest one when no id is given."""
    filters: dict[str, Any] = {"account_id": account_id, "kind": ("in", list(PAYMENT_KINDS))}
    if connection_id:
        filters["id"] = connection_id
    rows = await sdb.select("flow_connections", filters, order="created_at.desc", limit=1)
    if not rows:
        raise PaymentLinkError(409, "Connect your Razorpay or Cashfree account first (Flows → Connections)")
    secret_rows = await sdb.select("flow_connection_secrets", {"connection_id": rows[0]["id"]}, limit=1)
    if not secret_rows:
        raise PaymentLinkError(409, "The payment connection has no keys; add it again")
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
    description = (provider_text(description) or "Order payment")[:2000]
    customer_name = provider_text(customer_name) or None
    expire = datetime.now(timezone.utc) + timedelta(hours=LINK_HOURS)
    notes = {"autoshift_account": account_id, "autoshift_payment": row_id}

    if conn.get("kind") == "cashfree":
        return await _cashfree_link(sdb, conn, keys, row_id=row_id, paise=paise, description=description, expire=expire, notes=notes,
                                    customer_name=customer_name, customer_phone=customer_phone, contact_id=contact_id,
                                    conversation_id=conversation_id, flow_run_id=flow_run_id, lead_id=lead_id)

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


async def _cashfree_link(sdb: Db, conn: dict, keys: dict, *, row_id: str, paise: int, description: str, expire: datetime,
                         notes: dict, customer_name: str | None, customer_phone: str | None, **ids: Any) -> dict:
    """A Cashfree payment link. Its link_id is our own row id, so webhooks and checks find it directly."""
    body: dict[str, Any] = {
        "link_id": row_id.replace("-", "")[:50],
        "link_amount": paise / 100,
        "link_currency": "INR",
        "link_purpose": description[:500],
        "customer_details": {"customer_phone": cashfree.customer_phone(customer_phone), **({"customer_name": customer_name[:100]} if customer_name else {})},
        "link_expiry_time": expire.replace(microsecond=0).isoformat(),
        "link_partial_payments": False,
        "link_notify": {"send_sms": False, "send_email": False},  # the customer gets the link on WhatsApp
        "link_notes": notes,
    }
    try:
        link = await cashfree.cf_post(keys["app_id"], keys["secret_key"], conn.get("mode"), "/links", body)
    except CashfreeError as exc:
        raise PaymentLinkError(502, f"Cashfree refused the payment link ({exc.status})") from exc
    except httpx.HTTPError as exc:
        raise PaymentLinkError(502, "Cashfree could not be reached") from exc
    await sdb.insert("payment_links", {
        "id": row_id, "account_id": conn["account_id"], "connection_id": conn["id"], **ids,
        "description": description, "amount_paise": paise, "currency": "INR",
        # The provider's link id; the column name predates Cashfree.
        "razorpay_link_id": body["link_id"], "short_url": link.get("link_url"), "status": "created",
    })
    return {"id": row_id, "short_url": link.get("link_url"), "qr_image_url": None, "amount_paise": paise, "mode": conn.get("mode"), "qr_problem": None}


async def cashfree_status(sdb: Db, settings: Settings, bridge, row: dict, conn: dict, keys: dict) -> str:
    """Ask Cashfree about one link: 'paid', 'unpaid', 'expired' or 'error'."""
    try:
        link = await cashfree.cf_get(keys["app_id"], keys["secret_key"], conn.get("mode"), f"/links/{row['razorpay_link_id']}")
    except (CashfreeError, httpx.HTTPError) as exc:
        log.warning("could not check cashfree link %s: %s", row["id"], exc)
        return "error"
    status = str(link.get("link_status") or "").upper()
    if status == "PAID":
        try:
            paid = int((Decimal(str(link.get("link_amount_paid") or 0)) * 100).quantize(Decimal(1)))
        except InvalidOperation:
            paid = 0
        await mark_paid(sdb, bridge, row, {"id": str(link.get("cf_link_id") or link.get("link_id") or ""), "amount": paid, "_via": "link"}, keys)
        return "paid"
    if status in ("EXPIRED", "CANCELLED") and row["status"] == "created":
        await sdb.update("payment_links", {"id": row["id"]}, {"status": status.lower()})
        await shop_orders.payment_expired(sdb, row.get("order_id"))
        return "expired"
    return "unpaid"


def rupees(paise: int) -> str:
    whole, part = divmod(int(paise), 100)
    return f"{whole:,}" if not part else f"{whole:,}.{part:02d}"


async def _move_lead_to_paid(sdb: Db, account_id: str, lead_id: str | None) -> bool:
    if not lead_id:
        return False
    deals = await sdb.select("deals", {"id": lead_id, "account_id": account_id}, limit=1)
    if not deals:
        return False
    stages = await sdb.select("pipeline_stages", {"pipeline_id": deals[0]["pipeline_id"]})
    stage = next((st for st in stages if str(st.get("name", "")).strip().lower() in PAID_STAGE_NAMES), None)
    if not stage:
        return False
    await sdb.update("deals", {"id": lead_id, "account_id": account_id}, {"stage_id": stage["id"]})
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
        await shop_orders.payment_received(sdb, row.get("order_id"))
        await audit.record(sdb, scope="account", action="shop_payment.paid", actor_id=None, account_id=account_id, target=row["id"], details={"amount_paise": row["amount_paise"], "payment_id": payment.get("id"), "lead_moved": moved})
        await events.emit(sdb, account_id, "payment.received", {
            "payment_link_id": row["id"], "amount_paise": row["amount_paise"], "description": row.get("description"),
            "razorpay_payment_id": payment.get("id"), "contact_id": row.get("contact_id"), "lead_id": row.get("lead_id"),
        })
        # The customer paid one way; close the other so they can't pay twice (Razorpay only).
        try:
            if "key_id" not in keys:
                raise LookupError
            if payment.get("_via") == "link" and row.get("razorpay_qr_id"):
                await rzp_post(keys["key_id"], keys["key_secret"], f"/payments/qr_codes/{row['razorpay_qr_id']}/close", {})
            elif payment.get("_via") == "qr" and row.get("razorpay_link_id"):
                await rzp_post(keys["key_id"], keys["key_secret"], f"/payment_links/{row['razorpay_link_id']}/cancel", {})
        except LookupError:
            pass
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
        await shop_orders.payment_expired(sdb, rows[0].get("order_id"))
        return "processed"

    return "ignored"


# ------------------------------------------------------------------ asking Razorpay directly
# Webhooks can be missing or point elsewhere (one Razorpay account may also be AutoShift's own), so
# a payment is also confirmed by asking Razorpay about the link: after a webhook to any of our
# addresses, every couple of minutes, when the customer writes, and from the Orders page.
RECHECK_HOURS = LINK_HOURS + 1


async def reconcile(sdb: Db, settings: Settings, bridge, row: dict) -> str:
    """'paid', 'unpaid', 'expired' or 'error'. Records a payment Razorpay confirms (safe to repeat)."""
    if row["status"] == "paid" and row.get("notified_at"):
        return "paid"
    if not row.get("razorpay_link_id"):
        return "error"
    try:
        conn, keys = await connection_keys(sdb, settings, row["account_id"], row.get("connection_id"))
        if conn.get("kind") == "cashfree":
            return await cashfree_status(sdb, settings, bridge, row, conn, keys)
        link = await rzp_get(keys["key_id"], keys["key_secret"], f"/payment_links/{row['razorpay_link_id']}")
    except (PaymentLinkError, RazorpayError, httpx.HTTPError, KeyError, ValueError) as exc:
        log.warning("could not check payment link %s: %s", row["id"], exc)
        return "error"
    status = str(link.get("status") or "")
    if status == "paid":
        payments = link.get("payments") or []
        pay = next((p for p in payments if p.get("status") == "captured"), payments[0] if payments else {})
        amount = int(link.get("amount_paid") or pay.get("amount") or 0)
        await mark_paid(sdb, bridge, row, {"id": pay.get("payment_id") or pay.get("id"), "amount": amount, "_via": "link"}, keys)
        return "paid"
    if status in ("expired", "cancelled") and row["status"] == "created":
        await sdb.update("payment_links", {"id": row["id"]}, {"status": status})
        await shop_orders.payment_expired(sdb, row.get("order_id"))
        return "expired"
    return "unpaid"


async def reconcile_pending(sdb: Db, settings: Settings, bridge, *, account_id: str | None = None, contact_id: str | None = None, limit: int = 50) -> int:
    """Check the recent links that aren't settled yet. Returns how many turned out paid."""
    since = (datetime.now(timezone.utc) - timedelta(hours=RECHECK_HOURS)).isoformat()
    filters: dict[str, Any] = {"status": ("in", ["created", "paid"]), "notified_at": ("is", "null"), "created_at": ("gte", since)}
    if account_id:
        filters["account_id"] = account_id
    if contact_id:
        filters["contact_id"] = contact_id
    paid = 0
    for row in await sdb.select("payment_links", filters, order="created_at.desc", limit=limit):
        try:
            paid += await reconcile(sdb, settings, bridge, row) == "paid"
        except Exception as exc:  # noqa: BLE001 - one bad link must not stop the others
            log.warning("payment check failed for %s: %s", row["id"], exc)
    return paid

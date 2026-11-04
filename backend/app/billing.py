"""What happens after Razorpay says money moved. Every step is safe to repeat."""

from datetime import datetime, timezone
from typing import Any

from . import events, wallet
from .config import Settings
from .db import Db
from .money import split_inclusive


def _iso(epoch: int | None) -> str | None:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat() if epoch else None


async def ensure_invoice(sdb: Db, *, account_id: str, kind: str, description: str, total_paise: int, payment_id: str, settings: Settings, base_paise: int | None = None) -> dict[str, Any]:
    """One GST invoice per payment, however many times we are told about it."""
    existing = await sdb.select("invoices", {"razorpay_payment_id": payment_id}, limit=1)
    if existing:
        return existing[0]
    if base_paise is None:
        base_paise, gst = split_inclusive(total_paise, settings.gst_rate)
    else:
        gst = total_paise - base_paise
    number = await sdb.rpc("next_invoice_number", {})
    return await sdb.insert(
        "invoices",
        {"account_id": account_id, "number": number, "kind": kind, "description": description, "base_paise": base_paise, "gst_paise": gst, "total_paise": total_paise, "razorpay_payment_id": payment_id},
    )


async def credit_topup(sdb: Db, settings: Settings, order: dict[str, Any], payment_id: str) -> int:
    """Pay out a verified top-up: credit the wallet, mark the order paid, issue the invoice."""
    result = await wallet.apply(sdb, order["account_id"], order["base_paise"], "topup", payment_id, f"topup:{payment_id}", order.get("created_by"))
    if order["status"] != "paid":
        await sdb.update("payment_orders", {"razorpay_order_id": order["razorpay_order_id"]}, {"status": "paid", "razorpay_payment_id": payment_id, "paid_at": datetime.now(timezone.utc).isoformat()})
    await ensure_invoice(
        sdb,
        account_id=order["account_id"],
        kind="topup",
        description="Wallet credits",
        total_paise=order["total_paise"],
        base_paise=order["base_paise"],
        payment_id=payment_id,
        settings=settings,
    )
    if result.applied:  # a repeat of the same payment sends nothing again
        await events.emit(sdb, order["account_id"], "wallet.topped_up", {"amount_paise": order["base_paise"], "total_paid_paise": order["total_paise"], "balance_paise": result.balance_paise, "payment_id": payment_id})
    return result.balance_paise


async def debit_refund(sdb: Db, order: dict[str, Any], refund_id: str, refunded_paise: int) -> dict[str, int]:
    """Take back the credits a refund covers. If they are already spent, take what is left."""
    owed = round(refunded_paise * order["base_paise"] / order["total_paise"])
    available = await wallet.balance(sdb, order["account_id"])
    take = min(owed, available)
    if take > 0:
        done = await wallet.apply(sdb, order["account_id"], -take, "refund", refund_id, f"refund:{refund_id}")
        if done.applied:
            await events.emit(sdb, order["account_id"], "wallet.refunded", {"amount_paise": take, "balance_paise": done.balance_paise, "refund_id": refund_id})
    return {"owed_paise": owed, "taken_paise": take, "shortfall_paise": owed - take}


async def sync_subscription(sdb: Db, subscription_id: str, entity: dict[str, Any], status: str) -> dict[str, Any] | None:
    rows = await sdb.select("subscriptions", {"razorpay_subscription_id": subscription_id}, limit=1)
    if not rows:
        return None
    patch: dict[str, Any] = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if entity.get("current_end"):
        patch["current_period_end"] = _iso(entity["current_end"])
    await sdb.update("subscriptions", {"razorpay_subscription_id": subscription_id}, patch)
    await events.emit(sdb, rows[0]["account_id"], "subscription.updated", {"plan_id": rows[0]["plan_id"], "status": status})
    return rows[0]

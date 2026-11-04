"""Closing a business: keep the money records, delete everything else, and let its people carry on."""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from . import audit, wallet
from .db import Db
from .razorpay import RazorpayError


GRACE_DAYS = 30  # the app tells owners they have 30 days to change their mind


async def close_business(sdb: Db, rzp, account_id: str, *, confirm_name: str, actor_id: str | None, scope: str) -> dict:
    accts = await sdb.select("accounts", {"id": account_id}, limit=1)
    if not accts:
        raise HTTPException(404, "Business not found")
    acct = accts[0]
    if acct.get("status") == "closed":
        raise HTTPException(409, "This business is already closed")
    if confirm_name.strip() != acct["name"].strip():
        raise HTTPException(422, "Type the business name exactly to confirm")

    # 1. Stop billing now, not at the end of the period.
    sub = (await sdb.select("subscriptions", {"account_id": account_id}, limit=1)) or [None]
    sub = sub[0]
    if sub and sub.get("razorpay_subscription_id") and sub["status"] in ("trialing", "active", "past_due"):
        try:
            await rzp.cancel_subscription(sub["razorpay_subscription_id"], at_cycle_end=False)
        except RazorpayError as exc:
            raise HTTPException(502, "Razorpay could not cancel the subscription; nothing was closed") from exc
    if sub:
        await sdb.update("subscriptions", {"account_id": account_id}, {"status": "cancelled", "cancel_at_period_end": False})

    # 2. Everyone except the owner moves to a fresh workspace of their own, so their login keeps working.
    #    (The owner stays tied to the closed shell, which still records who owned it.)
    members = await sdb.select("profiles", {"account_id": account_id})
    for m in members:
        if m["account_role"] == "owner":
            continue
        own = await sdb.insert("accounts", {"name": (m.get("full_name") or "My workspace")[:120], "owner_user_id": m["user_id"]})
        await sdb.update("profiles", {"user_id": m["user_id"]}, {"account_id": own["id"], "account_role": "owner"})

    # 3. Delete the business's data, keeping money records and the audit log.
    result = await sdb.rpc("close_account_data", {"p_account": account_id})

    # 4. Keep an anonymous shell for the money records.
    await sdb.update("accounts", {"id": account_id}, {"name": "Closed business", "industry": "", "city": "", "status": "closed", "suspended_reason": None, "closed_at": datetime.now(timezone.utc).isoformat()})
    left = await wallet.balance(sdb, account_id)
    await audit.record(sdb, scope=scope, action="business.close", actor_id=actor_id, account_id=account_id, target=account_id, details={"name": acct["name"], "deleted_rows": (result or {}).get("deleted_rows"), "wallet_left_paise": left})
    return {"closed": True, "wallet_left_paise": left, "invoices_kept": await sdb.count("invoices", {"account_id": account_id}), "members_moved": sum(1 for m in members if m["account_role"] != "owner")}


async def close_due(sdb: Db, rzp) -> int:
    """Close every business whose grace period has ended. Run by the background worker."""
    now = datetime.now(timezone.utc).isoformat()
    done = 0
    for a in await sdb.select("accounts", {"status": "active"}):
        if a.get("close_after") and str(a["close_after"]) <= now:
            try:
                await close_business(sdb, rzp, a["id"], confirm_name=a["name"], actor_id=None, scope="account")
                done += 1
            except HTTPException:
                pass  # retried on the next run (e.g. Razorpay was down)
    return done


def grace_end(now: datetime | None = None) -> str:
    return ((now or datetime.now(timezone.utc)) + timedelta(days=GRACE_DAYS)).isoformat()

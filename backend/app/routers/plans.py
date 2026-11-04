from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .. import audit
from ..config import Settings, get_settings
from ..deps import AdminMember, Member, Rzp, ServiceDb
from ..money import gst_on, yearly_paise
from ..razorpay import RazorpayError, verify_subscription_signature
from ..schemas import SubscriptionCheckout, SubscriptionVerify

router = APIRouter(prefix="/v1", tags=["plans"])
Cfg = Annotated[Settings, Depends(get_settings)]
TRIAL_DAYS = 14


def _price(plan: dict, cycle: str) -> int:
    return yearly_paise(plan["monthly_paise"]) if cycle == "yearly" else plan["monthly_paise"]


@router.get("/plans")
async def list_plans(_: Member, sdb: ServiceDb):
    plans = await sdb.select("plans", {"active": "true"}, order="monthly_paise.asc")
    return [{**{k: p[k] for k in ("id", "name", "seats", "contacts", "ai_replies", "popular")}, "monthly_paise": p["monthly_paise"], "yearly_paise": yearly_paise(p["monthly_paise"])} for p in plans]


async def _subscription(sdb, account_id: str) -> dict:
    """The workspace's subscription; a new one starts a 14-day trial."""
    rows = await sdb.select("subscriptions", {"account_id": account_id}, limit=1)
    if rows:
        return rows[0]
    trial_end = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat()
    return await sdb.insert("subscriptions", {"account_id": account_id, "plan_id": "growth", "cycle": "monthly", "status": "trialing", "trial_ends_at": trial_end})


@router.get("/subscription")
async def get_subscription(ctx: Member, sdb: ServiceDb):
    return await _subscription(sdb, ctx.account_id)


@router.post("/subscription/checkout", status_code=201)
async def checkout(body: SubscriptionCheckout, ctx: AdminMember, sdb: ServiceDb, rzp: Rzp, settings: Cfg):
    """Create the Razorpay subscription. While on trial the first charge waits until the trial ends.
    The customer is charged the plan price plus GST, as the checkout screen says."""
    sub = await _subscription(sdb, ctx.account_id)
    if sub["status"] == "active" and sub.get("razorpay_subscription_id") and not sub["cancel_at_period_end"]:
        raise HTTPException(409, "You already have an active subscription. Cancel it before choosing another plan.")
    plans = await sdb.select("plans", {"id": body.plan_id, "active": "true"}, limit=1)
    if not plans:
        raise HTTPException(404, "Plan not found")
    plan = plans[0]
    base = _price(plan, body.cycle)
    gst = gst_on(base, settings.gst_rate)
    total = base + gst
    column = f"razorpay_plan_{body.cycle}"
    try:
        if not plan.get(column):
            created = await rzp.create_plan("yearly" if body.cycle == "yearly" else "monthly", total, f"AutoShift {plan['name']} ({body.cycle}, incl. GST)")
            await sdb.update("plans", {"id": plan["id"]}, {column: created["id"]})
            plan[column] = created["id"]
        start_at = None
        trial_end = datetime.fromisoformat(str(sub["trial_ends_at"]).replace("Z", "+00:00"))
        if sub["status"] == "trialing" and trial_end > datetime.now(timezone.utc) + timedelta(hours=1):
            start_at = int(trial_end.timestamp())
        remote = await rzp.create_subscription(plan[column], 10 if body.cycle == "yearly" else 120, {"account_id": ctx.account_id, "plan_id": plan["id"]}, start_at)
    except RazorpayError as exc:
        raise HTTPException(502, "Razorpay could not create the subscription") from exc
    await sdb.update("subscriptions", {"account_id": ctx.account_id}, {"plan_id": plan["id"], "cycle": body.cycle, "razorpay_subscription_id": remote["id"], "cancel_at_period_end": False})
    return {"razorpay_subscription_id": remote["id"], "key_id": rzp.key_id, "plan_id": plan["id"], "cycle": body.cycle, "base_paise": base, "gst_paise": gst, "amount_paise": total, "starts_after_trial": start_at is not None}


@router.post("/subscription/verify")
async def verify(body: SubscriptionVerify, ctx: AdminMember, sdb: ServiceDb, settings: Cfg):
    if not verify_subscription_signature(body.razorpay_payment_id, body.razorpay_subscription_id, body.razorpay_signature, settings.razorpay_key_secret):
        raise HTTPException(400, "Payment signature is invalid")
    sub = await _subscription(sdb, ctx.account_id)
    if sub.get("razorpay_subscription_id") != body.razorpay_subscription_id:
        raise HTTPException(404, "Subscription not found")
    # During a trial the card is only authorised; the first charge (and the invoice) follow the webhook.
    status = "trialing" if sub["status"] == "trialing" else "active"
    rows = await sdb.update("subscriptions", {"account_id": ctx.account_id}, {"status": status})
    await audit.record(sdb, scope="account", action="subscription.verify", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.razorpay_subscription_id, details={"plan_id": sub["plan_id"]})
    return rows[0]


@router.post("/subscription/cancel")
async def cancel(ctx: AdminMember, sdb: ServiceDb, rzp: Rzp):
    """Stops renewal; the plan stays until the period already paid for ends."""
    sub = await _subscription(sdb, ctx.account_id)
    if not sub.get("razorpay_subscription_id"):
        raise HTTPException(409, "There is no subscription to cancel")
    try:
        await rzp.cancel_subscription(sub["razorpay_subscription_id"], at_cycle_end=True)
    except RazorpayError as exc:
        raise HTTPException(502, "Razorpay could not cancel the subscription") from exc
    rows = await sdb.update("subscriptions", {"account_id": ctx.account_id}, {"cancel_at_period_end": True})
    await audit.record(sdb, scope="account", action="subscription.cancel", actor_id=ctx.user.id, account_id=ctx.account_id, target=sub["razorpay_subscription_id"])
    return rows[0]

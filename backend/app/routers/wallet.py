from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import audit, billing, wallet
from ..config import Settings, get_settings
from ..deps import AdminMember, Member, Rzp, ServiceDb, UserDb
from ..money import gst_on, inr_to_paise
from ..razorpay import RazorpayError, verify_payment_signature
from ..schemas import PaymentVerify, TopupCreate

router = APIRouter(prefix="/v1/wallet", tags=["wallet"])
Cfg = Annotated[Settings, Depends(get_settings)]


@router.get("")
async def get_wallet(ctx: Member, sdb: ServiceDb):
    return {"balance_paise": await wallet.balance(sdb, ctx.account_id), "rates_paise": await wallet.rates(sdb)}


@router.get("/ledger")
async def ledger(ctx: AdminMember, db: UserDb, limit: int = Query(50, ge=1, le=200)):
    """Newest first. Only this account's rows."""
    return await db.select("wallet_ledger", {"account_id": ctx.account_id}, order="id.desc", limit=limit)


@router.post("/topups", status_code=201)
async def start_topup(body: TopupCreate, ctx: AdminMember, sdb: ServiceDb, rzp: Rzp, settings: Cfg):
    """Create a Razorpay order for credits plus GST. The amount is decided here, never by the browser."""
    if not settings.topup_min_inr <= body.amount_inr <= settings.topup_max_inr:
        raise HTTPException(422, f"Choose between ₹{settings.topup_min_inr} and ₹{settings.topup_max_inr}")
    base = inr_to_paise(body.amount_inr)
    gst = gst_on(base, settings.gst_rate)
    total = base + gst
    try:
        order = await rzp.create_order(total, f"topup_{ctx.account_id[:8]}", {"account_id": ctx.account_id, "purpose": "topup", "base_paise": str(base)})
    except RazorpayError as exc:
        raise HTTPException(502, "Razorpay could not create the order") from exc
    await sdb.insert(
        "payment_orders",
        {"account_id": ctx.account_id, "purpose": "topup", "razorpay_order_id": order["id"], "base_paise": base, "gst_paise": gst, "total_paise": total, "created_by": ctx.user.id},
    )
    return {"razorpay_order_id": order["id"], "key_id": rzp.key_id, "currency": "INR", "base_paise": base, "gst_paise": gst, "amount_paise": total}


@router.post("/topups/verify")
async def verify_topup(body: PaymentVerify, ctx: AdminMember, sdb: ServiceDb, settings: Cfg):
    """The browser tells us the payment finished. We check Razorpay's signature before crediting.
    The webhook does the same job if the browser never gets here."""
    if not verify_payment_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, settings.razorpay_key_secret):
        raise HTTPException(400, "Payment signature is invalid")
    rows = await sdb.select("payment_orders", {"razorpay_order_id": body.razorpay_order_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Order not found")
    new_balance = await billing.credit_topup(sdb, settings, rows[0], body.razorpay_payment_id)
    await audit.record(sdb, scope="account", action="wallet.topup", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.razorpay_payment_id, details={"base_paise": rows[0]["base_paise"]})
    return {"balance_paise": new_balance}


@router.get("/invoices")
async def invoices(ctx: AdminMember, db: UserDb, limit: int = Query(50, ge=1, le=200)):
    return await db.select("invoices", {"account_id": ctx.account_id}, order="issued_at.desc", limit=limit)

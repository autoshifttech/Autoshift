"""Platform staff: look at a wallet, adjust it, refund a payment."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .. import audit, wallet
from ..deps import PlatformAdmin, Rzp, ServiceDb, get_platform_admin, require_platform_role
from ..razorpay import RazorpayError
from ..schemas import RefundRequest, WalletAdjust

router = APIRouter(prefix="/v1/platform", tags=["platform-money"])
Finance = Annotated[PlatformAdmin, Depends(require_platform_role("finance"))]
AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]


@router.get("/wallets/{account_id}")
async def get_wallet(account_id: str, _: AnyStaff, sdb: ServiceDb):
    return {
        "balance_paise": await wallet.balance(sdb, account_id),
        "ledger": await sdb.select("wallet_ledger", {"account_id": account_id}, order="id.desc", limit=50),
    }


@router.post("/wallets/{account_id}/adjust")
async def adjust(account_id: str, body: WalletAdjust, admin: Finance, sdb: ServiceDb):
    """Add or remove credits by hand. The idempotency key stops a double click from applying twice."""
    if body.amount_paise == 0:
        raise HTTPException(422, "Amount can't be zero")
    try:
        result = await wallet.apply(sdb, account_id, body.amount_paise, "adjustment", body.reason, f"adjust:{account_id}:{body.idempotency_key}", admin.user.id)
    except wallet.InsufficientFunds as exc:
        raise HTTPException(409, "The wallet doesn't hold that much") from exc
    await audit.record(sdb, scope="platform", action="wallet.adjust", actor_id=admin.user.id, account_id=account_id, target=account_id, details={"amount_paise": body.amount_paise, "reason": body.reason, "applied": result.applied})
    return {"applied": result.applied, "balance_paise": result.balance_paise}


@router.post("/payments/{payment_id}/refund")
async def refund(payment_id: str, body: RefundRequest, admin: Finance, sdb: ServiceDb, rzp: Rzp):
    """Refund a top-up through Razorpay. The credits are taken back when Razorpay confirms (refund.processed)."""
    rows = await sdb.select("payment_orders", {"razorpay_payment_id": payment_id}, limit=1)
    if not rows or rows[0]["status"] != "paid":
        raise HTTPException(404, "No paid top-up with that payment id")
    amount = body.amount_paise or rows[0]["total_paise"]
    if amount > rows[0]["total_paise"]:
        raise HTTPException(422, "Can't refund more than was paid")
    try:
        out = await rzp.refund(payment_id, amount, {"reason": body.reason, "by": admin.user.id})
    except RazorpayError as exc:
        raise HTTPException(502, "Razorpay could not create the refund") from exc
    await audit.record(sdb, scope="platform", action="payment.refund", actor_id=admin.user.id, account_id=rows[0]["account_id"], target=payment_id, details={"amount_paise": amount, "reason": body.reason, "refund_id": out.get("id")})
    return {"refund_id": out.get("id"), "amount_paise": amount, "status": out.get("status", "pending")}

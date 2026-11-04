"""Platform staff reports: payments, usage and the overview numbers."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..deps import PlatformAdmin, ServiceDb, get_platform_admin

router = APIRouter(prefix="/v1/platform", tags=["reports"])
AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]


def _since(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _recent(rows: list[dict], key: str, days: int) -> list[dict]:
    cutoff = _since(days)
    return [r for r in rows if str(r.get(key) or "") >= cutoff]


@router.get("/payments")
async def payments(_: AnyStaff, sdb: ServiceDb, status: str | None = Query(None, pattern="^(created|paid|failed)$"), account_id: str | None = None, limit: int = Query(100, ge=1, le=500)):
    """Wallet top-ups, newest first, with the business name."""
    filters = {k: v for k, v in {"status": status, "account_id": account_id}.items() if v}
    orders = await sdb.select("payment_orders", filters, order="created_at.desc", limit=limit)
    names = {a["id"]: a["name"] for a in await sdb.select("accounts")}
    return [{**o, "business": names.get(o["account_id"], "")} for o in orders]


@router.get("/invoices")
async def invoices(_: AnyStaff, sdb: ServiceDb, account_id: str | None = None, limit: int = Query(100, ge=1, le=500)):
    return await sdb.select("invoices", {"account_id": account_id} if account_id else None, order="issued_at.desc", limit=limit)


@router.get("/usage")
async def usage(_: AnyStaff, sdb: ServiceDb, days: int = Query(30, ge=1, le=365)):
    """What businesses spent in the period, by kind and by business (paise, from the ledger)."""
    entries = [e for e in _recent(await sdb.select("wallet_ledger"), "created_at", days) if e["kind"].startswith("charge_")]
    by_kind: dict[str, dict] = defaultdict(lambda: {"count": 0, "paise": 0})
    by_business: dict[str, int] = defaultdict(int)
    for e in entries:
        by_kind[e["kind"]]["count"] += 1
        by_kind[e["kind"]]["paise"] += -e["amount_paise"]
        by_business[e["account_id"]] += -e["amount_paise"]
    names = {a["id"]: a["name"] for a in await sdb.select("accounts")}
    top = sorted(by_business.items(), key=lambda kv: -kv[1])[:20]
    return {
        "days": days,
        "by_kind": dict(by_kind),
        "total_paise": sum(by_business.values()),
        "top_businesses": [{"account_id": a, "business": names.get(a, ""), "paise": p} for a, p in top],
    }


@router.get("/overview")
async def overview(_: AnyStaff, sdb: ServiceDb):
    accounts = await sdb.select("accounts")
    subs = await sdb.select("subscriptions")
    plans = {p["id"]: p for p in await sdb.select("plans")}
    paid = _recent([o for o in await sdb.select("payment_orders", {"status": "paid"})], "paid_at", 30)
    active = [s for s in subs if s["status"] == "active"]
    mrr = sum(plans[s["plan_id"]]["monthly_paise"] * (1 if s["cycle"] == "monthly" else 10 / 12) for s in active if s["plan_id"] in plans)
    return {
        "businesses": len(accounts),
        "suspended": sum(1 for a in accounts if a.get("status") == "suspended"),
        "trialing": sum(1 for s in subs if s["status"] == "trialing"),
        "active_subscriptions": len(active),
        "mrr_paise": int(mrr),
        "wallet_float_paise": sum(int(b["balance_paise"]) for b in await sdb.select("wallet_balances")),
        "topups_30d_paise": sum(o["base_paise"] for o in paid),
        "topups_30d_count": len(paid),
        "failed_webhooks": len(await sdb.select("razorpay_events", {"status": "failed"})),
    }

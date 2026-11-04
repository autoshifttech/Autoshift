"""What a business has used this month, against what its plan allows."""

from datetime import datetime, timezone
from typing import Any

from .db import Db

DEFAULT_PLAN = "growth"  # what a workspace without a subscription row is treated as (its trial plan)


def month_start() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


async def plan_for(sdb: Db, account_id: str) -> dict[str, Any]:
    sub = await sdb.select("subscriptions", {"account_id": account_id}, limit=1)
    plan_id = sub[0]["plan_id"] if sub else DEFAULT_PLAN
    plans = await sdb.select("plans", {"id": plan_id}, limit=1)
    return plans[0] if plans else {"id": plan_id, "seats": None, "contacts": None, "ai_replies": None}


async def ai_replies_this_month(sdb: Db, account_id: str) -> int:
    return await sdb.count("wallet_ledger", {"account_id": account_id, "kind": "charge_ai"}, since=("created_at", month_start()))


async def usage(sdb: Db, account_id: str) -> dict[str, Any]:
    plan = await plan_for(sdb, account_id)
    return {
        "plan_id": plan["id"],
        "seats": {"used": await sdb.count("profiles", {"account_id": account_id}), "limit": plan.get("seats")},
        "contacts": {"used": await sdb.count("contacts", {"account_id": account_id}), "limit": plan.get("contacts")},
        "ai_replies": {"used": await ai_replies_this_month(sdb, account_id), "limit": plan.get("ai_replies")},
    }

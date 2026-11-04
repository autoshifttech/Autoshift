"""Platform-wide switches (super admins). Missing rows fall back to safe defaults."""

from typing import Any

from .db import Db

DEFAULTS: dict[str, Any] = {"meta_fees_billed_to": "business"}
MESSAGE_CATEGORIES = ("marketing", "utility", "authentication", "service")


async def get(sdb: Db, key: str) -> Any:
    rows = await sdb.select("platform_settings", {"key": key}, limit=1)
    return rows[0]["value"] if rows else DEFAULTS[key]


async def wallet_pays_meta_fees(sdb: Db) -> bool:
    """True only when AutoShift is billed by Meta (Solution Partner credit line)."""
    return await get(sdb, "meta_fees_billed_to") == "autoshift"

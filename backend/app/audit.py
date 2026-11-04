"""Writes the audit trail (service role: users can't edit it)."""

from typing import Any

from .db import Db


async def record(
    sdb: Db,
    *,
    scope: str,
    action: str,
    actor_id: str | None,
    target: str = "",
    account_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    await sdb.insert(
        "audit_log",
        {"scope": scope, "action": action, "actor_id": actor_id, "account_id": account_id, "target": target, "details": details or {}},
    )

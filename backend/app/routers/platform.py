from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..deps import PlatformAdmin, ServiceDb, get_platform_admin
from ..db import Db

router = APIRouter(prefix="/v1/platform", tags=["platform"])


@router.get("/audit")
async def audit_log(
    _: Annotated[PlatformAdmin, Depends(get_platform_admin)],
    sdb: ServiceDb,
    limit: int = Query(100, ge=1, le=500),
    action: str | None = Query(None, max_length=60, description="Exact action, or a prefix ending in * (e.g. payment.*)"),
    account_id: str | None = None,
    actor_id: str | None = None,
    scope: str | None = Query(None, pattern="^(account|platform)$"),
    days: int | None = Query(None, ge=1, le=365),
):
    """Newest first: every admin and account action the backend recorded, optionally filtered."""
    filters: dict = {}
    if action:
        filters["action"] = ("ilike", action) if action.endswith("*") else action
    if account_id:
        filters["account_id"] = account_id
    if actor_id:
        filters["actor_id"] = actor_id
    if scope:
        filters["scope"] = scope
    if days:
        filters["created_at"] = ("gte", (datetime.now(timezone.utc) - timedelta(days=days)).isoformat())
    rows: list = await sdb.select("audit_log", filters or None, order="created_at.desc", limit=limit)
    return rows


# ------------------------------------------------------------- admin team
from fastapi import HTTPException  # noqa: E402

from .. import audit  # noqa: E402
from ..auth_admin import AuthAdmin, AuthAdminError  # noqa: E402
from ..deps import get_auth_admin, require_platform_role  # noqa: E402
from ..schemas import AdminIn, AdminRolePatch  # noqa: E402

Super = Annotated[PlatformAdmin, Depends(require_platform_role())]  # super admins only


async def _admins(sdb) -> list[dict]:
    out = []
    for a in await sdb.select("platform_admins", order="created_at.asc"):
        p = (await sdb.select("profiles", {"user_id": a["user_id"]}, limit=1)) or [{}]
        out.append({"user_id": a["user_id"], "role": a["role"], "name": p[0].get("full_name") or "", "email": p[0].get("email") or "", "since": a.get("created_at")})
    return out


async def _keep_a_super_admin(sdb, user_id: str) -> None:
    supers = [a for a in await sdb.select("platform_admins") if a["role"] == "super_admin"]
    if len(supers) <= 1 and supers and supers[0]["user_id"] == user_id:
        raise HTTPException(409, "AutoShift needs at least one super admin")


@router.get("/admins")
async def admins(_: Annotated[PlatformAdmin, Depends(get_platform_admin)], sdb: ServiceDb):
    return await _admins(sdb)


@router.post("/admins", status_code=201)
async def add_admin(body: AdminIn, me: Super, sdb: ServiceDb, auth: Annotated[AuthAdmin, Depends(get_auth_admin)]):
    try:
        user_id = await auth.invite(body.email.strip().lower(), body.name.strip())
    except AuthAdminError as exc:
        raise HTTPException(502, str(exc)) from exc
    if await sdb.select("platform_admins", {"user_id": user_id}, limit=1):
        raise HTTPException(409, "Already on the admin team")
    await sdb.insert("platform_admins", {"user_id": user_id, "role": body.role})
    await audit.record(sdb, scope="platform", action="admin.add", actor_id=me.user.id, target=user_id, details={"email": body.email, "role": body.role})
    return next(a for a in await _admins(sdb) if a["user_id"] == user_id)


@router.patch("/admins/{user_id}")
async def change_admin(user_id: str, body: AdminRolePatch, me: Super, sdb: ServiceDb):
    if not await sdb.select("platform_admins", {"user_id": user_id}, limit=1):
        raise HTTPException(404, "Not on the admin team")
    if body.role != "super_admin":
        await _keep_a_super_admin(sdb, user_id)
    await sdb.update("platform_admins", {"user_id": user_id}, {"role": body.role})
    await audit.record(sdb, scope="platform", action="admin.role", actor_id=me.user.id, target=user_id, details={"role": body.role})
    return next(a for a in await _admins(sdb) if a["user_id"] == user_id)


@router.delete("/admins/{user_id}", status_code=204)
async def remove_admin(user_id: str, me: Super, sdb: ServiceDb):
    if user_id == me.user.id:
        raise HTTPException(400, "You can't remove yourself")
    if not await sdb.select("platform_admins", {"user_id": user_id}, limit=1):
        raise HTTPException(404, "Not on the admin team")
    await _keep_a_super_admin(sdb, user_id)
    await sdb.delete("platform_admins", {"user_id": user_id})
    # Platform API keys this person made stop working with them.
    for k in await sdb.select("mcp_keys", {"user_id": user_id, "kind": "platform"}):
        if not k.get("revoked_at"):
            await sdb.update("mcp_keys", {"id": k["id"]}, {"revoked_at": datetime.now(timezone.utc).isoformat()})
    await audit.record(sdb, scope="platform", action="admin.remove", actor_id=me.user.id, target=user_id)


# -------------------------------------------------------- platform settings
from .. import platform_settings  # noqa: E402
from ..schemas import MetaFeesSetting  # noqa: E402


@router.get("/settings")
async def settings_view(_: Annotated[PlatformAdmin, Depends(get_platform_admin)], sdb: ServiceDb):
    return {"meta_fees_billed_to": await platform_settings.get(sdb, "meta_fees_billed_to")}


@router.put("/settings/meta-fees")
async def set_meta_fees(body: MetaFeesSetting, me: Super, sdb: ServiceDb):
    """Who Meta bills for WhatsApp messages: each business ("business") or AutoShift's credit line ("autoshift")."""
    if await sdb.select("platform_settings", {"key": "meta_fees_billed_to"}, limit=1):
        await sdb.update("platform_settings", {"key": "meta_fees_billed_to"}, {"value": body.billed_to, "updated_by": me.user.id})
    else:
        await sdb.insert("platform_settings", {"key": "meta_fees_billed_to", "value": body.billed_to, "updated_by": me.user.id})
    await audit.record(sdb, scope="platform", action="settings.meta_fees", actor_id=me.user.id, target="meta_fees_billed_to", details={"billed_to": body.billed_to})
    return {"meta_fees_billed_to": body.billed_to}

"""API keys for the MCP server and automation tools.

The plaintext key is returned once, at creation. Only its hash is stored.
Keys can't create keys: minting needs a real login."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .. import audit
from ..deps import AdminMember, PlatformAdmin, ServiceDb, get_platform_admin
from ..schemas import KeyCreate
from ..security import new_api_key

router = APIRouter(tags=["api-keys"])
PUBLIC = ("id", "prefix", "name", "kind", "scope", "expires_at", "revoked_at", "last_used_at", "created_at")


def _public(row: dict) -> dict:
    return {k: row.get(k) for k in PUBLIC}


async def _mint(sdb, *, body: KeyCreate, kind: str, user_id: str, account_id: str | None) -> dict:
    plaintext, digest, prefix = new_api_key()
    expires = (datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)).isoformat() if body.expires_in_days else None
    row = await sdb.insert("mcp_keys", {"key_hash": digest, "prefix": prefix, "name": body.name.strip(), "kind": kind, "scope": body.scope, "account_id": account_id, "user_id": user_id, "expires_at": expires})
    return {**_public(row), "key": plaintext}


def _login_only(user) -> None:
    if user.key_id:
        raise HTTPException(403, "Sign in to create API keys; a key can't create another key")


@router.post("/v1/mcp-keys", status_code=201)
async def create_key(body: KeyCreate, ctx: AdminMember, sdb: ServiceDb):
    _login_only(ctx.user)
    out = await _mint(sdb, body=body, kind="account", user_id=ctx.user.id, account_id=ctx.account_id)
    await audit.record(sdb, scope="account", action="api_key.create", actor_id=ctx.user.id, account_id=ctx.account_id, target=out["id"], details={"scope": body.scope, "name": body.name})
    return out


@router.get("/v1/mcp-keys")
async def list_keys(ctx: AdminMember, sdb: ServiceDb):
    rows = await sdb.select("mcp_keys", {"account_id": ctx.account_id, "kind": "account"}, order="created_at.desc")
    return [_public(r) for r in rows]


@router.delete("/v1/mcp-keys/{key_id}", status_code=204)
async def revoke_key(key_id: str, ctx: AdminMember, sdb: ServiceDb):
    rows = await sdb.select("mcp_keys", {"id": key_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Key not found")
    await sdb.update("mcp_keys", {"id": key_id, "account_id": ctx.account_id}, {"revoked_at": datetime.now(timezone.utc).isoformat()})
    await audit.record(sdb, scope="account", action="api_key.revoke", actor_id=ctx.user.id, account_id=ctx.account_id, target=key_id)


SuperAdmin = Annotated[PlatformAdmin, Depends(get_platform_admin)]


def _super(admin: PlatformAdmin) -> None:
    _login_only(admin.user)
    if admin.role != "super_admin":
        raise HTTPException(403, "Only super admins manage platform keys")


@router.post("/v1/platform/mcp-keys", status_code=201)
async def create_platform_key(body: KeyCreate, admin: SuperAdmin, sdb: ServiceDb):
    _super(admin)
    out = await _mint(sdb, body=body, kind="platform", user_id=admin.user.id, account_id=None)
    await audit.record(sdb, scope="platform", action="platform_key.create", actor_id=admin.user.id, target=out["id"], details={"scope": body.scope, "name": body.name})
    return out


@router.get("/v1/platform/mcp-keys")
async def list_platform_keys(admin: SuperAdmin, sdb: ServiceDb):
    _super(admin)
    return [_public(r) for r in await sdb.select("mcp_keys", {"kind": "platform"}, order="created_at.desc")]


@router.delete("/v1/platform/mcp-keys/{key_id}", status_code=204)
async def revoke_platform_key(key_id: str, admin: SuperAdmin, sdb: ServiceDb):
    _super(admin)
    rows = await sdb.select("mcp_keys", {"id": key_id, "kind": "platform"}, limit=1)
    if not rows:
        raise HTTPException(404, "Key not found")
    await sdb.update("mcp_keys", {"id": key_id}, {"revoked_at": datetime.now(timezone.utc).isoformat()})
    await audit.record(sdb, scope="platform", action="platform_key.revoke", actor_id=admin.user.id, target=key_id)

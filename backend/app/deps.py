"""Request dependencies: who is calling, which account, which role."""

from dataclasses import dataclass
from typing import Annotated

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, Request

from .config import Settings, get_settings
from .db import Db, service_db, user_db
from .auth_admin import AuthAdmin, SupabaseAuthAdmin
from .llm import HttpLlm, Llm
from .razorpay import RazorpayClient
from .security import KEY_PREFIX, AuthError, TokenUser, hash_key, verify_token

ROLE_ORDER = {"viewer": 0, "agent": 1, "admin": 2, "owner": 3}


def get_service_db(settings: Annotated[Settings, Depends(get_settings)]) -> Db:
    return service_db(settings)


def get_auth_admin(settings: Annotated[Settings, Depends(get_settings)]) -> AuthAdmin:
    return SupabaseAuthAdmin(settings)


def get_llm() -> Llm:
    return HttpLlm()


def get_razorpay(settings: Annotated[Settings, Depends(get_settings)]) -> RazorpayClient:
    return RazorpayClient(settings)


async def get_token_user(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    sdb: Annotated[Db, Depends(get_service_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> TokenUser:
    """A login token, or an API key (asmcp_...). Keys are looked up by hash and may be read-only."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing login token")
    token = authorization[7:].strip()
    if token.startswith(KEY_PREFIX):
        rows = await sdb.select("mcp_keys", {"key_hash": hash_key(token)}, limit=1)
        key = rows[0] if rows else None
        if not key or key.get("revoked_at"):
            raise HTTPException(401, "Invalid or revoked API key")
        if key.get("expires_at") and datetime.fromisoformat(str(key["expires_at"]).replace("Z", "+00:00")) <= datetime.now(timezone.utc):
            raise HTTPException(401, "This API key has expired")
        if key["scope"] == "read" and request.method not in ("GET", "HEAD", "OPTIONS"):
            raise HTTPException(403, "This API key is read-only")
        await sdb.update("mcp_keys", {"id": key["id"]}, {"last_used_at": datetime.now(timezone.utc).isoformat()})
        return TokenUser(id=str(key["user_id"]), email=None, token=token, key_id=str(key["id"]), key_kind=key["kind"], key_scope=key["scope"], key_account_id=str(key["account_id"]) if key.get("account_id") else None)
    try:
        return verify_token(token, settings)
    except AuthError as exc:
        raise HTTPException(401, str(exc)) from exc


def get_user_db(
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[TokenUser, Depends(get_token_user)],
    sdb: Annotated[Db, Depends(get_service_db)],
) -> Db:
    """Database calls made as the user, so row-level security applies too.
    API keys can't carry a user session, so they use the trusted connection; every
    query still filters by account_id in code."""
    if user.key_id:
        return sdb
    return user_db(settings, user.token)


@dataclass(frozen=True)
class AccountCtx:
    user: TokenUser
    account_id: str
    role: str


async def get_account(
    user: Annotated[TokenUser, Depends(get_token_user)],
    sdb: Annotated[Db, Depends(get_service_db)],
) -> AccountCtx:
    """The caller's account and role, read from their profile (trusted lookup)."""
    if user.key_id and user.key_kind != "account":
        raise HTTPException(403, "This API key is for platform use, not a workspace")
    rows = await sdb.select("profiles", {"user_id": user.id}, limit=1)
    if not rows or not rows[0].get("account_id") or not rows[0].get("account_role"):
        raise HTTPException(403, "This login has no workspace")
    if user.key_id and str(rows[0]["account_id"]) != user.key_account_id:
        raise HTTPException(403, "This API key no longer matches its workspace")
    acct = await sdb.select("accounts", {"id": str(rows[0]["account_id"])}, limit=1)
    if acct and acct[0].get("status") == "suspended":
        raise HTTPException(403, "This business is suspended. Contact AutoShift support.")
    return AccountCtx(user=user, account_id=str(rows[0]["account_id"]), role=str(rows[0]["account_role"]))


def require_role(minimum: str):
    """Dependency factory: the caller must hold at least this role."""

    async def check(ctx: Annotated[AccountCtx, Depends(get_account)]) -> AccountCtx:
        if ROLE_ORDER.get(ctx.role, -1) < ROLE_ORDER[minimum]:
            raise HTTPException(403, f"This needs the {minimum} role")
        return ctx

    return check


@dataclass(frozen=True)
class PlatformAdmin:
    user: TokenUser
    role: str


async def get_platform_admin(
    user: Annotated[TokenUser, Depends(get_token_user)],
    sdb: Annotated[Db, Depends(get_service_db)],
) -> PlatformAdmin:
    """Platform staff only; checked against the platform_admins table."""
    if user.key_id and user.key_kind != "platform":
        raise HTTPException(403, "Workspace API keys can't use platform routes")
    rows = await sdb.select("platform_admins", {"user_id": user.id}, limit=1)
    if not rows:
        raise HTTPException(403, "Platform admins only")
    return PlatformAdmin(user=user, role=str(rows[0]["role"]))


def require_platform_role(*allowed: str):
    async def check(admin: Annotated[PlatformAdmin, Depends(get_platform_admin)]) -> PlatformAdmin:
        if admin.role != "super_admin" and admin.role not in allowed:
            raise HTTPException(403, "Your admin role can't do this")
        return admin

    return check


Rzp = Annotated[RazorpayClient, Depends(get_razorpay)]
Member = Annotated[AccountCtx, Depends(get_account)]
AdminMember = Annotated[AccountCtx, Depends(require_role("admin"))]
UserDb = Annotated[Db, Depends(get_user_db)]
ServiceDb = Annotated[Db, Depends(get_service_db)]

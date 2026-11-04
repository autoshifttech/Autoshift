"""Request dependencies: who is calling, which account, which role."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from .config import Settings, get_settings
from .db import Db, service_db, user_db
from .razorpay import RazorpayClient
from .security import AuthError, TokenUser, verify_token

ROLE_ORDER = {"viewer": 0, "agent": 1, "admin": 2, "owner": 3}


def get_service_db(settings: Annotated[Settings, Depends(get_settings)]) -> Db:
    return service_db(settings)


def get_razorpay(settings: Annotated[Settings, Depends(get_settings)]) -> RazorpayClient:
    return RazorpayClient(settings)


def get_token_user(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> TokenUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing login token")
    try:
        return verify_token(authorization[7:].strip(), settings)
    except AuthError as exc:
        raise HTTPException(401, str(exc)) from exc


def get_user_db(
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[TokenUser, Depends(get_token_user)],
) -> Db:
    """Database calls made as the user, so row-level security applies too."""
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
    rows = await sdb.select("profiles", {"id": user.id}, limit=1)
    if not rows or not rows[0].get("account_id") or not rows[0].get("account_role"):
        raise HTTPException(403, "This login has no workspace")
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

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .. import audit, closing
from ..deps import Member, Rzp, ServiceDb, get_token_user
from ..security import TokenUser
from ..schemas import CloseBusiness, CloseRequest

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me")
async def me(ctx: Member, sdb: ServiceDb):
    """Who is calling: user, workspace, role, and whether they are platform staff."""
    admin = await sdb.select("platform_admins", {"user_id": ctx.user.id}, limit=1)
    acct = (await sdb.select("accounts", {"id": ctx.account_id}, limit=1)) or [{}]
    return {
        "account_name": acct[0].get("name", ""),
        "user": {"id": ctx.user.id, "email": ctx.user.email},
        "account_id": ctx.account_id,
        "role": ctx.role,
        "platform_admin": admin[0]["role"] if admin else None,
    }


@router.get("/me/key")
async def my_key(user: Annotated[TokenUser, Depends(get_token_user)]):
    """What kind of credential is calling: an API key's kind and scope, or a login. Used by the MCP
    server to show each key only the tools it can use."""
    return {"kind": user.key_kind or "login", "scope": user.key_scope or "write", "key_id": user.key_id}


@router.post("/account/close")
async def close_my_business(body: CloseBusiness, ctx: Member, sdb: ServiceDb, rzp: Rzp):
    """The owner closes their business. Needs a real sign-in (not an API key) and the business name typed."""
    if ctx.role != "owner":
        raise HTTPException(403, "Only the owner can close the business")
    if ctx.user.key_id:
        raise HTTPException(403, "Sign in to close the business; an API key can't do this")
    return await closing.close_business(sdb, rzp, ctx.account_id, confirm_name=body.confirm_name, actor_id=ctx.user.id, scope="account")


def _owner_signed_in(ctx) -> None:
    if ctx.role != "owner":
        raise HTTPException(403, "Only the owner can delete the business")
    if ctx.user.key_id:
        raise HTTPException(403, "Sign in to do this; an API key can't")


@router.get("/account/close-request")
async def close_request(ctx: Member, sdb: ServiceDb):
    a = (await sdb.select("accounts", {"id": ctx.account_id}, limit=1))[0]
    return {"close_after": a.get("close_after"), "reason": a.get("close_reason") or ""}


@router.post("/account/close-request")
async def request_close(body: CloseRequest, ctx: Member, sdb: ServiceDb):
    """Schedule deleting the business. Nothing is removed until the grace period ends; it can be cancelled."""
    _owner_signed_in(ctx)
    a = (await sdb.select("accounts", {"id": ctx.account_id}, limit=1))[0]
    if body.confirm_name.strip() != a["name"].strip():
        raise HTTPException(422, "Type the business name exactly to confirm")
    when = closing.grace_end()
    await sdb.update("accounts", {"id": ctx.account_id}, {"close_after": when, "close_reason": body.reason})
    await audit.record(sdb, scope="account", action="business.close_requested", actor_id=ctx.user.id, account_id=ctx.account_id, target=ctx.account_id, details={"close_after": when, "reason": body.reason})
    return {"close_after": when, "reason": body.reason}


@router.delete("/account/close-request")
async def cancel_close(ctx: Member, sdb: ServiceDb):
    _owner_signed_in(ctx)
    await sdb.update("accounts", {"id": ctx.account_id}, {"close_after": None, "close_reason": None})
    await audit.record(sdb, scope="account", action="business.close_cancelled", actor_id=ctx.user.id, account_id=ctx.account_id, target=ctx.account_id)
    return {"close_after": None, "reason": ""}

"""A business's own team: who is on it, their roles, and invite links.

Same rules as the app's database functions (set_member_role, remove_account_member):
admins and owners manage the team; nobody changes their own role; the owner can't be
demoted, removed or created here (ownership transfer is its own step); a removed person
gets an empty workspace of their own so their login keeps working.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .. import audit, usage
from ..config import Settings, get_settings
from ..deps import AdminMember, Member, ServiceDb
from ..schemas import InviteCreate, TeamRole

router = APIRouter(prefix="/v1/team", tags=["team"])


def _member(r: dict) -> dict:
    return {"user_id": r["user_id"], "name": r.get("full_name") or "", "email": r.get("email") or "", "role": r["account_role"]}


@router.get("")
async def team(ctx: Member, sdb: ServiceDb):
    return [_member(r) for r in await sdb.select("profiles", {"account_id": ctx.account_id})]


async def _target(sdb, ctx, user_id: str) -> dict:
    if user_id == ctx.user.id:
        raise HTTPException(400, "You can't change or remove yourself here")
    rows = await sdb.select("profiles", {"user_id": user_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Not on your team")
    if rows[0]["account_role"] == "owner":
        raise HTTPException(400, "The owner can't be changed or removed; transfer ownership first")
    return rows[0]


@router.patch("/{user_id}")
async def change_role(user_id: str, body: TeamRole, ctx: AdminMember, sdb: ServiceDb):
    if body.role == "owner":
        raise HTTPException(400, "Use ownership transfer to make someone the owner")
    t = await _target(sdb, ctx, user_id)
    await sdb.update("profiles", {"user_id": user_id, "account_id": ctx.account_id}, {"account_role": body.role})
    await audit.record(sdb, scope="account", action="team.role", actor_id=ctx.user.id, account_id=ctx.account_id, target=user_id, details={"from": t["account_role"], "to": body.role})
    return {**_member(t), "role": body.role}


@router.delete("/{user_id}", status_code=204)
async def remove(user_id: str, ctx: AdminMember, sdb: ServiceDb):
    t = await _target(sdb, ctx, user_id)
    # Their login keeps working: they get an empty workspace of their own, as the app does.
    own = await sdb.insert("accounts", {"name": (t.get("full_name") or "My workspace")[:120], "owner_user_id": user_id})
    await sdb.update("profiles", {"user_id": user_id}, {"account_id": own["id"], "account_role": "owner"})
    await audit.record(sdb, scope="account", action="team.remove", actor_id=ctx.user.id, account_id=ctx.account_id, target=user_id, details={"email": t.get("email")})


# ---------------------------------------------------------------- invitations
def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _pending(rows: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    return [r for r in rows if not r.get("accepted_at") and str(r["expires_at"]) > now]


@router.get("/invitations")
async def invitations(ctx: AdminMember, sdb: ServiceDb):
    rows = _pending(await sdb.select("account_invitations", {"account_id": ctx.account_id}, order="created_at.desc"))
    return [{k: r.get(k) for k in ("id", "role", "label", "created_at", "expires_at")} for r in rows]


@router.post("/invitations", status_code=201)
async def invite(body: InviteCreate, ctx: AdminMember, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    """A one-time join link. Only its hash is stored; the link is shown once."""
    seats = (await usage.plan_for(sdb, ctx.account_id)).get("seats")
    if seats is not None:
        taken = await sdb.count("profiles", {"account_id": ctx.account_id}) + len(_pending(await sdb.select("account_invitations", {"account_id": ctx.account_id})))
        if taken >= seats:
            raise HTTPException(409, f"Your plan allows {seats} people, including pending invites. Upgrade or revoke an invite.")
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
    row = await sdb.insert("account_invitations", {"account_id": ctx.account_id, "token_hash": _hash(token), "role": body.role, "label": body.label.strip() or None, "created_by_user_id": ctx.user.id, "expires_at": expires.isoformat()})
    await audit.record(sdb, scope="account", action="team.invite", actor_id=ctx.user.id, account_id=ctx.account_id, target=row["id"], details={"role": body.role})
    return {"id": row["id"], "role": body.role, "label": body.label, "expires_at": row["expires_at"], "url": f"{settings.site_url.rstrip('/')}/join/{token}"}


@router.delete("/invitations/{invite_id}", status_code=204)
async def revoke(invite_id: str, ctx: AdminMember, sdb: ServiceDb):
    if not await sdb.select("account_invitations", {"id": invite_id, "account_id": ctx.account_id}, limit=1):
        raise HTTPException(404, "Invite not found")
    await sdb.delete("account_invitations", {"id": invite_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="team.invite_revoke", actor_id=ctx.user.id, account_id=ctx.account_id, target=invite_id)

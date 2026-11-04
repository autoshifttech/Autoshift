"""Platform staff manage businesses (accounts) and their teams."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .. import audit, wallet
from ..auth_admin import AuthAdmin, AuthAdminError
from ..deps import PlatformAdmin, ServiceDb, get_auth_admin, get_platform_admin, require_platform_role
from ..schemas import BusinessCreate, BusinessPatch, MemberAdd, MemberPatch, NoteCreate, SubscriptionChange, Suspend

router = APIRouter(prefix="/v1/platform/businesses", tags=["businesses"])
AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]
Manager = Annotated[PlatformAdmin, Depends(require_platform_role("support"))]  # support and super_admin
SuperOnly = Annotated[PlatformAdmin, Depends(require_platform_role())]  # super_admin only
Auth = Annotated[AuthAdmin, Depends(get_auth_admin)]

TRIAL_DAYS = 14


async def _business(sdb, account_id: str) -> dict:
    rows = await sdb.select("accounts", {"id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Business not found")
    return rows[0]


def _view(acct: dict, *, members: list[dict], sub: dict | None, plan: dict | None, wallet_paise: int, usage_30d: dict[str, int], owner: dict | None) -> dict:
    cycle = sub["cycle"] if sub else None
    mrr = 0
    if sub and sub["status"] == "active" and plan:
        mrr = plan["monthly_paise"] if cycle == "monthly" else round(plan["monthly_paise"] * 10 / 12)
    return {
        "id": acct["id"],
        "name": acct["name"],
        "industry": acct.get("industry", ""),
        "city": acct.get("city", ""),
        "status": acct.get("status", "active"),
        "suspended_reason": acct.get("suspended_reason"),
        "created_at": acct.get("created_at"),
        "owner_user_id": acct.get("owner_user_id"),
        "owner": {"name": (owner or {}).get("full_name", ""), "email": (owner or {}).get("email", "")},
        "members": len(members),
        "plan_id": sub["plan_id"] if sub else None,
        "cycle": cycle,
        "subscription_status": sub["status"] if sub else None,
        "trial_ends_at": sub["trial_ends_at"] if sub else None,
        "current_period_end": sub.get("current_period_end") if sub else None,
        "cancel_at_period_end": bool(sub and sub.get("cancel_at_period_end")),
        "mrr_paise": mrr,
        "wallet_paise": wallet_paise,
        "usage_30d": usage_30d,
    }


async def _usage_by_account(sdb) -> dict[str, dict[str, int]]:
    """Messages and AI replies charged in the last 30 days, per business, from the ledger."""
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    out: dict[str, dict[str, int]] = {}
    for e in await sdb.select("wallet_ledger", order="id.desc", limit=5000):
        if not e["kind"].startswith("charge_") or str(e["created_at"]) < since:
            continue
        kind = e["kind"].removeprefix("charge_")
        per = {"marketing": 99, "utility": 15, "authentication": 15, "ai": 25}.get(kind)
        out.setdefault(e["account_id"], {})[kind] = out.get(e["account_id"], {}).get(kind, 0) + (round(-e["amount_paise"] / per) if per else 0)
    return out


def _group(rows: list[dict], key: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in rows:
        if r.get(key):
            out.setdefault(str(r[key]), []).append(r)
    return out


async def _views(sdb, accounts: list[dict]) -> list[dict]:
    """The business list in a handful of queries (not a few per business)."""
    profiles = _group(await sdb.select("profiles"), "account_id")
    subs = {s["account_id"]: s for s in await sdb.select("subscriptions")}
    plans = {p["id"]: p for p in await sdb.select("plans")}
    balances = {b["account_id"]: int(b["balance_paise"]) for b in await sdb.select("wallet_balances")}
    usage = await _usage_by_account(sdb)
    out = []
    for a in accounts:
        members = profiles.get(str(a["id"]), [])
        owner = next((m for m in members if m.get("account_role") == "owner"), None)
        sub = subs.get(a["id"])
        out.append(_view(a, members=members, sub=sub, plan=plans.get(sub["plan_id"]) if sub else None, wallet_paise=balances.get(a["id"], 0), usage_30d=usage.get(a["id"], {}), owner=owner))
    return out


async def _summary(sdb, acct: dict) -> dict:
    return (await _views(sdb, [acct]))[0]


# Tables that show an account has real data. A login's automatic, untouched personal
# account has none of them and can be replaced; anything else must never be deleted.
USED_TABLES = ("subscriptions", "wallet_balances", "assistants", "contacts", "flows", "whatsapp_config")


async def _untouched_personal_account(sdb, profile: dict | None) -> str | None:
    """The account Supabase created for a brand-new login, if it is still empty.
    Returns None when the person has no account. Raises 409 when they belong to a real business."""
    if not profile or not profile.get("account_id"):
        return None
    acct_id = str(profile["account_id"])
    others = [m for m in await sdb.select("profiles", {"account_id": acct_id}) if str(m["user_id"]) != str(profile["user_id"])]
    if others or profile.get("account_role") != "owner":
        raise HTTPException(409, "That person already belongs to a business")
    for table in USED_TABLES:
        if await sdb.select(table, {"account_id": acct_id}, limit=1):
            raise HTTPException(409, "That person already belongs to a business")
    return acct_id


@router.get("")
async def list_businesses(_: AnyStaff, sdb: ServiceDb):
    return await _views(sdb, await sdb.select("accounts", order="created_at.desc", limit=500))


@router.get("/{account_id}")
async def get_business(account_id: str, _: AnyStaff, sdb: ServiceDb):
    out = await _summary(sdb, await _business(sdb, account_id))
    out["team"] = await _team(sdb, account_id)
    out["contacts"] = await sdb.count("contacts", {"account_id": account_id})
    out["notes"] = await _notes(sdb, account_id)
    return out


@router.post("", status_code=201)
async def create_business(body: BusinessCreate, admin: Manager, sdb: ServiceDb, auth: Auth):
    plan = await sdb.select("plans", {"id": body.plan_id}, limit=1)
    if not plan:
        raise HTTPException(422, "Unknown plan")
    try:
        owner_id = await auth.invite(body.owner.email, body.owner.name)
    except AuthAdminError as exc:
        raise HTTPException(502, str(exc)) from exc
    found = await sdb.select("profiles", {"user_id": owner_id}, limit=1)
    profile = found[0] if found else None
    personal = await _untouched_personal_account(sdb, profile)
    fields = {"name": body.name, "industry": body.industry, "city": body.city}
    if personal:  # reuse the empty account the login came with
        rows = await sdb.update("accounts", {"id": personal}, fields)
        acct = rows[0]
    else:
        acct = await sdb.insert("accounts", {**fields, "owner_user_id": owner_id})
        patch = {"account_id": acct["id"], "account_role": "owner"}
        if profile:
            await sdb.update("profiles", {"user_id": owner_id}, patch)
        else:
            await sdb.insert("profiles", {"user_id": owner_id, "full_name": body.owner.name, "email": body.owner.email, **patch})
    ends = datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)
    await sdb.insert("subscriptions", {"account_id": acct["id"], "plan_id": body.plan_id, "cycle": "monthly", "status": "trialing", "trial_ends_at": ends.isoformat()})
    await audit.record(sdb, scope="platform", action="business.create", actor_id=admin.user.id, account_id=acct["id"], target=acct["id"], details={"name": body.name, "owner": body.owner.email, "plan": body.plan_id})
    return await _summary(sdb, acct)


@router.patch("/{account_id}")
async def update_business(account_id: str, body: BusinessPatch, admin: Manager, sdb: ServiceDb):
    await _business(sdb, account_id)
    patch = body.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        raise HTTPException(422, "Nothing to change")
    rows = await sdb.update("accounts", {"id": account_id}, patch)
    await audit.record(sdb, scope="platform", action="business.update", actor_id=admin.user.id, account_id=account_id, target=account_id, details={"fields": sorted(patch)})
    return await _summary(sdb, rows[0])


@router.post("/{account_id}/suspend")
async def suspend(account_id: str, body: Suspend, admin: Manager, sdb: ServiceDb):
    """A suspended business can't use the app or its API keys; its data is kept."""
    await _business(sdb, account_id)
    patch = {"status": "suspended", "suspended_reason": body.reason} if body.suspended else {"status": "active", "suspended_reason": None}
    rows = await sdb.update("accounts", {"id": account_id}, patch)
    await audit.record(sdb, scope="platform", action="business.suspend" if body.suspended else "business.reactivate", actor_id=admin.user.id, account_id=account_id, target=account_id, details={"reason": body.reason})
    return await _summary(sdb, rows[0])


@router.delete("/{account_id}", status_code=204)
async def delete_business(account_id: str, admin: SuperOnly, sdb: ServiceDb):
    acct = await _business(sdb, account_id)
    # Money records (the wallet ledger, orders, invoices) must be kept, and the ledger can't be edited,
    # so a business that ever handled money can be blocked but not deleted.
    for table in ("wallet_ledger", "invoices", "payment_orders"):
        if await sdb.count(table, {"account_id": account_id}):
            raise HTTPException(409, "This business has payment history, which must be kept. Block it instead.")
    await sdb.delete("accounts", {"id": account_id})
    await audit.record(sdb, scope="platform", action="business.delete", actor_id=admin.user.id, account_id=None, target=account_id, details={"name": acct["name"]})


# ------------------------------------------------------------------ team
async def _team(sdb, account_id: str) -> list[dict]:
    rows = await sdb.select("profiles", {"account_id": account_id})
    return [{"user_id": r["user_id"], "name": r.get("full_name", ""), "email": r.get("email", ""), "role": r["account_role"]} for r in rows]


@router.get("/{account_id}/team")
async def team(account_id: str, _: AnyStaff, sdb: ServiceDb):
    await _business(sdb, account_id)
    return await _team(sdb, account_id)


@router.post("/{account_id}/team", status_code=201)
async def add_member(account_id: str, body: MemberAdd, admin: Manager, sdb: ServiceDb, auth: Auth):
    await _business(sdb, account_id)
    current = await sdb.select("profiles", {"account_id": account_id})
    sub = await sdb.select("subscriptions", {"account_id": account_id}, limit=1)
    seats = (await sdb.select("plans", {"id": sub[0]["plan_id"]}, limit=1))[0]["seats"] if sub else None
    if seats is not None and len(current) >= seats:
        raise HTTPException(409, f"This plan allows {seats} people")
    try:
        user_id = await auth.invite(body.email, body.name)
    except AuthAdminError as exc:
        raise HTTPException(502, str(exc)) from exc
    found = await sdb.select("profiles", {"user_id": user_id}, limit=1)
    existing = found[0] if found else None
    personal = await _untouched_personal_account(sdb, existing)
    patch = {"account_id": account_id, "account_role": body.role}
    if existing:
        await sdb.update("profiles", {"user_id": user_id}, patch)
    else:
        await sdb.insert("profiles", {"user_id": user_id, "full_name": body.name, "email": body.email, **patch})
    if personal:  # their automatic empty account is no longer needed
        await sdb.delete("accounts", {"id": personal})
    await audit.record(sdb, scope="platform", action="business.member_add", actor_id=admin.user.id, account_id=account_id, target=user_id, details={"email": body.email, "role": body.role})
    return {"user_id": user_id, "email": body.email, "role": body.role}


async def _owners(sdb, account_id: str) -> list[dict]:
    return [m for m in await sdb.select("profiles", {"account_id": account_id}) if m["account_role"] == "owner"]


@router.patch("/{account_id}/team/{user_id}")
async def change_role(account_id: str, user_id: str, body: MemberPatch, admin: Manager, sdb: ServiceDb):
    rows = await sdb.select("profiles", {"account_id": account_id, "user_id": user_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Not on this team")
    if rows[0]["account_role"] == "owner" and body.role != "owner" and len(await _owners(sdb, account_id)) <= 1:
        raise HTTPException(409, "A business needs an owner")
    await sdb.update("profiles", {"account_id": account_id, "user_id": user_id}, {"account_role": body.role})
    await audit.record(sdb, scope="platform", action="business.member_role", actor_id=admin.user.id, account_id=account_id, target=user_id, details={"role": body.role})
    return {"user_id": user_id, "role": body.role}


@router.delete("/{account_id}/team/{user_id}", status_code=204)
async def remove_member(account_id: str, user_id: str, admin: Manager, sdb: ServiceDb):
    rows = await sdb.select("profiles", {"account_id": account_id, "user_id": user_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Not on this team")
    if rows[0]["account_role"] == "owner" and len(await _owners(sdb, account_id)) <= 1:
        raise HTTPException(409, "A business needs an owner")
    await sdb.update("profiles", {"account_id": account_id, "user_id": user_id}, {"account_id": None, "account_role": None})
    await audit.record(sdb, scope="platform", action="business.member_remove", actor_id=admin.user.id, account_id=account_id, target=user_id, details={})


# ---------------------------------------------------------- plan, trial, notes
@router.post("/{account_id}/subscription")
async def change_subscription(account_id: str, body: SubscriptionChange, admin: Manager, sdb: ServiceDb):
    """Move a business to another plan or give it more trial days. The business is not charged by this."""
    await _business(sdb, account_id)
    if not body.plan_id and not body.extend_trial_days:
        raise HTTPException(422, "Nothing to change")
    rows = await sdb.select("subscriptions", {"account_id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "This business has no subscription yet")
    if rows[0].get("razorpay_subscription_id") and rows[0]["status"] in ("trialing", "active", "past_due"):
        # Razorpay already holds the price and the first-charge date; changing them here would make
        # AutoShift and Razorpay disagree about what the business pays.
        raise HTTPException(409, "This business has set up payment with Razorpay. They need to change their plan themselves, or cancel first.")
    patch: dict = {}
    if body.plan_id:
        if not await sdb.select("plans", {"id": body.plan_id}, limit=1):
            raise HTTPException(422, "Unknown plan")
        patch["plan_id"] = body.plan_id
    if body.extend_trial_days:
        base = max(datetime.fromisoformat(str(rows[0]["trial_ends_at"]).replace("Z", "+00:00")), datetime.now(timezone.utc))
        patch["trial_ends_at"] = (base + timedelta(days=body.extend_trial_days)).isoformat()
    await sdb.update("subscriptions", {"account_id": account_id}, patch)
    await audit.record(sdb, scope="platform", action="business.subscription", actor_id=admin.user.id, account_id=account_id, target=account_id, details={**patch, "was": {"plan_id": rows[0]["plan_id"]}})
    return await _summary(sdb, await _business(sdb, account_id))


async def _notes(sdb, account_id: str) -> list[dict]:
    rows = await sdb.select("business_notes", {"account_id": account_id}, order="id.desc", limit=100)
    return [{"id": r["id"], "text": r["text"], "author": r["author_name"], "at": r["created_at"]} for r in rows]


@router.get("/{account_id}/notes")
async def notes(account_id: str, _: AnyStaff, sdb: ServiceDb):
    await _business(sdb, account_id)
    return await _notes(sdb, account_id)


@router.post("/{account_id}/notes", status_code=201)
async def add_note(account_id: str, body: NoteCreate, admin: Manager, sdb: ServiceDb):
    await _business(sdb, account_id)
    who = (await sdb.select("profiles", {"user_id": admin.user.id}, limit=1)) or [{}]
    await sdb.insert("business_notes", {"account_id": account_id, "author_id": admin.user.id, "author_name": who[0].get("full_name") or admin.user.email or "Staff", "text": body.text.strip()})
    await audit.record(sdb, scope="platform", action="business.note", actor_id=admin.user.id, account_id=account_id, target=account_id, details={})
    return await _notes(sdb, account_id)

"""Support tickets (business side and staff side) and announcements."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from .. import audit
from ..deps import Member, PlatformAdmin, ServiceDb, get_platform_admin, require_platform_role
from ..schemas import AnnouncementIn, StaffReply, TicketCreate, TicketPatch, TicketReply

from typing import Annotated
from fastapi import Depends

router = APIRouter(tags=["support"])
AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]
SupportStaff = Annotated[PlatformAdmin, Depends(require_platform_role("support"))]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ticket(t: dict, messages: list[dict], business: str | None = None) -> dict:
    out = {"id": f"T-{t['number']}", "number": t["number"], "account_id": t["account_id"], "subject": t["subject"], "category": t["category"], "priority": t["priority"], "status": t["status"], "assignee": t.get("assignee"), "created_at": t["created_at"], "updated_at": t.get("updated_at"), "messages": [{"from": m["sender"], "author": m["author"], "text": m["text"], "at": m["created_at"]} for m in messages]}
    if business is not None:
        out["business"] = business
    return out


async def _messages(sdb, number: int, *, staff: bool) -> list[dict]:
    rows = await sdb.select("support_messages", {"ticket": str(number)}, order="id.asc")
    return rows if staff else [m for m in rows if m["sender"] != "note"]


async def _author(sdb, user_id: str, fallback: str) -> str:
    p = await sdb.select("profiles", {"user_id": user_id}, limit=1)
    return (p[0].get("full_name") if p else None) or fallback


# ------------------------------------------------------------- business side
@router.get("/v1/support/tickets")
async def my_tickets(ctx: Member, sdb: ServiceDb):
    rows = await sdb.select("support_tickets", {"account_id": ctx.account_id}, order="number.desc", limit=100)
    return [_ticket(t, await _messages(sdb, t["number"], staff=False)) for t in rows]


@router.post("/v1/support/tickets", status_code=201)
async def open_ticket(body: TicketCreate, ctx: Member, sdb: ServiceDb):
    t = await sdb.insert("support_tickets", {"account_id": ctx.account_id, "subject": body.subject.strip(), "category": body.category, "priority": body.priority, "status": "open", "created_by": ctx.user.id})
    await sdb.insert("support_messages", {"ticket": t["number"], "account_id": ctx.account_id, "sender": "business", "author": await _author(sdb, ctx.user.id, "Customer"), "text": body.message.strip()})
    await audit.record(sdb, scope="account", action="support.open", actor_id=ctx.user.id, account_id=ctx.account_id, target=f"T-{t['number']}")
    return _ticket(t, await _messages(sdb, t["number"], staff=False))


async def _own(sdb, ctx, number: int) -> dict:
    rows = await sdb.select("support_tickets", {"number": str(number), "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Ticket not found")
    return rows[0]


@router.post("/v1/support/tickets/{number}/messages", status_code=201)
async def reply(number: int, body: TicketReply, ctx: Member, sdb: ServiceDb):
    await _own(sdb, ctx, number)
    await sdb.insert("support_messages", {"ticket": number, "account_id": ctx.account_id, "sender": "business", "author": await _author(sdb, ctx.user.id, "Customer"), "text": body.text.strip()})
    rows = await sdb.update("support_tickets", {"number": str(number), "account_id": ctx.account_id}, {"status": "open", "updated_at": _now()})  # a reply reopens it
    return _ticket(rows[0], await _messages(sdb, number, staff=False))


@router.get("/v1/announcements")
async def my_announcements(ctx: Member, sdb: ServiceDb):
    """Published announcements meant for this business (by trial / paying / plan)."""
    sub = (await sdb.select("subscriptions", {"account_id": ctx.account_id}, limit=1)) or [{}]
    plan, status = sub[0].get("plan_id"), sub[0].get("status", "trialing")
    now = _now()
    out = []
    for a in await sdb.select("announcements", {"draft": "false"}, order="publish_at.desc", limit=50):
        if str(a["publish_at"]) > now:
            continue
        aud = a["audience"]
        if aud == "all" or (aud == "trial" and status == "trialing") or (aud == "paying" and status == "active") or aud == plan:
            out.append({k: a[k] for k in ("id", "title", "body", "kind", "publish_at")})
    return out


# ---------------------------------------------------------------- staff side
@router.get("/v1/platform/tickets")
async def all_tickets(_: AnyStaff, sdb: ServiceDb, status: str | None = Query(None, pattern="^(open|pending|closed)$")):
    names = {a["id"]: a["name"] for a in await sdb.select("accounts")}
    rows = await sdb.select("support_tickets", {"status": status} if status else None, order="number.desc", limit=300)
    return [_ticket(t, await _messages(sdb, t["number"], staff=True), names.get(t["account_id"], "")) for t in rows]


async def _any(sdb, number: int) -> dict:
    rows = await sdb.select("support_tickets", {"number": str(number)}, limit=1)
    if not rows:
        raise HTTPException(404, "Ticket not found")
    return rows[0]


@router.patch("/v1/platform/tickets/{number}")
async def change_ticket(number: int, body: TicketPatch, admin: SupportStaff, sdb: ServiceDb):
    await _any(sdb, number)
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(422, "Nothing to change")
    rows = await sdb.update("support_tickets", {"number": str(number)}, {**patch, "updated_at": _now()})
    await audit.record(sdb, scope="platform", action="support.update", actor_id=admin.user.id, account_id=rows[0]["account_id"], target=f"T-{number}", details=patch)
    return _ticket(rows[0], await _messages(sdb, number, staff=True))


@router.post("/v1/platform/tickets/{number}/messages", status_code=201)
async def staff_reply(number: int, body: StaffReply, admin: SupportStaff, sdb: ServiceDb):
    t = await _any(sdb, number)
    author = await _author(sdb, admin.user.id, admin.user.email or "AutoShift support")
    await sdb.insert("support_messages", {"ticket": number, "account_id": t["account_id"], "sender": "note" if body.note else "admin", "author": author, "text": body.text.strip()})
    patch: dict = {"updated_at": _now()}
    if body.close:
        patch["status"] = "closed"
    elif not body.note:
        patch["status"] = "pending"  # waiting on the business
    if not t.get("assignee"):
        patch["assignee"] = author
    rows = await sdb.update("support_tickets", {"number": str(number)}, patch)
    await audit.record(sdb, scope="platform", action="support.note" if body.note else "support.reply", actor_id=admin.user.id, account_id=t["account_id"], target=f"T-{number}")
    return _ticket(rows[0], await _messages(sdb, number, staff=True))


@router.get("/v1/platform/announcements")
async def announcements(_: AnyStaff, sdb: ServiceDb):
    return await sdb.select("announcements", order="publish_at.desc", limit=200)


@router.post("/v1/platform/announcements", status_code=201)
async def publish(body: AnnouncementIn, admin: SupportStaff, sdb: ServiceDb):
    row = await sdb.insert("announcements", {**body.model_dump(exclude={"publish_at"}), "publish_at": body.publish_at or _now(), "created_by": admin.user.id})
    await audit.record(sdb, scope="platform", action="announcement.create", actor_id=admin.user.id, target=row["id"], details={"title": body.title, "audience": body.audience, "draft": body.draft})
    return row


@router.delete("/v1/platform/announcements/{announcement_id}", status_code=204)
async def unpublish(announcement_id: str, admin: SupportStaff, sdb: ServiceDb):
    if not await sdb.select("announcements", {"id": announcement_id}, limit=1):
        raise HTTPException(404, "Announcement not found")
    await sdb.delete("announcements", {"id": announcement_id})
    await audit.record(sdb, scope="platform", action="announcement.delete", actor_id=admin.user.id, target=announcement_id)

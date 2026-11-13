"""Business-side data for the MCP tools: chats, contacts, templates, broadcasts, automations,
flows, leads, opt-outs, knowledge and insights.

Every query is filtered by the caller's account_id. WhatsApp actions (send, broadcast, template
submit and sync, knowledge) go through the web app's bridge so they run the dashboard's own code;
this router does the checks first: role, blocklist, opt-outs and the 24-hour window.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .. import audit
from ..deps import AdminMember, AgentMember, Bridge, Member, ServiceDb
from ..web_bridge import BridgeError

router = APIRouter(prefix="/v1/ws", tags=["workspace"])

OPT_OUT_WORDS = {"STOP", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "OPT OUT", "OPTOUT"}
OPT_IN_WORDS = {"START", "SUBSCRIBE", "UNSTOP", "OPT IN"}
BLOCKED_TAG = "Blocked"
WINDOW = timedelta(hours=24)
MAX_LIST = 200
CONTACT_FIELDS = ("id", "name", "phone", "email", "company", "created_at")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ts(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _digits(phone: str) -> str:
    return "".join(c for c in phone or "" if c.isdigit())


def _chunks(items: list, size: int = 100):
    for i in range(0, len(items), size):
        yield items[i : i + size]


async def _bridge(bridge, ctx, action: str, **fields) -> dict:
    try:
        return await bridge.call(action, ctx.account_id, ctx.user.id, ctx.role, **fields)
    except BridgeError as exc:
        raise HTTPException(exc.status if 400 <= exc.status < 600 else 502, exc.detail) from exc


async def _contacts_by_id(sdb, account_id: str, ids: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for part in _chunks(sorted({i for i in ids if i})):
        for c in await sdb.select("contacts", {"account_id": account_id, "id": ("in", part)}):
            out[c["id"]] = c
    return out


async def _tags_for(sdb, account_id: str, contact_ids: list[str]) -> dict[str, list[str]]:
    tags = {t["id"]: t["name"] for t in await sdb.select("tags", {"account_id": account_id})}
    out: dict[str, list[str]] = {cid: [] for cid in contact_ids}
    for part in _chunks(contact_ids):
        for link in await sdb.select("contact_tags", {"contact_id": ("in", part)}):
            if link["tag_id"] in tags:
                out.setdefault(link["contact_id"], []).append(tags[link["tag_id"]])
    return out


def _contact_public(c: dict, tags: list[str] | None = None) -> dict:
    out = {k: c.get(k) for k in CONTACT_FIELDS}
    if tags is not None:
        out["tags"] = tags
    return out


async def _own(sdb, table: str, account_id: str, row_id: str, what: str) -> dict:
    rows = await sdb.select(table, {"id": row_id, "account_id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, f"{what} not found")
    return rows[0]


async def _consent(sdb, account_id: str, contact_id: str) -> dict:
    """Blocked (tag) and opted-out (their latest STOP/START keyword) for one contact."""
    tags = (await _tags_for(sdb, account_id, [contact_id])).get(contact_id, [])
    convs = await sdb.select("conversations", {"account_id": account_id, "contact_id": contact_id})
    last_word, last_at, last_inbound = None, None, None
    for conv in convs:
        inbound = _ts(conv.get("last_inbound_at"))
        if inbound and (not last_inbound or inbound > last_inbound):
            last_inbound = inbound
        for m in await sdb.select("messages", {"conversation_id": conv["id"], "sender_type": "customer"}, order="created_at.desc", limit=500):
            word = (m.get("content_text") or "").strip().upper().rstrip(".!")
            if word in OPT_OUT_WORDS or word in OPT_IN_WORDS:
                at = _ts(m.get("created_at"))
                if at and (not last_at or at > last_at):
                    last_word, last_at = word, at
                break  # newest keyword in this chat
    return {
        "blocked": BLOCKED_TAG.lower() in {t.lower() for t in tags},
        "opted_out": last_word in OPT_OUT_WORDS,
        "opted_out_at": last_at.isoformat() if last_word in OPT_OUT_WORDS and last_at else None,
        "last_inbound_at": last_inbound,
    }


# ------------------------------------------------------------------ WhatsApp number
@router.get("/whatsapp")
async def whatsapp_status(ctx: Member, sdb: ServiceDb):
    rows = await sdb.select("whatsapp_config", {"account_id": ctx.account_id}, limit=1)
    if not rows:
        return {"connected": False, "status": "not_connected"}
    r = rows[0]
    return {
        "connected": r.get("status") == "connected",
        "status": r.get("status"),
        "phone_number_id": r.get("phone_number_id"),
        "waba_id": r.get("waba_id"),
        "connected_at": r.get("connected_at"),
        "registered_at": r.get("registered_at"),
        "last_registration_error": r.get("last_registration_error"),
        "onboarded_via": r.get("onboarded_via"),
    }


# ------------------------------------------------------------------ conversations
@router.get("/conversations")
async def list_conversations(ctx: Member, sdb: ServiceDb, status: Literal["open", "pending", "closed"] | None = None, unread_only: bool = False, limit: int = Query(30, ge=1, le=MAX_LIST)):
    filters: dict[str, Any] = {"account_id": ctx.account_id}
    if status:
        filters["status"] = status
    if unread_only:
        filters["unread_count"] = ("gt", 0)
    convs = await sdb.select("conversations", filters, order="last_message_at.desc", limit=limit)
    contacts = await _contacts_by_id(sdb, ctx.account_id, [c["contact_id"] for c in convs])
    return [
        {
            "id": c["id"],
            "contact": _contact_public(contacts[c["contact_id"]]) if c["contact_id"] in contacts else None,
            "status": c.get("status"),
            "unread": c.get("unread_count") or 0,
            "last_message": c.get("last_message_text"),
            "last_message_at": c.get("last_message_at"),
            "assigned_to": c.get("assigned_agent_id"),
            "ai_paused": bool(c.get("ai_autoreply_disabled")),
        }
        for c in convs
    ]


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, ctx: Member, sdb: ServiceDb, limit: int = Query(30, ge=1, le=MAX_LIST)):
    conv = await _own(sdb, "conversations", ctx.account_id, conversation_id, "Conversation")
    contacts = await _contacts_by_id(sdb, ctx.account_id, [conv["contact_id"]])
    msgs = await sdb.select("messages", {"conversation_id": conversation_id}, order="created_at.desc", limit=limit)
    inbound = _ts(conv.get("last_inbound_at"))
    return {
        "id": conv["id"],
        "status": conv.get("status"),
        "contact": _contact_public(contacts[conv["contact_id"]]) if conv["contact_id"] in contacts else None,
        "assigned_to": conv.get("assigned_agent_id"),
        "ai_paused": bool(conv.get("ai_autoreply_disabled")),
        "can_send_free_text": bool(inbound and _now() - inbound < WINDOW),
        "window_closes_at": (inbound + WINDOW).isoformat() if inbound else None,
        "messages": [
            {
                "from": {"customer": "customer", "agent": "team", "bot": "ai"}.get(m.get("sender_type"), m.get("sender_type")),
                "type": m.get("content_type"),
                "text": m.get("content_text"),
                "template": m.get("template_name"),
                "media_url": m.get("media_url"),
                "status": m.get("status"),
                "error": m.get("error_title"),
                "at": m.get("created_at"),
            }
            for m in reversed(msgs)
        ],
    }


class ConversationPatch(BaseModel):
    status: Literal["open", "pending", "closed"] | None = None
    assigned_to: str | None = Field(None, description="A teammate's user id, or 'none' to unassign")
    ai_paused: bool | None = None
    mark_read: bool | None = None


@router.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, body: ConversationPatch, ctx: AgentMember, sdb: ServiceDb):
    await _own(sdb, "conversations", ctx.account_id, conversation_id, "Conversation")
    patch: dict[str, Any] = {}
    if body.status:
        patch["status"] = body.status
        patch["closed_at"] = _now().isoformat() if body.status == "closed" else None
    if body.assigned_to is not None:
        if body.assigned_to == "none":
            patch["assigned_agent_id"] = None
        else:
            member = await sdb.select("profiles", {"user_id": body.assigned_to, "account_id": ctx.account_id}, limit=1)
            if not member:
                raise HTTPException(422, "That person is not on this workspace")
            patch["assigned_agent_id"] = body.assigned_to
    if body.ai_paused is not None:
        patch["ai_autoreply_disabled"] = body.ai_paused
    if body.mark_read:
        patch["unread_count"] = 0
    if not patch:
        raise HTTPException(422, "Nothing to change")
    await sdb.update("conversations", {"id": conversation_id, "account_id": ctx.account_id}, patch)
    await audit.record(sdb, scope="account", action="conversation.update", actor_id=ctx.user.id, account_id=ctx.account_id, target=conversation_id, details=body.model_dump(exclude_none=True))
    return {"ok": True, "changed": sorted(patch)}


# ------------------------------------------------------------------ sending
class SendTemplate(BaseModel):
    name: str
    language: str = "en_US"
    body_params: list[str] = []
    header_media_url: str | None = Field(None, description="https link for an image, video or document header")
    header_text: str | None = None


class SendBody(BaseModel):
    to: str | None = Field(None, description="Phone in international format, e.g. +919876543210")
    conversation_id: str | None = None
    text: str | None = None
    template: SendTemplate | None = None
    media_url: str | None = None
    media_type: Literal["image", "video", "document", "audio"] | None = None
    filename: str | None = None
    name: str | None = Field(None, description="Name for a new contact")


async def _contact_for_send(sdb, account_id: str, body: SendBody) -> tuple[dict | None, dict | None]:
    if body.conversation_id:
        conv = await _own(sdb, "conversations", account_id, body.conversation_id, "Conversation")
        contacts = await _contacts_by_id(sdb, account_id, [conv["contact_id"]])
        return contacts.get(conv["contact_id"]), conv
    digits = _digits(body.to or "")
    if len(digits) < 8:
        raise HTTPException(422, "Give 'to' as a full phone number with country code, or a conversation_id")
    found = await sdb.select("contacts", {"account_id": account_id, "phone_normalized": digits}, limit=1)  # generated: digits only
    return (found[0] if found else None), None


def _bridge_payload(body: SendBody) -> dict:
    payload: dict[str, Any] = {k: v for k, v in {"to": body.to, "conversation_id": body.conversation_id, "name": body.name, "filename": body.filename}.items() if v}
    if body.template:
        params: Any = list(body.template.body_params)
        if body.template.header_media_url or body.template.header_text:
            params = {"body": list(body.template.body_params)}
            if body.template.header_media_url:
                params["headerMediaUrl"] = body.template.header_media_url
            if body.template.header_text:
                params["header"] = [body.template.header_text]
        payload.update(type="template", template={"name": body.template.name, "language": body.template.language, "params": params})
    elif body.media_url:
        payload.update(type=body.media_type or "image", media_url=body.media_url, text=body.text)
    else:
        payload.update(type="text", text=body.text)
    return payload


@router.post("/messages/check")
async def check_send(body: SendBody, ctx: AgentMember, sdb: ServiceDb):
    """What a send would do, without sending: who it goes to, and anything that blocks it."""
    return await _send_check(sdb, ctx, body)


async def _send_check(sdb, ctx, body: SendBody) -> dict:
    if not body.template and not body.text and not body.media_url:
        raise HTTPException(422, "Give text, a media_url or a template")
    if body.template and body.template.header_media_url and not body.template.header_media_url.startswith("https://"):
        raise HTTPException(422, "header_media_url must be an https link")
    template = None
    if body.template:
        found = await sdb.select("message_templates", {"account_id": ctx.account_id, "name": body.template.name, "language": body.template.language}, limit=1)
        if not found:
            raise HTTPException(404, f"No template '{body.template.name}' ({body.template.language}). Run templates_sync or templates_list.")
        template = found[0]
        if template.get("status") != "APPROVED":
            raise HTTPException(409, f"Template '{template['name']}' is {template.get('status')}, not APPROVED")
        if template.get("header_type") in ("image", "video", "document") and not template.get("header_media_url") and not body.template.header_media_url:
            raise HTTPException(422, f"Template '{template['name']}' has a {template['header_type']} header: pass header_media_url (https)")
    contact, conv = await _contact_for_send(sdb, ctx.account_id, body)
    blockers: list[str] = []
    consent = {"blocked": False, "opted_out": False, "last_inbound_at": None}
    if contact:
        consent = await _consent(sdb, ctx.account_id, contact["id"])
        if consent["blocked"]:
            blockers.append("This number is on the blocklist")
        if consent["opted_out"]:
            blockers.append(f"This person opted out (sent STOP on {consent['opted_out_at']}); never message them")
    last_inbound = _ts(conv.get("last_inbound_at")) if conv else consent["last_inbound_at"]
    if not body.template and not (last_inbound and _now() - last_inbound < WINDOW):
        blockers.append("Outside the 24-hour window: they haven't written in the last 24 hours, so only an approved template can be sent")
    return {
        "to": _contact_public(contact) if contact else {"phone": body.to, "new_contact": True},
        "kind": "template" if body.template else ("media" if body.media_url else "text"),
        "template": {"name": template["name"], "category": template.get("category"), "body": template.get("body_text")} if template else None,
        "text": body.text,
        "can_send": not blockers,
        "blockers": blockers,
    }


@router.post("/messages/send", status_code=201)
async def send_message(body: SendBody, ctx: AgentMember, sdb: ServiceDb, bridge: Bridge):
    check = await _send_check(sdb, ctx, body)
    if not check["can_send"]:
        raise HTTPException(409, "; ".join(check["blockers"]))
    result = await _bridge(bridge, ctx, "send", **_bridge_payload(body))
    await audit.record(sdb, scope="account", action="message.send", actor_id=ctx.user.id, account_id=ctx.account_id, target=result.get("conversation_id"), details={"kind": check["kind"], "template": body.template.name if body.template else None, "via": "api"})
    return result


# ------------------------------------------------------------------ templates
@router.get("/templates")
async def list_templates(ctx: Member, sdb: ServiceDb, status: str | None = None):
    filters: dict[str, Any] = {"account_id": ctx.account_id}
    if status:
        filters["status"] = status.upper()
    rows = await sdb.select("message_templates", filters, order="updated_at.desc", limit=MAX_LIST)
    return [
        {k: r.get(k) for k in ("id", "name", "language", "category", "status", "header_type", "header_content", "header_media_url", "body_text", "footer_text", "buttons", "rejection_reason", "quality_score", "updated_at")}
        for r in rows
    ]


@router.post("/templates/sync")
async def sync_templates(ctx: AdminMember, sdb: ServiceDb, bridge: Bridge):
    result = await _bridge(bridge, ctx, "templates_sync")
    await audit.record(sdb, scope="account", action="template.sync", actor_id=ctx.user.id, account_id=ctx.account_id, details={k: result.get(k) for k in ("total", "inserted", "updated")})
    return result


class TemplateCreate(BaseModel):
    name: str = Field(..., pattern=r"^[a-z0-9_]{1,512}$", description="lower_case_with_underscores")
    category: Literal["Marketing", "Utility", "Authentication"]
    language: str = "en_US"
    body_text: str = Field(..., min_length=1, max_length=1024)
    body_samples: list[str] = Field([], description="One example value per {{n}} in the body")
    footer_text: str | None = Field(None, max_length=60)
    header_type: Literal["text", "image", "video", "document"] | None = None
    header_content: str | None = Field(None, description="Header text, or an https sample link for a media header")
    buttons: list[dict] = []


@router.post("/templates", status_code=201)
async def create_template(body: TemplateCreate, ctx: AdminMember, sdb: ServiceDb, bridge: Bridge):
    template: dict[str, Any] = {
        "name": body.name,
        "category": body.category,
        "language": body.language,
        "body_text": body.body_text,
        "footer_text": body.footer_text,
        "buttons": body.buttons,
        "sample_values": {"body": body.body_samples} if body.body_samples else None,
    }
    if body.header_type:
        template["header_type"] = body.header_type
        template["header_content"] = body.header_content
        if body.header_type != "text":
            template["header_media_url"] = body.header_content
    result = await _bridge(bridge, ctx, "templates_submit", template=template)
    await audit.record(sdb, scope="account", action="template.submit", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.name, details={"category": body.category, "language": body.language})
    return result


# ------------------------------------------------------------------ contacts
@router.get("/contacts")
async def search_contacts(ctx: Member, sdb: ServiceDb, q: str | None = None, tag: str | None = None, limit: int = Query(50, ge=1, le=MAX_LIST)):
    filters: dict[str, Any] = {"account_id": ctx.account_id}
    rows: list[dict] = []
    if q and q.strip():
        term = q.strip().replace("*", "").replace(",", " ")
        digits = _digits(term)
        seen: set[str] = set()
        probes = [{"name": ("ilike", f"*{term}*")}, {"email": ("ilike", f"*{term}*")}, {"company": ("ilike", f"*{term}*")}]
        if len(digits) >= 4:
            probes.append({"phone_normalized": ("ilike", f"*{digits}*")})
        for probe in probes:
            for r in await sdb.select("contacts", {**filters, **probe}, order="created_at.desc", limit=limit):
                if r["id"] not in seen:
                    seen.add(r["id"])
                    rows.append(r)
    else:
        rows = await sdb.select("contacts", filters, order="created_at.desc", limit=limit if not tag else 2000)
    tags = await _tags_for(sdb, ctx.account_id, [r["id"] for r in rows])
    out = [_contact_public(r, tags.get(r["id"], [])) for r in rows]
    if tag:
        out = [c for c in out if tag.lower() in {t.lower() for t in c["tags"]}]
    return out[:limit]


class ContactCreate(BaseModel):
    phone: str
    name: str | None = None
    email: str | None = None
    company: str | None = None
    tags: list[str] = []


class ContactPatch(BaseModel):
    name: str | None = None
    email: str | None = None
    company: str | None = None
    add_tags: list[str] = []
    remove_tags: list[str] = []


async def _tag_id(sdb, ctx, name: str, create: bool = True) -> str | None:
    for t in await sdb.select("tags", {"account_id": ctx.account_id}):
        if t["name"].lower() == name.strip().lower():
            return t["id"]
    if not create:
        return None
    row = await sdb.insert("tags", {"account_id": ctx.account_id, "user_id": ctx.user.id, "name": name.strip()[:50], "color": "#64748b"})
    return row["id"]


async def _set_tags(sdb, ctx, contact_id: str, add: list[str], remove: list[str]) -> None:
    current = {link["tag_id"] for link in await sdb.select("contact_tags", {"contact_id": contact_id})}
    for name in add:
        if not name.strip():
            continue
        tid = await _tag_id(sdb, ctx, name)
        if tid not in current:
            await sdb.insert("contact_tags", {"contact_id": contact_id, "tag_id": tid})
            current.add(tid)
    for name in remove:
        tid = await _tag_id(sdb, ctx, name, create=False)
        if tid and tid in current:
            await sdb.delete("contact_tags", {"contact_id": contact_id, "tag_id": tid})


@router.post("/contacts", status_code=201)
async def create_contact(body: ContactCreate, ctx: AgentMember, sdb: ServiceDb):
    digits = _digits(body.phone)
    if len(digits) < 8 or len(digits) > 15:
        raise HTTPException(422, "Give the phone with its country code, e.g. +919876543210")
    if await sdb.select("contacts", {"account_id": ctx.account_id, "phone_normalized": digits}, limit=1):
        raise HTTPException(409, "A contact with that phone already exists")
    row = await sdb.insert("contacts", {"account_id": ctx.account_id, "user_id": ctx.user.id, "phone": "+" + digits, "name": body.name, "email": body.email, "company": body.company})
    await _set_tags(sdb, ctx, row["id"], body.tags, [])
    await audit.record(sdb, scope="account", action="contact.create", actor_id=ctx.user.id, account_id=ctx.account_id, target=row["id"])
    return _contact_public(row, body.tags)


@router.patch("/contacts/{contact_id}")
async def update_contact(contact_id: str, body: ContactPatch, ctx: AgentMember, sdb: ServiceDb):
    await _own(sdb, "contacts", ctx.account_id, contact_id, "Contact")
    patch = body.model_dump(include={"name", "email", "company"}, exclude_none=True)
    if not patch and not body.add_tags and not body.remove_tags:
        raise HTTPException(422, "Nothing to change")
    if patch:
        await sdb.update("contacts", {"id": contact_id, "account_id": ctx.account_id}, patch)
    await _set_tags(sdb, ctx, contact_id, body.add_tags, body.remove_tags)
    await audit.record(sdb, scope="account", action="contact.update", actor_id=ctx.user.id, account_id=ctx.account_id, target=contact_id, details={"fields": sorted(patch), "add_tags": body.add_tags, "remove_tags": body.remove_tags})
    row = (await sdb.select("contacts", {"id": contact_id, "account_id": ctx.account_id}, limit=1))[0]
    return _contact_public(row, (await _tags_for(sdb, ctx.account_id, [contact_id])).get(contact_id, []))


@router.get("/contacts/{contact_id}")
async def get_contact(contact_id: str, ctx: Member, sdb: ServiceDb):
    row = await _own(sdb, "contacts", ctx.account_id, contact_id, "Contact")
    consent = await _consent(sdb, ctx.account_id, contact_id)
    consent["last_inbound_at"] = consent["last_inbound_at"].isoformat() if consent["last_inbound_at"] else None
    return {**_contact_public(row, (await _tags_for(sdb, ctx.account_id, [contact_id])).get(contact_id, [])), **consent}


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(contact_id: str, ctx: AdminMember, sdb: ServiceDb):
    await _own(sdb, "contacts", ctx.account_id, contact_id, "Contact")
    await sdb.delete("contacts", {"id": contact_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="contact.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=contact_id)


# ------------------------------------------------------------------ blocklist and opt-outs
class BlockBody(BaseModel):
    contact_id: str | None = None
    phone: str | None = None
    blocked: bool = True


@router.post("/blocklist")
async def set_blocked(body: BlockBody, ctx: AdminMember, sdb: ServiceDb):
    if body.contact_id:
        contact = await _own(sdb, "contacts", ctx.account_id, body.contact_id, "Contact")
    else:
        digits = _digits(body.phone or "")
        found = await sdb.select("contacts", {"account_id": ctx.account_id, "phone_normalized": digits}, limit=1) if digits else []
        if found:
            contact = found[0]
        elif body.blocked and len(digits) >= 8:
            contact = await sdb.insert("contacts", {"account_id": ctx.account_id, "user_id": ctx.user.id, "phone": "+" + digits})
        else:
            raise HTTPException(404, "Contact not found")
    if body.blocked:
        await _set_tags(sdb, ctx, contact["id"], [BLOCKED_TAG], [])
    else:
        await _set_tags(sdb, ctx, contact["id"], [], [BLOCKED_TAG])
    await audit.record(sdb, scope="account", action="contact.block" if body.blocked else "contact.unblock", actor_id=ctx.user.id, account_id=ctx.account_id, target=contact["id"])
    return {"contact": _contact_public(contact), "blocked": body.blocked}


@router.get("/optouts")
async def list_optouts(ctx: Member, sdb: ServiceDb, limit: int = Query(100, ge=1, le=MAX_LIST)):
    """People whose latest keyword was STOP (they asked not to be messaged), plus blocked numbers."""
    convs = await sdb.select("conversations", {"account_id": ctx.account_id}, order="last_inbound_at.desc", limit=2000)
    by_contact: dict[str, tuple[str, str]] = {}
    for part in _chunks([c["id"] for c in convs]):
        conv_contact = {c["id"]: c["contact_id"] for c in convs}
        for m in await sdb.select("messages", {"conversation_id": ("in", part), "sender_type": "customer"}, order="created_at.desc", limit=5000):
            word = (m.get("content_text") or "").strip().upper().rstrip(".!")
            if word not in OPT_OUT_WORDS and word not in OPT_IN_WORDS:
                continue
            cid = conv_contact.get(m["conversation_id"])
            if cid and (cid not in by_contact or str(m.get("created_at")) > by_contact[cid][1]):
                by_contact[cid] = (word, str(m.get("created_at")))
    opted = {cid: at for cid, (word, at) in by_contact.items() if word in OPT_OUT_WORDS}
    blocked_tag = await _tag_id(sdb, ctx, BLOCKED_TAG, create=False)
    blocked = {link["contact_id"] for link in await sdb.select("contact_tags", {"tag_id": blocked_tag})} if blocked_tag else set()
    contacts = await _contacts_by_id(sdb, ctx.account_id, list(opted) + list(blocked))
    out = [{**_contact_public(c), "opted_out": c["id"] in opted, "opted_out_at": opted.get(c["id"]), "blocked": c["id"] in blocked} for c in contacts.values()]
    out.sort(key=lambda r: r.get("opted_out_at") or "", reverse=True)
    return out[:limit]


# ------------------------------------------------------------------ leads (pipeline deals) and segments (tags)
@router.get("/leads")
async def list_leads(ctx: Member, sdb: ServiceDb, status: Literal["open", "won", "lost"] | None = None, limit: int = Query(50, ge=1, le=MAX_LIST)):
    filters: dict[str, Any] = {"account_id": ctx.account_id}
    if status:
        filters["status"] = status
    deals = await sdb.select("deals", filters, order="updated_at.desc", limit=limit)
    pipelines = {p["id"]: p["name"] for p in await sdb.select("pipelines", {"account_id": ctx.account_id})}
    stages: dict[str, str] = {}
    for part in _chunks(list(pipelines)):
        for s in await sdb.select("pipeline_stages", {"pipeline_id": ("in", part)}):
            stages[s["id"]] = s["name"]
    contacts = await _contacts_by_id(sdb, ctx.account_id, [d.get("contact_id") for d in deals])
    return [
        {
            "id": d["id"],
            "title": d.get("title"),
            "contact": _contact_public(contacts[d["contact_id"]]) if d.get("contact_id") in contacts else None,
            "pipeline": pipelines.get(d.get("pipeline_id")),
            "stage": stages.get(d.get("stage_id")),
            "stage_id": d.get("stage_id"),
            "status": d.get("status"),
            "value": d.get("value"),
            "currency": d.get("currency"),
            "expected_close_date": d.get("expected_close_date"),
            "notes": d.get("notes"),
            "updated_at": d.get("updated_at"),
        }
        for d in deals
    ]


class LeadPatch(BaseModel):
    stage: str | None = Field(None, description="Stage name or id in the lead's pipeline")
    status: Literal["open", "won", "lost"] | None = None
    value: float | None = Field(None, ge=0)
    notes: str | None = None
    assigned_to: str | None = None


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadPatch, ctx: AgentMember, sdb: ServiceDb):
    deal = await _own(sdb, "deals", ctx.account_id, lead_id, "Lead")
    patch: dict[str, Any] = body.model_dump(include={"status", "value", "notes"}, exclude_none=True)
    if body.status in ("won", "lost"):
        patch["closed_at"] = _now().isoformat()
    elif body.status == "open":
        patch["closed_at"] = None
    if body.stage:
        stages = await sdb.select("pipeline_stages", {"pipeline_id": deal["pipeline_id"]})
        match = next((s for s in stages if s["id"] == body.stage or s["name"].lower() == body.stage.lower()), None)
        if not match:
            raise HTTPException(422, f"No stage '{body.stage}'. Stages: {', '.join(s['name'] for s in sorted(stages, key=lambda s: s.get('position') or 0))}")
        patch["stage_id"] = match["id"]
    if body.assigned_to:
        if not await sdb.select("profiles", {"user_id": body.assigned_to, "account_id": ctx.account_id}, limit=1):
            raise HTTPException(422, "That person is not on this workspace")
        patch["assigned_to"] = body.assigned_to
    if not patch:
        raise HTTPException(422, "Nothing to change")
    await sdb.update("deals", {"id": lead_id, "account_id": ctx.account_id}, patch)
    await audit.record(sdb, scope="account", action="lead.update", actor_id=ctx.user.id, account_id=ctx.account_id, target=lead_id, details={k: v for k, v in patch.items() if k != "notes"})
    return {"ok": True, "changed": sorted(patch)}


@router.get("/segments")
async def list_segments(ctx: Member, sdb: ServiceDb):
    """Customer groups by tag, with how many people are in each."""
    tags = await sdb.select("tags", {"account_id": ctx.account_id}, order="name.asc")
    counts: Counter = Counter()
    for part in _chunks([t["id"] for t in tags]):
        for link in await sdb.select("contact_tags", {"tag_id": ("in", part)}):
            counts[link["tag_id"]] += 1
    return [{"tag": t["name"], "people": counts.get(t["id"], 0), "color": t.get("color")} for t in tags]


# ------------------------------------------------------------------ broadcasts
BROADCAST_FIELDS = ("id", "name", "template_name", "template_language", "status", "scheduled_at", "total_recipients", "sent_count", "delivered_count", "read_count", "replied_count", "failed_count", "created_at")


@router.get("/broadcasts")
async def list_broadcasts(ctx: Member, sdb: ServiceDb, limit: int = Query(20, ge=1, le=MAX_LIST)):
    rows = await sdb.select("broadcasts", {"account_id": ctx.account_id}, order="created_at.desc", limit=limit)
    return [{k: r.get(k) for k in BROADCAST_FIELDS} for r in rows]


@router.get("/broadcasts/{broadcast_id}")
async def get_broadcast(broadcast_id: str, ctx: Member, sdb: ServiceDb):
    row = await _own(sdb, "broadcasts", ctx.account_id, broadcast_id, "Broadcast")
    recipients = await sdb.select("broadcast_recipients", {"broadcast_id": broadcast_id}, limit=5000)
    errors = Counter(r.get("error_message") for r in recipients if r.get("status") == "failed" and r.get("error_message"))
    return {
        **{k: row.get(k) for k in BROADCAST_FIELDS},
        "recipients_by_status": dict(Counter(r.get("status") for r in recipients)),
        "top_errors": [{"error": e, "count": n} for e, n in errors.most_common(5)],
    }


class BroadcastRecipient(BaseModel):
    to: str
    params: list[str] = []


class BroadcastCreate(BaseModel):
    name: str | None = None
    template_name: str
    template_language: str = "en_US"
    recipients: list[BroadcastRecipient] = Field([], max_length=1000)
    tag: str | None = Field(None, description="Send to everyone with this tag instead of a list")
    params: list[str] = Field([], description="Body values used for everyone when sending to a tag")


async def _broadcast_plan(sdb, ctx, body: BroadcastCreate) -> dict:
    template = await sdb.select("message_templates", {"account_id": ctx.account_id, "name": body.template_name, "language": body.template_language}, limit=1)
    if not template:
        raise HTTPException(404, f"No template '{body.template_name}' ({body.template_language})")
    if template[0].get("status") != "APPROVED":
        raise HTTPException(409, f"Template is {template[0].get('status')}, not APPROVED")
    recipients = [r.model_dump() for r in body.recipients]
    if body.tag:
        tid = await _tag_id(sdb, ctx, body.tag, create=False)
        if not tid:
            raise HTTPException(404, f"No tag '{body.tag}'")
        ids = [link["contact_id"] for link in await sdb.select("contact_tags", {"tag_id": tid})]
        recipients += [{"to": c["phone"], "params": body.params} for c in (await _contacts_by_id(sdb, ctx.account_id, ids)).values() if c.get("phone")]
    if not recipients:
        raise HTTPException(422, "No recipients: give a list or a tag with people in it")
    if len(recipients) > 1000:
        raise HTTPException(422, "Up to 1000 recipients per broadcast; split it")
    # Never message opted-out or blocked people.
    skip = {_digits(r["phone"]) for r in await list_optouts(ctx, sdb, limit=MAX_LIST)}
    keep, skipped, seen = [], [], set()
    for r in recipients:
        d = _digits(r["to"])
        if d in seen:
            continue
        seen.add(d)
        (skipped if d in skip else keep).append(r)
    return {"template": template[0], "recipients": keep, "skipped_opted_out_or_blocked": len(skipped)}


@router.post("/broadcasts/check")
async def check_broadcast(body: BroadcastCreate, ctx: AgentMember, sdb: ServiceDb):
    plan = await _broadcast_plan(sdb, ctx, body)
    return {"template": plan["template"]["name"], "category": plan["template"].get("category"), "will_send_to": len(plan["recipients"]), "skipped_opted_out_or_blocked": plan["skipped_opted_out_or_blocked"], "sample": [r["to"] for r in plan["recipients"][:5]]}


@router.post("/broadcasts", status_code=202)
async def create_broadcast(body: BroadcastCreate, ctx: AgentMember, sdb: ServiceDb, bridge: Bridge):
    plan = await _broadcast_plan(sdb, ctx, body)
    if not plan["recipients"]:
        raise HTTPException(409, "Everyone on the list opted out or is blocked")
    result = await _bridge(bridge, ctx, "broadcast_create", name=body.name, template_name=body.template_name, template_language=body.template_language, recipients=plan["recipients"])
    await audit.record(sdb, scope="account", action="broadcast.create", actor_id=ctx.user.id, account_id=ctx.account_id, target=result.get("broadcast_id"), details={"template": body.template_name, "recipients": len(plan["recipients"]), "skipped": plan["skipped_opted_out_or_blocked"]})
    return {**result, "skipped_opted_out_or_blocked": plan["skipped_opted_out_or_blocked"]}


@router.post("/broadcasts/{broadcast_id}/cancel")
async def cancel_broadcast(broadcast_id: str, ctx: AgentMember, sdb: ServiceDb):
    row = await _own(sdb, "broadcasts", ctx.account_id, broadcast_id, "Broadcast")
    if row.get("status") not in ("draft", "scheduled"):
        raise HTTPException(409, f"Only a draft or scheduled broadcast can be cancelled; this one is {row.get('status')}")
    await sdb.update("broadcasts", {"id": broadcast_id, "account_id": ctx.account_id}, {"status": "failed"})
    await sdb.update("broadcast_recipients", {"broadcast_id": broadcast_id, "status": "pending"}, {"status": "failed", "error_message": "Cancelled"})
    await audit.record(sdb, scope="account", action="broadcast.cancel", actor_id=ctx.user.id, account_id=ctx.account_id, target=broadcast_id)
    return {"ok": True, "status": "cancelled"}


@router.delete("/broadcasts/{broadcast_id}", status_code=204)
async def delete_broadcast(broadcast_id: str, ctx: AdminMember, sdb: ServiceDb):
    """Delete a broadcast and its recipient list. Messages already sent stay in the chats."""
    row = await _own(sdb, "broadcasts", ctx.account_id, broadcast_id, "Broadcast")
    if row.get("status") == "sending":
        raise HTTPException(409, "This broadcast is still sending; wait for it to finish")
    await sdb.delete("broadcast_recipients", {"broadcast_id": broadcast_id})
    await sdb.delete("broadcasts", {"id": broadcast_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="broadcast.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=broadcast_id, details={"name": row.get("name"), "status": row.get("status"), "sent": row.get("sent_count")})


# ------------------------------------------------------------------ automations and flows
@router.get("/automations")
async def list_automations(ctx: Member, sdb: ServiceDb):
    rows = await sdb.select("automations", {"account_id": ctx.account_id}, order="updated_at.desc", limit=MAX_LIST)
    return [{k: r.get(k) for k in ("id", "name", "description", "trigger_type", "is_active", "execution_count", "last_executed_at")} for r in rows]


class ActiveBody(BaseModel):
    active: bool


@router.patch("/automations/{automation_id}")
async def toggle_automation(automation_id: str, body: ActiveBody, ctx: AdminMember, sdb: ServiceDb):
    await _own(sdb, "automations", ctx.account_id, automation_id, "Automation")
    await sdb.update("automations", {"id": automation_id, "account_id": ctx.account_id}, {"is_active": body.active})
    await audit.record(sdb, scope="account", action="automation.toggle", actor_id=ctx.user.id, account_id=ctx.account_id, target=automation_id, details={"active": body.active})
    return {"ok": True, "active": body.active}


@router.get("/flows")
async def list_flows(ctx: Member, sdb: ServiceDb):
    rows = await sdb.select("flows", {"account_id": ctx.account_id}, order="updated_at.desc", limit=MAX_LIST)
    return [{k: r.get(k) for k in ("id", "name", "description", "status", "trigger_type", "execution_count", "last_executed_at")} for r in rows]


@router.patch("/flows/{flow_id}")
async def toggle_flow(flow_id: str, body: ActiveBody, ctx: AdminMember, sdb: ServiceDb):
    flow = await _own(sdb, "flows", ctx.account_id, flow_id, "Flow")
    if body.active and not flow.get("entry_node_id"):
        raise HTTPException(409, "This flow has no start step yet; finish it in the flow editor first")
    status = "active" if body.active else "draft"
    await sdb.update("flows", {"id": flow_id, "account_id": ctx.account_id}, {"status": status})
    await audit.record(sdb, scope="account", action="flow.toggle", actor_id=ctx.user.id, account_id=ctx.account_id, target=flow_id, details={"status": status})
    return {"ok": True, "status": status}


# ------------------------------------------------------------------ knowledge
@router.get("/knowledge")
async def list_knowledge(ctx: Member, sdb: ServiceDb):
    rows = await sdb.select("ai_knowledge_documents", {"account_id": ctx.account_id}, order="updated_at.desc", limit=MAX_LIST)
    return [{"id": r["id"], "title": r.get("title"), "characters": len(r.get("content") or ""), "preview": (r.get("content") or "")[:200], "updated_at": r.get("updated_at")} for r in rows]


class KnowledgeAdd(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1, max_length=100_000)


@router.post("/knowledge", status_code=201)
async def add_knowledge(body: KnowledgeAdd, ctx: AdminMember, sdb: ServiceDb, bridge: Bridge):
    result = await _bridge(bridge, ctx, "knowledge_add", title=body.title, content=body.content)
    await audit.record(sdb, scope="account", action="knowledge.add", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.title)
    return result


# ------------------------------------------------------------------ insights
@router.get("/insights")
async def insights(ctx: Member, sdb: ServiceDb, days: int = Query(30, ge=1, le=365)):
    since = (_now() - timedelta(days=days)).isoformat()
    acct = ctx.account_id
    convs = await sdb.select("conversations", {"account_id": acct, "created_at": ("gte", since)}, limit=5000)
    reply_minutes = []
    for c in convs:
        first, reply = _ts(c.get("first_inbound_at")), _ts(c.get("last_reply_at"))
        if first and reply and reply >= first:
            reply_minutes.append((reply - first).total_seconds() / 60)
    reply_minutes.sort()
    deals = await sdb.select("deals", {"account_id": acct, "created_at": ("gte", since)}, limit=5000)
    broadcasts = await sdb.select("broadcasts", {"account_id": acct, "created_at": ("gte", since)}, limit=500)
    return {
        "days": days,
        "new_conversations": len(convs),
        "open_conversations": await sdb.count("conversations", {"account_id": acct, "status": "open"}),
        "unread_conversations": len(await sdb.select("conversations", {"account_id": acct, "unread_count": ("gt", 0)}, limit=5000)),
        "new_contacts": await sdb.count("contacts", {"account_id": acct}, since=("created_at", since)),
        "median_first_reply_minutes": round(reply_minutes[len(reply_minutes) // 2], 1) if reply_minutes else None,
        "ai_replies": await sdb.count("ai_usage_log", {"account_id": acct}, since=("created_at", since)),
        "leads": {"new": len(deals), "won": sum(1 for d in deals if d.get("status") == "won"), "lost": sum(1 for d in deals if d.get("status") == "lost"), "won_value": sum(float(d.get("value") or 0) for d in deals if d.get("status") == "won")},
        "broadcasts": {"count": len(broadcasts), "sent": sum(b.get("sent_count") or 0 for b in broadcasts), "delivered": sum(b.get("delivered_count") or 0 for b in broadcasts), "read": sum(b.get("read_count") or 0 for b in broadcasts), "replied": sum(b.get("replied_count") or 0 for b in broadcasts)},
    }

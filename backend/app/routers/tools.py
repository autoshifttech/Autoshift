"""Tools an assistant can use: built-in ones a business switches on or off, and its own webhook tools."""

import secrets
import time
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import audit, events
from ..deps import AdminMember, Member, ServiceDb
from ..schemas import ToolCreate, ToolPatch, ToolWebhook

router = APIRouter(prefix="/v1/tools", tags=["tools"])

# Same built-ins the app shows (src/lib/assistants/model.ts defaultTools).
BUILTINS = [
    ("capture_lead", "leads", "Save lead details", "Use when the customer shares their name, budget, location or need. Saves the answers and updates the lead score."),
    ("add_tag", "leads", "Add a tag", "Use to label the contact, for example “Interested” or “VIP”."),
    ("send_template", "messaging", "Send a template", "Use to send an approved WhatsApp template, such as a price list or brochure."),
    ("send_file", "messaging", "Send a file", "Use to share a catalogue, menu or PDF from your Files library."),
    ("handoff", "team", "Hand off to a person", "Use when the customer asks for a person, is upset, or asks something you can’t answer."),
]
PUBLIC = ("key", "builtin", "category", "name", "description", "enabled", "webhook", "calls", "created_at")


def _public(r: dict) -> dict:
    return {k: r.get(k) for k in PUBLIC}


async def _all(sdb, account_id: str) -> list[dict]:
    rows = await sdb.select("ai_tools", {"account_id": account_id}, order="created_at.asc")
    have = {r["key"] for r in rows}
    for key, category, name, description in BUILTINS:  # every business starts with the built-ins switched on
        if key not in have:
            rows.append(await sdb.insert("ai_tools", {"account_id": account_id, "key": key, "builtin": True, "category": category, "name": name, "description": description, "enabled": True}))
    order = {k: i for i, (k, *_r) in enumerate(BUILTINS)}
    return sorted(rows, key=lambda r: (not r["builtin"], order.get(r["key"], 0), str(r.get("created_at"))))


async def _one(sdb, ctx, key: str) -> dict:
    rows = await sdb.select("ai_tools", {"account_id": ctx.account_id, "key": key}, limit=1)
    if not rows:
        raise HTTPException(404, "Tool not found")
    return rows[0]


async def _safe(url: str) -> None:
    try:
        await events.check_url(url)
    except events.UnsafeUrl as exc:
        raise HTTPException(422, f"Webhook address: {exc}") from exc


@router.get("")
async def list_tools(ctx: Member, sdb: ServiceDb):
    return [_public(r) for r in await _all(sdb, ctx.account_id)]


@router.post("", status_code=201)
async def create_tool(body: ToolCreate, ctx: AdminMember, sdb: ServiceDb):
    await _safe(body.webhook.url)
    if len([r for r in await sdb.select("ai_tools", {"account_id": ctx.account_id}) if not r["builtin"]]) >= 25:
        raise HTTPException(409, "You can have up to 25 of your own tools")
    row = await sdb.insert("ai_tools", {"account_id": ctx.account_id, "key": f"custom_{secrets.token_hex(6)}", "builtin": False, "category": "custom", "name": body.name.strip(), "description": body.description.strip(), "enabled": body.enabled, "webhook": body.webhook.model_dump()})
    await audit.record(sdb, scope="account", action="tool.create", actor_id=ctx.user.id, account_id=ctx.account_id, target=row["key"], details={"url": body.webhook.url})
    return _public(row)


@router.patch("/{key}")
async def update_tool(key: str, body: ToolPatch, ctx: AdminMember, sdb: ServiceDb):
    tool = await _one(sdb, ctx, key)
    patch = body.model_dump(exclude_unset=True, exclude_none=True)
    if tool["builtin"] and set(patch) - {"enabled"}:
        raise HTTPException(400, "Built-in tools can only be switched on or off")
    if "webhook" in patch:
        await _safe(body.webhook.url)  # type: ignore[union-attr]
        patch["webhook"] = body.webhook.model_dump()  # type: ignore[union-attr]
    if not patch:
        raise HTTPException(422, "Nothing to change")
    rows = await sdb.update("ai_tools", {"account_id": ctx.account_id, "key": key}, patch)
    await audit.record(sdb, scope="account", action="tool.update", actor_id=ctx.user.id, account_id=ctx.account_id, target=key, details={"fields": sorted(patch)})
    return _public(rows[0])


@router.delete("/{key}", status_code=204)
async def delete_tool(key: str, ctx: AdminMember, sdb: ServiceDb):
    tool = await _one(sdb, ctx, key)
    if tool["builtin"]:
        raise HTTPException(400, "Built-in tools can be switched off but not deleted")
    await sdb.delete("ai_tools", {"account_id": ctx.account_id, "key": key})
    for a in await sdb.select("assistants", {"account_id": ctx.account_id}):  # no assistant keeps a dangling tool
        if key in (a.get("tool_ids") or []):
            await sdb.update("assistants", {"id": a["id"], "account_id": ctx.account_id}, {"tool_ids": [k for k in a["tool_ids"] if k != key]})
    await audit.record(sdb, scope="account", action="tool.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=key)


# ------------------------------------------------------------------ test a webhook tool
# The Tools page's "Send a test request": one real call to the webhook (saved or still a draft),
# so a business sees what its endpoint really answers before an assistant relies on it.
Sender = Callable[[str, str, dict[str, Any]], Awaitable[tuple[int, str]]]
TEST_TIMEOUT = 10
MAX_ANSWER = 2000


async def http_send(method: str, url: str, args: dict[str, Any]) -> tuple[int, str]:
    headers = {"User-Agent": "AutoShift-Tools/1.0", "X-AutoShift-Test": "1"}
    async with httpx.AsyncClient(timeout=TEST_TIMEOUT, follow_redirects=False) as client:
        if method == "GET":
            res = await client.get(url, params={k: str(v) for k, v in args.items()}, headers=headers)
        else:
            res = await client.post(url, json=args, headers=headers)
        return res.status_code, res.text[:MAX_ANSWER]


def get_sender() -> Sender:
    return http_send


class ToolTestIn(BaseModel):
    webhook: ToolWebhook
    arguments: dict[str, Any] = Field(default_factory=dict)


@router.post("/test")
async def test_tool(body: ToolTestIn, ctx: AdminMember, sdb: ServiceDb, send: Annotated[Sender, Depends(get_sender)]):
    """Call the webhook once with sample details and report what it answered. A failing webhook is a
    result (ok false), not an error, so the page can show it."""
    await _safe(body.webhook.url)
    names = {p.name for p in body.webhook.params}
    args = {k: v for k, v in body.arguments.items() if k in names}
    started = time.monotonic()
    try:
        status, text = await send(body.webhook.method, body.webhook.url, args)
        error = None
    except httpx.TimeoutException:
        status, text, error = 0, "", f"The webhook didn't answer within {TEST_TIMEOUT} seconds"
    except httpx.HTTPError as exc:
        status, text, error = 0, "", f"Could not reach the webhook ({exc.__class__.__name__})"
    ms = round((time.monotonic() - started) * 1000)
    await audit.record(sdb, scope="account", action="tool.test", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.webhook.url[:200], details={"status": status, "method": body.webhook.method})
    return {"ok": 200 <= status < 300, "status": status, "ms": ms, "body": text, "error": error}


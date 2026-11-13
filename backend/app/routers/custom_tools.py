"""Custom MCP tools, defined by the AutoShift team in the admin panel.

Each tool has a name, a description the AI reads, a list of inputs, and a public https webhook
(for example an n8n workflow) that does the work. A run POSTs the inputs, signed like outgoing
webhooks (X-AutoShift-Signature over "<timestamp>.<body>" with the tool's own secret), and returns
what the webhook answered. The webhook secret is shown once when the tool is made, never again,
and never to an AI. Every run is audited.
"""

import json
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Awaitable, Callable, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .. import audit, events
from ..config import Settings, get_settings
from ..deps import ROLE_ORDER, AccountCtx, Member, PlatformAdmin, ServiceDb, get_platform_admin, require_platform_role
from ..security import decrypt, encrypt

router = APIRouter(tags=["custom-tools"])
AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]
SuperOnly = Annotated[PlatformAdmin, Depends(require_platform_role())]
MAX_TOOLS = 50
MAX_RESPONSE = 20_000
PUBLIC = ("id", "name", "description", "params", "webhook_url", "audience", "min_role", "requires_confirm", "enabled", "calls", "last_called_at", "last_status", "created_at", "updated_at")
RESERVED = {"whoami", "custom_tools_list", "custom_tool_run"}

# (url, headers, body) -> (status, text). Replaced in tests.
Poster = Callable[[str, dict[str, str], bytes], Awaitable[tuple[int, str]]]


async def http_post(url: str, headers: dict[str, str], body: bytes) -> tuple[int, str]:
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        res = await client.post(url, content=body, headers=headers)
    return res.status_code, res.text[:MAX_RESPONSE]


def get_poster() -> Poster:
    return http_post


Post = Annotated[Poster, Depends(get_poster)]


class Param(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    type: Literal["string", "number", "integer", "boolean"] = "string"
    description: str = Field("", max_length=300)
    required: bool = False


class ToolIn(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{1,47}$", description="lower_case_with_underscores")
    description: str = Field(min_length=1, max_length=1000)
    params: list[Param] = Field(default_factory=list, max_length=20)
    webhook_url: str = Field(max_length=500)
    audience: Literal["platform", "business"] = "platform"
    min_role: Literal["viewer", "agent", "admin", "owner"] = "agent"
    requires_confirm: bool = True
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def not_reserved(cls, v: str) -> str:
        if v in RESERVED or v.startswith("platform_"):
            raise ValueError("That name is taken by a built-in tool")
        return v

    @field_validator("params")
    @classmethod
    def unique(cls, v: list[Param]) -> list[Param]:
        if len({p.name for p in v}) != len(v):
            raise ValueError("Input names must be unique")
        return v


class ToolPatch(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=1000)
    params: list[Param] | None = Field(None, max_length=20)
    webhook_url: str | None = Field(None, max_length=500)
    audience: Literal["platform", "business"] | None = None
    min_role: Literal["viewer", "agent", "admin", "owner"] | None = None
    requires_confirm: bool | None = None
    enabled: bool | None = None
    rotate_secret: bool = False


class RunIn(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)
    confirm: bool = False


def _public(row: dict) -> dict:
    return {k: row.get(k) for k in PUBLIC}


def _for_ai(row: dict) -> dict:
    return {"name": row["name"], "description": row["description"], "inputs": row.get("params") or [], "needs_confirm": row["requires_confirm"]}


async def _check_url(url: str) -> None:
    try:
        await events.check_url(url)
    except events.UnsafeUrl as exc:
        raise HTTPException(422, str(exc)) from exc


async def _by_name(sdb, name: str) -> dict:
    rows = await sdb.select("custom_mcp_tools", {"name": name}, limit=1)
    if not rows:
        raise HTTPException(404, f"No custom tool '{name}'")
    return rows[0]


def _validate_args(tool: dict, args: dict[str, Any]) -> dict[str, Any]:
    params = {p["name"]: p for p in tool.get("params") or []}
    unknown = set(args) - set(params)
    if unknown:
        raise HTTPException(422, f"Unknown inputs: {', '.join(sorted(unknown))}. Inputs: {', '.join(params) or 'none'}")
    out: dict[str, Any] = {}
    for name, p in params.items():
        if name not in args or args[name] is None:
            if p.get("required"):
                raise HTTPException(422, f"'{name}' is required")
            continue
        v = args[name]
        t = p.get("type", "string")
        ok = (t == "string" and isinstance(v, str) and len(v) <= 5000) or (t == "boolean" and isinstance(v, bool)) or (t == "integer" and isinstance(v, int) and not isinstance(v, bool)) or (t == "number" and isinstance(v, (int, float)) and not isinstance(v, bool))
        if not ok:
            raise HTTPException(422, f"'{name}' must be a {t}")
        out[name] = v
    return out


async def _run(sdb, settings: Settings, post: Poster, tool: dict, args: dict[str, Any], caller: dict, actor_id: str, account_id: str | None) -> dict:
    if not tool["enabled"]:
        raise HTTPException(409, "This tool is switched off")
    clean = _validate_args(tool, args)
    await _check_url(tool["webhook_url"])  # DNS can change after the tool was saved
    request_id = str(uuid.uuid4())
    body = json.dumps({"tool": tool["name"], "arguments": clean, "caller": caller, "request_id": request_id}, separators=(",", ":")).encode()
    ts = str(int(time.time()))
    headers = {"Content-Type": "application/json", "User-Agent": "AutoShift-MCP/1", "X-AutoShift-Tool": tool["name"], "X-AutoShift-Timestamp": ts, "X-AutoShift-Signature": events.sign(decrypt(tool["secret_cipher"], settings), ts, body), "X-AutoShift-Request": request_id}
    try:
        status, text = await post(tool["webhook_url"], headers, body)
    except httpx.HTTPError as exc:
        status, text = 0, f"Could not reach the webhook ({exc.__class__.__name__})"
    await sdb.update("custom_mcp_tools", {"id": tool["id"]}, {"calls": int(tool.get("calls") or 0) + 1, "last_called_at": datetime.now(timezone.utc).isoformat(), "last_status": status})
    await audit.record(sdb, scope="account" if account_id else "platform", action="custom_tool.run", actor_id=actor_id, account_id=account_id, target=tool["name"], details={"status": status, "inputs": sorted(clean), "request_id": request_id})
    try:
        result: Any = json.loads(text) if text else None
    except ValueError:
        result = text
    if not 200 <= status < 300:
        raise HTTPException(502, f"The tool's webhook answered {status or 'nothing'}: {str(result)[:300]}")
    return {"tool": tool["name"], "request_id": request_id, "result": result}


def _preview(tool: dict, args: dict[str, Any]) -> dict:
    return {"confirmation_required": True, "would": f"run the custom tool '{tool['name']}'", "description": tool["description"], "arguments": _validate_args(tool, args), "next": "Call again with confirm=true to run it."}


# ------------------------------------------------------------------ staff: manage
@router.get("/v1/platform/custom-tools")
async def list_tools(_: AnyStaff, sdb: ServiceDb):
    return [_public(r) for r in await sdb.select("custom_mcp_tools", order="name.asc")]


@router.post("/v1/platform/custom-tools", status_code=201)
async def create_tool(body: ToolIn, admin: SuperOnly, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    await _check_url(body.webhook_url)
    if await sdb.select("custom_mcp_tools", {"name": body.name}, limit=1):
        raise HTTPException(409, "A tool with that name already exists")
    if await sdb.count("custom_mcp_tools") >= MAX_TOOLS:
        raise HTTPException(409, f"Up to {MAX_TOOLS} custom tools")
    secret = "whsec_" + secrets.token_urlsafe(32)
    row = await sdb.insert("custom_mcp_tools", {**body.model_dump(mode="json"), "secret_cipher": encrypt(secret, settings), "created_by": admin.user.id})
    await audit.record(sdb, scope="platform", action="custom_tool.create", actor_id=admin.user.id, target=body.name, details={"audience": body.audience, "url": body.webhook_url})
    return {**_public(row), "secret": secret}  # shown only now


@router.patch("/v1/platform/custom-tools/{tool_id}")
async def update_tool(tool_id: str, body: ToolPatch, admin: SuperOnly, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    rows = await sdb.select("custom_mcp_tools", {"id": tool_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Tool not found")
    patch: dict[str, Any] = body.model_dump(mode="json", exclude_none=True, exclude={"rotate_secret"})
    if "params" in patch and len({p["name"] for p in patch["params"]}) != len(patch["params"]):
        raise HTTPException(422, "Input names must be unique")
    if "webhook_url" in patch:
        await _check_url(patch["webhook_url"])
    secret = None
    if body.rotate_secret:
        secret = "whsec_" + secrets.token_urlsafe(32)
        patch["secret_cipher"] = encrypt(secret, settings)
    if not patch:
        raise HTTPException(422, "Nothing to change")
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    row = (await sdb.update("custom_mcp_tools", {"id": tool_id}, patch))[0]
    await audit.record(sdb, scope="platform", action="custom_tool.update", actor_id=admin.user.id, target=rows[0]["name"], details={"fields": sorted(k for k in patch if k not in ("secret_cipher", "updated_at")), "secret_rotated": body.rotate_secret})
    return {**_public(row), **({"secret": secret} if secret else {})}


@router.delete("/v1/platform/custom-tools/{tool_id}", status_code=204)
async def delete_tool(tool_id: str, admin: SuperOnly, sdb: ServiceDb):
    rows = await sdb.select("custom_mcp_tools", {"id": tool_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Tool not found")
    await sdb.delete("custom_mcp_tools", {"id": tool_id})
    await audit.record(sdb, scope="platform", action="custom_tool.delete", actor_id=admin.user.id, target=rows[0]["name"])


@router.post("/v1/platform/custom-tools/{tool_id}/test")
async def test_tool(tool_id: str, body: RunIn, admin: SuperOnly, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)], post: Post):
    """Run a tool now from the admin panel, with sample inputs, to check the webhook answers."""
    rows = await sdb.select("custom_mcp_tools", {"id": tool_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Tool not found")
    return await _run(sdb, settings, post, {**rows[0], "enabled": True}, body.arguments, {"kind": "test", "user_id": admin.user.id}, admin.user.id, None)


# ------------------------------------------------------------------ callers: list and run
@router.get("/v1/platform/custom-tools/available")
async def staff_available(_: AnyStaff, sdb: ServiceDb):
    return [_for_ai(r) for r in await sdb.select("custom_mcp_tools", {"enabled": "true"}, order="name.asc")]


@router.post("/v1/platform/custom-tools/run/{name}")
async def staff_run(name: str, body: RunIn, admin: AnyStaff, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)], post: Post):
    tool = await _by_name(sdb, name)
    if not body.confirm and tool["requires_confirm"]:
        return _preview(tool, body.arguments)
    return await _run(sdb, settings, post, tool, body.arguments, {"kind": "platform", "user_id": admin.user.id, "role": admin.role}, admin.user.id, None)


def _allowed(tool: dict, ctx: AccountCtx) -> bool:
    return tool["audience"] == "business" and ROLE_ORDER.get(ctx.role, -1) >= ROLE_ORDER[tool["min_role"]]


@router.get("/v1/custom-tools")
async def workspace_available(ctx: Member, sdb: ServiceDb):
    return [_for_ai(r) for r in await sdb.select("custom_mcp_tools", {"enabled": "true", "audience": "business"}, order="name.asc") if _allowed(r, ctx)]


@router.post("/v1/custom-tools/run/{name}")
async def workspace_run(name: str, body: RunIn, ctx: Member, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)], post: Post):
    tool = await _by_name(sdb, name)
    if tool["audience"] != "business":
        raise HTTPException(404, f"No custom tool '{name}'")  # staff-only tools don't exist for businesses
    if not _allowed(tool, ctx):
        raise HTTPException(403, f"This tool needs the {tool['min_role']} role")
    if ctx.user.key_scope == "read":
        raise HTTPException(403, "This API key is read-only")
    if not body.confirm and tool["requires_confirm"]:
        return _preview(tool, body.arguments)
    return await _run(sdb, settings, post, tool, body.arguments, {"kind": "business", "account_id": ctx.account_id, "user_id": ctx.user.id, "role": ctx.role}, ctx.user.id, ctx.account_id)

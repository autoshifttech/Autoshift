"""A business's outgoing webhooks: where to send events, with a secret to verify them."""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import audit, events
from ..config import Settings, get_settings
from ..deps import AdminMember, ServiceDb
from ..schemas import HookCreate
from ..security import encrypt

router = APIRouter(prefix="/v1/hooks", tags=["hooks"])
MAX_HOOKS = 10
PUBLIC = ("id", "url", "events", "label", "enabled", "created_at")


def _public(row: dict) -> dict:
    return {k: row.get(k) for k in PUBLIC}


async def _own(sdb, ctx, hook_id: str) -> dict:
    rows = await sdb.select("webhook_subscriptions", {"id": hook_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Webhook not found")
    return rows[0]


@router.get("/events")
async def event_types(ctx: AdminMember):
    return list(events.EVENT_TYPES)


@router.get("")
async def list_hooks(ctx: AdminMember, sdb: ServiceDb):
    return [_public(r) for r in await sdb.select("webhook_subscriptions", {"account_id": ctx.account_id}, order="created_at.desc")]


@router.post("", status_code=201)
async def create_hook(body: HookCreate, ctx: AdminMember, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    if len(await sdb.select("webhook_subscriptions", {"account_id": ctx.account_id})) >= MAX_HOOKS:
        raise HTTPException(409, f"You can have up to {MAX_HOOKS} webhooks")
    try:
        await events.check_url(body.url)
    except events.UnsafeUrl as exc:
        raise HTTPException(422, str(exc)) from exc
    secret = "whsec_" + secrets.token_urlsafe(32)
    row = await sdb.insert("webhook_subscriptions", {"account_id": ctx.account_id, "url": body.url, "events": body.events, "label": body.label, "secret_cipher": encrypt(secret, settings), "enabled": True, "created_by": ctx.user.id})
    await audit.record(sdb, scope="account", action="webhook.create", actor_id=ctx.user.id, account_id=ctx.account_id, target=row["id"], details={"url": body.url, "events": body.events})
    return {**_public(row), "secret": secret}  # the secret is shown only now


class HookPatch(BaseModel):
    url: str | None = Field(None, max_length=500)
    events: list[str] | None = Field(None, min_length=1, max_length=10)
    label: str | None = Field(None, max_length=80)
    enabled: bool | None = None


@router.patch("/{hook_id}")
async def update_hook(hook_id: str, body: HookPatch, ctx: AdminMember, sdb: ServiceDb):
    """Change where a webhook goes, its events, label, or switch it on/off. The secret stays the same."""
    await _own(sdb, ctx, hook_id)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(422, "Nothing to change")
    if "events" in patch:
        unknown = [e for e in patch["events"] if e != "*" and e not in events.EVENT_TYPES]
        if unknown:
            raise HTTPException(422, f"Unknown events: {', '.join(unknown)}")
    if "url" in patch:
        try:
            await events.check_url(patch["url"])
        except events.UnsafeUrl as exc:
            raise HTTPException(422, str(exc)) from exc
    await sdb.update("webhook_subscriptions", {"id": hook_id, "account_id": ctx.account_id}, patch)
    await audit.record(sdb, scope="account", action="webhook.update", actor_id=ctx.user.id, account_id=ctx.account_id, target=hook_id, details=patch)
    return _public((await sdb.select("webhook_subscriptions", {"id": hook_id, "account_id": ctx.account_id}, limit=1))[0])


@router.delete("/{hook_id}", status_code=204)
async def delete_hook(hook_id: str, ctx: AdminMember, sdb: ServiceDb):
    await _own(sdb, ctx, hook_id)
    await sdb.delete("webhook_subscriptions", {"id": hook_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="webhook.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=hook_id)


@router.post("/{hook_id}/ping")
async def ping(hook_id: str, ctx: AdminMember, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    """Send a test event right now and report what the receiver answered."""
    await _own(sdb, ctx, hook_id)
    queued = await events.emit(sdb, ctx.account_id, "test.ping", {"message": "Hello from AutoShift"}, only_subscription=hook_id)
    result = await events.deliver_pending(sdb, settings)
    last = (await sdb.select("webhook_deliveries", {"subscription_id": hook_id}, order="created_at.desc", limit=1)) or [{}]
    return {"queued": queued, "result": result, "status": last[0].get("status"), "last_status": last[0].get("last_status"), "error": last[0].get("last_error")}


@router.get("/{hook_id}/deliveries")
async def deliveries(hook_id: str, ctx: AdminMember, sdb: ServiceDb):
    await _own(sdb, ctx, hook_id)
    rows = await sdb.select("webhook_deliveries", {"subscription_id": hook_id, "account_id": ctx.account_id}, order="created_at.desc", limit=50)
    return [{k: r.get(k) for k in ("id", "event", "status", "attempts", "last_status", "last_error", "created_at")} for r in rows]

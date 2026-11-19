"""AutoShift's own WhatsApp templates for a business (see wa_templates.py): their state, one-click
submit to Meta, and a refresh of Meta's review result."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import audit, wa_templates
from ..deps import AdminMember, Bridge, Member, ServiceDb
from ..web_bridge import BridgeError

router = APIRouter(prefix="/v1/system-templates", tags=["system-templates"])


class SubmitBody(BaseModel):
    language: Literal["en", "pt", "es", "ko"] = "en"


@router.get("")
async def get_status(ctx: Member, sdb: ServiceDb):
    return await wa_templates.status(sdb, ctx.account_id)


@router.post("/refresh")
async def refresh(ctx: AdminMember, sdb: ServiceDb, bridge: Bridge):
    """Ask Meta for the latest review results (approved / rejected)."""
    try:
        await bridge.call("templates_sync", ctx.account_id, ctx.user.id, ctx.role)
    except BridgeError as exc:
        raise HTTPException(exc.status if exc.status < 500 else 502, exc.detail) from exc
    return await wa_templates.status(sdb, ctx.account_id)


@router.post("/{kind}")
async def submit(kind: Literal["order", "reminder"], body: SubmitBody, ctx: AdminMember, sdb: ServiceDb, bridge: Bridge):
    """Submit the template to the business's WhatsApp account for Meta's review."""
    current = (await wa_templates.status(sdb, ctx.account_id))[kind]
    if current["status"] in ("APPROVED", "PENDING"):
        return await wa_templates.status(sdb, ctx.account_id)
    try:
        await bridge.call("templates_submit", ctx.account_id, ctx.user.id, ctx.role, template=wa_templates.template_body(kind, body.language))
    except BridgeError as exc:
        raise HTTPException(exc.status if exc.status < 500 else 502, exc.detail) from exc
    await audit.record(sdb, scope="account", action="template.submit", actor_id=ctx.user.id, account_id=ctx.account_id, target=wa_templates.NAMES[kind], details={"language": body.language, "system": True})
    return await wa_templates.status(sdb, ctx.account_id)

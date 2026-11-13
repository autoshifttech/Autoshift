from fastapi import APIRouter, HTTPException

from .. import audit, key_limits
from dataclasses import asdict
from typing import Annotated

from fastapi import Depends

from .. import ai_runner
from ..config import Settings, get_settings
from ..deps import AdminMember, Member, ServiceDb, UserDb, get_llm
from ..schemas import AssistantCreate, AssistantPatch, ReplyTest

router = APIRouter(prefix="/v1/assistants", tags=["assistants"])


def _dump(model) -> dict:
    return model.model_dump(exclude_unset=True, mode="json")


@router.get("")
async def list_assistants(ctx: Member, db: UserDb):
    return await db.select("assistants", {"account_id": ctx.account_id}, order="created_at.asc")


@router.post("", status_code=201)
async def create_assistant(body: AssistantCreate, ctx: AdminMember, db: UserDb, sdb: ServiceDb):
    row = await db.insert("assistants", {**body.model_dump(mode="json"), "account_id": ctx.account_id, "created_by": ctx.user.id})
    await audit.record(sdb, scope="account", action="assistant.create", actor_id=ctx.user.id, account_id=ctx.account_id, target=row["id"], details={"name": row["name"]})
    return row


async def _get(db, ctx, assistant_id: str) -> dict:
    rows = await db.select("assistants", {"id": assistant_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Assistant not found")
    return rows[0]


@router.get("/{assistant_id}")
async def get_assistant(assistant_id: str, ctx: Member, db: UserDb):
    return await _get(db, ctx, assistant_id)


@router.patch("/{assistant_id}")
async def update_assistant(assistant_id: str, body: AssistantPatch, ctx: AdminMember, db: UserDb, sdb: ServiceDb):
    await _get(db, ctx, assistant_id)
    patch = _dump(body)
    if not patch:
        raise HTTPException(422, "Nothing to change")
    rows = await db.update("assistants", {"id": assistant_id, "account_id": ctx.account_id}, patch)
    if not rows:
        raise HTTPException(404, "Assistant not found")
    await audit.record(sdb, scope="account", action="assistant.update", actor_id=ctx.user.id, account_id=ctx.account_id, target=assistant_id, details={"fields": sorted(patch)})
    return rows[0]


@router.delete("/{assistant_id}", status_code=204)
async def delete_assistant(assistant_id: str, ctx: AdminMember, db: UserDb, sdb: ServiceDb):
    existing = await _get(db, ctx, assistant_id)
    await db.delete("assistants", {"id": assistant_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="assistant.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=assistant_id, details={"name": existing["name"]})


@router.post("/{assistant_id}/test-reply")
async def test_reply(assistant_id: str, body: ReplyTest, ctx: AdminMember, db: UserDb, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)], llm: Annotated[object, Depends(get_llm)]):
    """Preview a reply. Uses the real model and costs one AI reply from the wallet."""
    assistant = await _get(db, ctx, assistant_id)
    await key_limits.check(sdb, ctx.user, "ai_replies")
    out = await ai_runner.reply(sdb, llm, settings, assistant, body.history, body.message, ref=f"test:{ctx.account_id}:{body.idempotency_key}", live=False)
    await key_limits.consume(sdb, ctx.user, "ai_replies")
    await audit.record(sdb, scope="account", action="assistant.test_reply", actor_id=ctx.user.id, account_id=ctx.account_id, target=assistant_id, details={"status": out.status})
    return asdict(out)

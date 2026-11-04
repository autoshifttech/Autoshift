from fastapi import APIRouter, HTTPException

from .. import audit
from ..deps import AdminMember, Member, ServiceDb, UserDb
from ..schemas import AssistantCreate, AssistantPatch

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

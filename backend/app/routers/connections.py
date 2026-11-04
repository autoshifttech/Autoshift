import json

from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated

from .. import audit
from ..config import Settings, get_settings
from ..deps import AdminMember, Member, ServiceDb, UserDb
from ..schemas import ConnectionCreate
from ..security import encrypt, mask

router = APIRouter(prefix="/v1/connections", tags=["connections"])


@router.get("")
async def list_connections(ctx: Member, db: UserDb):
    """Safe details only. Secrets are never returned."""
    return await db.select("flow_connections", {"account_id": ctx.account_id}, order="created_at.desc")


@router.post("", status_code=201)
async def create_connection(
    body: ConnectionCreate,
    ctx: AdminMember,
    db: UserDb,
    sdb: ServiceDb,
    settings: Annotated[Settings, Depends(get_settings)],
):
    if body.kind == "google":
        if not body.google:
            raise HTTPException(422, "Paste the service account key")
        detail = json.loads(body.google.service_account_json)["client_email"]
        mode = None
        secret = body.google.service_account_json
        default_name = detail
    else:
        if not body.razorpay:
            raise HTTPException(422, "Enter the Razorpay keys")
        rz = body.razorpay
        detail = mask(rz.key_id)
        mode = "live" if "_live_" in rz.key_id else "test"
        secret = json.dumps(rz.model_dump())
        default_name = f"Razorpay — {mode}"

    row = await db.insert(
        "flow_connections",
        {"account_id": ctx.account_id, "kind": body.kind, "name": body.name.strip() or default_name, "detail": detail, "mode": mode, "created_by": ctx.user.id},
    )
    try:
        await sdb.insert("flow_connection_secrets", {"connection_id": row["id"], "ciphertext": encrypt(secret, settings)})
    except Exception:
        # Never leave a connection that has no secret behind.
        await db.delete("flow_connections", {"id": row["id"], "account_id": ctx.account_id})
        raise
    await audit.record(sdb, scope="account", action="connection.create", actor_id=ctx.user.id, account_id=ctx.account_id, target=row["id"], details={"kind": body.kind})
    return row


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(connection_id: str, ctx: AdminMember, db: UserDb, sdb: ServiceDb):
    rows = await db.select("flow_connections", {"id": connection_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Connection not found")
    await db.delete("flow_connections", {"id": connection_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="connection.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=connection_id, details={"kind": rows[0]["kind"]})

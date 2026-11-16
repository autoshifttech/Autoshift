"""The business's product list (from an Excel or CSV file on the Files page)."""

import base64
import binascii
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import audit, catalog
from ..deps import AdminMember, Member, ServiceDb

router = APIRouter(prefix="/v1/catalog", tags=["catalog"])


class CatalogImport(BaseModel):
    file_name: str = Field(min_length=1, max_length=200)
    content_base64: str = Field(min_length=4, max_length=3_000_000)
    file_url: str | None = Field(None, max_length=1000)
    dry_run: bool = False


@router.get("")
async def get_catalog(ctx: Member, sdb: ServiceDb):
    """The product list, or null when none has been imported."""
    rows = await sdb.select("product_catalog", {"account_id": ctx.account_id}, limit=1)
    return rows[0] if rows else None


@router.post("/import")
async def import_catalog(body: CatalogImport, ctx: AdminMember, sdb: ServiceDb):
    """Read the file and make it the product list (replacing the previous one). dry_run only checks it."""
    try:
        data = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, "The file could not be read") from exc
    try:
        products, columns, skipped = catalog.parse_file(body.file_name, data)
    except catalog.CatalogError as exc:
        raise HTTPException(422, str(exc)) from exc
    summary = {"file_name": body.file_name, "count": len(products), "columns": columns, "skipped_rows": skipped[:50], "sample": products[:3]}
    if body.dry_run:
        return summary
    row = {
        "account_id": ctx.account_id, "file_name": body.file_name[:200], "file_url": body.file_url,
        "products": products, "columns": columns, "updated_by": ctx.user.id, "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await sdb.upsert("product_catalog", row, on_conflict="account_id")
    await audit.record(sdb, scope="account", action="catalog.import", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.file_name[:200], details={"products": len(products), "skipped": len(skipped)})
    return summary


@router.delete("", status_code=204)
async def delete_catalog(ctx: AdminMember, sdb: ServiceDb):
    await sdb.delete("product_catalog", {"account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="catalog.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target="product_catalog", details={})

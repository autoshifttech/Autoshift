"""The business's product list (from an Excel or CSV file on the Files page)."""

import base64
import binascii
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from .. import audit, catalog, catalog_feed
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
        # A file chosen by hand replaces the website sync, so the next hourly sync doesn't undo it.
        "source": "file", "feed_url": None, "feed_error": None,
    }
    await sdb.upsert("product_catalog", row, on_conflict="account_id")
    await audit.record(sdb, scope="account", action="catalog.import", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.file_name[:200], details={"products": len(products), "skipped": len(skipped)})
    return summary


@router.delete("", status_code=204)
async def delete_catalog(ctx: AdminMember, sdb: ServiceDb):
    await sdb.delete("product_catalog", {"account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="catalog.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target="product_catalog", details={})


# ------------------------------------------------------------------ the business's own website
class FeedLink(BaseModel):
    url: str = Field(min_length=10, max_length=1000)

    @field_validator("url")
    @classmethod
    def _https(cls, v: str) -> str:
        v = v.strip()
        if not v.lower().startswith("https://"):
            raise ValueError("The feed link must start with https://")
        return v


class ProductsPush(BaseModel):
    products: list[dict] = Field(max_length=catalog.MAX_PRODUCTS)


@router.put("/feed")
async def set_feed(body: FeedLink, ctx: AdminMember, sdb: ServiceDb):
    """Keep the product list in step with a feed link on the website (read now, then every hour)."""
    try:
        summary = await catalog_feed.sync(sdb, ctx.account_id, body.url, actor_id=ctx.user.id)
    except catalog_feed.FeedError as exc:
        raise HTTPException(422, str(exc)) from exc
    await catalog_feed.record(sdb, ctx.account_id, ctx.user.id, "catalog.feed_set", {"url": body.url, "products": summary["count"]})
    return summary


@router.post("/feed/sync")
async def sync_feed(ctx: AdminMember, sdb: ServiceDb):
    rows = await sdb.select("product_catalog", {"account_id": ctx.account_id}, limit=1)
    if not rows or not rows[0].get("feed_url"):
        raise HTTPException(409, "There is no feed link to sync")
    try:
        return await catalog_feed.sync(sdb, ctx.account_id, rows[0]["feed_url"], actor_id=ctx.user.id)
    except catalog_feed.FeedError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/feed", status_code=204)
async def stop_feed(ctx: AdminMember, sdb: ServiceDb):
    """Stop syncing from the website; the current product list stays."""
    await sdb.update("product_catalog", {"account_id": ctx.account_id}, {"feed_url": None, "feed_error": None})
    await catalog_feed.record(sdb, ctx.account_id, ctx.user.id, "catalog.feed_stopped", {})


@router.put("/products")
async def push_products(body: ProductsPush, ctx: AdminMember, sdb: ServiceDb):
    """The website sends its whole product list (JSON). It replaces the current list."""
    try:
        products, columns, skipped = catalog.to_products(catalog.read_json(body.products))
    except catalog.CatalogError as exc:
        raise HTTPException(422, str(exc)) from exc
    await catalog_feed.save(sdb, ctx.account_id, products, columns, file_name="Website (API)", source="api", actor_id=ctx.user.id, extra={"feed_url": None, "feed_error": None})
    await catalog_feed.record(sdb, ctx.account_id, ctx.user.id, "catalog.api_push", {"products": len(products), "skipped": len(skipped)})
    return {"count": len(products), "columns": columns, "skipped_rows": skipped[:50]}

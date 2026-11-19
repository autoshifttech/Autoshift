"""Keeping the product list in step with the business's own website.

Two ways: a product feed link (CSV, Excel or JSON on the website) that AutoShift re-reads every hour
and on "Sync now", or the website sending its products to PUT /v1/catalog/products. Either way the
product list the AI sells from is replaced; when a sync fails the previous list stays and the error
is shown on the Files page.
"""

import logging
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx

from . import audit, catalog, events
from .db import Db

log = logging.getLogger("autoshift.catalog_feed")
MAX_REDIRECTS = 3
TIMEOUT = 20


class FeedError(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def kind_of(url: str, content_type: str, data: bytes) -> str:
    """The file name to read the feed as (the extension decides the reader)."""
    path = urlparse(url).path.lower()
    for ext in (".csv", ".xlsx", ".json"):
        if path.endswith(ext):
            return f"feed{ext}"
    ct = content_type.lower()
    if "json" in ct:
        return "feed.json"
    if "spreadsheet" in ct or "excel" in ct:
        return "feed.xlsx"
    head = data[:64].lstrip()
    if head[:1] in (b"[", b"{"):
        return "feed.json"
    if head[:2] == b"PK":
        return "feed.xlsx"
    return "feed.csv"


async def fetch_bytes(url: str) -> tuple[str, bytes]:
    """Download the feed: public https addresses only, at most 2 MB. Replaced in tests."""
    for _ in range(MAX_REDIRECTS + 1):
        try:
            await events.check_url(url)
        except events.UnsafeUrl as exc:
            raise FeedError(str(exc)) from exc
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
                async with client.stream("GET", url, headers={"User-Agent": "AutoShift product sync"}) as res:
                    if res.status_code in (301, 302, 303, 307, 308) and res.headers.get("location"):
                        url = urljoin(url, res.headers["location"])
                        continue
                    if res.status_code >= 400:
                        raise FeedError(f"The website answered {res.status_code}")
                    body = b""
                    async for chunk in res.aiter_bytes():
                        body += chunk
                        if len(body) > catalog.MAX_BYTES:
                            raise FeedError("The feed is larger than 2 MB")
                    return res.headers.get("content-type", ""), body
        except httpx.HTTPError as exc:
            raise FeedError(f"The website could not be reached ({exc.__class__.__name__})") from exc
    raise FeedError("The feed link redirects too many times")


async def save(sdb: Db, account_id: str, products: list[dict], columns: list[str], *, file_name: str, source: str, actor_id: str | None, extra: dict | None = None) -> None:
    row = {
        "account_id": account_id, "file_name": file_name[:200], "products": products, "columns": columns,
        "updated_by": actor_id, "updated_at": _now(), "source": source, **(extra or {}),
    }
    await sdb.upsert("product_catalog", row, on_conflict="account_id")


async def sync(sdb: Db, account_id: str, url: str, *, actor_id: str | None = None) -> dict:
    """Read the feed and make it the product list. On failure the previous list stays."""
    try:
        content_type, data = await fetch_bytes(url)
        products, columns, skipped = catalog.parse_file(kind_of(url, content_type, data), data)
    except (FeedError, catalog.CatalogError) as exc:
        rows = await sdb.select("product_catalog", {"account_id": account_id}, limit=1)
        if rows:
            await sdb.update("product_catalog", {"account_id": account_id}, {"feed_error": str(exc)[:300]})
        raise FeedError(str(exc)) from exc
    host = urlparse(url).netloc
    await save(sdb, account_id, products, columns, file_name=f"Website feed ({host})", source="feed", actor_id=actor_id,
               extra={"feed_url": url, "feed_synced_at": _now(), "feed_error": None})
    return {"count": len(products), "columns": columns, "skipped_rows": skipped[:50], "sample": products[:3]}


async def sync_all(sdb: Db) -> int:
    """The hourly pass over every business with a feed link. Returns how many synced."""
    done = 0
    for row in await sdb.select("product_catalog", {"feed_url": ("neq", "")}, limit=1000):
        if not row.get("feed_url"):
            continue
        try:
            await sync(sdb, row["account_id"], row["feed_url"])
            done += 1
        except FeedError as exc:
            log.warning("product feed failed for %s: %s", row["account_id"], exc)
        except Exception:  # noqa: BLE001 - one business must not stop the others
            log.exception("product feed crashed for %s", row["account_id"])
    return done


async def record(sdb: Db, account_id: str, actor_id: str | None, action: str, details: dict) -> None:
    await audit.record(sdb, scope="account", action=action, actor_id=actor_id, account_id=account_id, target="product_catalog", details=details)

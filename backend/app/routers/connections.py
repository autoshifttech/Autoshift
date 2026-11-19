import json
import logging

import httpx
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from .. import audit, cashfree, google_api, store_sync
from ..config import Settings, get_settings
from ..deps import AdminMember, Bridge, Member, ServiceDb, UserDb
from ..schemas import ConnectionCreate, StoreOptions
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
    extra: dict | None = None
    if body.kind == "google":
        if not body.google:
            raise HTTPException(422, "Paste the service account key")
        detail = json.loads(body.google.service_account_json)["client_email"]
        mode = None
        secret = body.google.service_account_json
        default_name = detail
    elif body.kind in store_sync.STORE_KINDS:
        try:
            if body.kind == "shopify":
                if not body.shopify:
                    raise HTTPException(422, "Enter the Shopify details")
                keys = {k: v.strip() for k, v in body.shopify.model_dump().items() if v}
                keys["shop"] = store_sync.shop_domain(body.shopify.shop)
                detail = keys["shop"]
            else:
                if not body.woocommerce:
                    raise HTTPException(422, "Enter the WooCommerce details")
                keys = {**body.woocommerce.model_dump(), "url": store_sync.woo_site(body.woocommerce.url)}
                detail = keys["url"].removeprefix("https://")
            shop_name = await store_sync.verify(body.kind, keys)
        except store_sync.StoreError as exc:
            raise HTTPException(422 if exc.status < 500 else 502, exc.message) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"{store_sync.LABEL[body.kind]} could not be reached") from exc
        mode = None
        secret = json.dumps(keys)
        default_name = shop_name
        extra = {"settings": {"sync_products": True, "push_orders": True}}
    elif body.kind == "cashfree":
        if not body.cashfree:
            raise HTTPException(422, "Enter the Cashfree keys")
        cf = body.cashfree
        mode = cf.mode or cashfree.mode_for(cf.app_id, cf.secret_key)
        detail = mask(cf.app_id)
        secret = json.dumps({"app_id": cf.app_id.strip(), "secret_key": cf.secret_key.strip()})
        default_name = f"Cashfree — {mode}"
    else:
        if not body.razorpay:
            raise HTTPException(422, "Enter the Razorpay keys")
        rz = body.razorpay
        detail = mask(rz.key_id)
        mode = "live" if "_live_" in rz.key_id else "test"
        secret = json.dumps(rz.model_dump())
        default_name = f"Razorpay — {mode}"

    return await _save(db, sdb, settings, account_id=ctx.account_id, user_id=ctx.user.id, kind=body.kind,
                       name=body.name.strip() or default_name, detail=detail, mode=mode, secret=secret, extra=extra)


async def _save(db, sdb, settings: Settings, *, account_id: str, user_id: str, kind: str, name: str, detail: str, mode: str | None, secret: str, extra: dict | None = None) -> dict:
    """The connection row (safe details) and its encrypted secret, both or neither."""
    row = await db.insert(
        "flow_connections",
        {"account_id": account_id, "kind": kind, "name": name[:80], "detail": detail, "mode": mode, "created_by": user_id, **(extra or {})},
    )
    try:
        await sdb.insert("flow_connection_secrets", {"connection_id": row["id"], "ciphertext": encrypt(secret, settings)})
    except Exception:
        # Never leave a connection that has no secret behind.
        await db.delete("flow_connections", {"id": row["id"], "account_id": account_id})
        raise
    await audit.record(sdb, scope="account", action="connection.create", actor_id=user_id, account_id=account_id, target=row["id"], details={"kind": kind})
    return row


# ------------------------------------------------------------ Connect Google (sign in)

log = logging.getLogger("autoshift.connections")


@router.get("/google/available")
async def google_available(_: Member, settings: Annotated[Settings, Depends(get_settings)]):
    """Whether "Connect Google" can sign in here (the platform set up a Google OAuth client)."""
    return {"oauth": google_api.oauth_ready(settings)}


@router.post("/google/start")
async def google_start(ctx: AdminMember, settings: Annotated[Settings, Depends(get_settings)], name: str = ""):
    """The Google sign-in page to send the browser to. Comes back to /google/callback."""
    if not google_api.oauth_ready(settings):
        raise HTTPException(409, "Google sign-in isn't set up on this AutoShift yet. Add a service account key instead.")
    state = google_api.make_state(settings, ctx.account_id, ctx.user.id, name)
    return {"url": google_api.auth_url(settings, state)}


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    sdb: ServiceDb,
    settings: Annotated[Settings, Depends(get_settings)],
    code: str = "",
    state: str = "",
    error: str = "",
):
    """Google sends the browser back here. Saves the connection, then returns to Connections."""
    back = settings.site_url.rstrip("/") + "/flows/connections"

    def done(**q: str) -> RedirectResponse:
        return RedirectResponse(back + "?" + urlencode(q), status_code=303)

    if error:
        return done(google="cancelled" if error == "access_denied" else "error", reason=error[:100])
    try:
        info = google_api.read_state(settings, state)
        # The person who started this must still be an admin of that business.
        members = await sdb.select("profiles", {"user_id": info["u"]}, limit=1)
        if not members or str(members[0].get("account_id")) != info["a"] or members[0].get("account_role") not in ("owner", "admin"):
            raise google_api.GoogleError(403, "Only owners and admins can connect accounts")
        tokens = await google_api.exchange_code(settings, code)
        email = str((await google_api.userinfo(tokens["access_token"])).get("email") or "Google account")
        await _save(sdb, sdb, settings, account_id=info["a"], user_id=info["u"], kind="google", name=info.get("n") or email,
                    detail=email, mode=None, secret=google_api.dumps_oauth_secret(tokens, email))
    except google_api.GoogleError as exc:
        return done(google="error", reason=exc.message[:200])
    except Exception as exc:  # noqa: BLE001 - never show a raw error page to the business
        log.exception("google connect failed: %s", exc)
        return done(google="error", reason="Something went wrong. Try again.")
    return done(google="connected")


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(connection_id: str, ctx: AdminMember, db: UserDb, sdb: ServiceDb):
    rows = await db.select("flow_connections", {"id": connection_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Connection not found")
    await db.delete("flow_connections", {"id": connection_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="connection.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=connection_id, details={"kind": rows[0]["kind"]})


# ------------------------------------------------------------ online store (Shopify / WooCommerce)

async def _store(sdb, account_id: str, connection_id: str) -> dict:
    rows = await sdb.select("flow_connections", {"id": connection_id, "account_id": account_id}, limit=1) if _is_uuid(connection_id) else []
    if not rows or rows[0]["kind"] not in store_sync.STORE_KINDS:
        raise HTTPException(404, "Store connection not found")
    return rows[0]


def _is_uuid(value: str) -> bool:
    import uuid

    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


@router.get("/{connection_id}/store")
async def store_status(connection_id: str, ctx: Member, sdb: ServiceDb):
    """How the store sync is doing: products, last sync, orders sent and the last problem."""
    conn = await _store(sdb, ctx.account_id, connection_id)
    cat = await sdb.select("product_catalog", {"account_id": ctx.account_id}, limit=1)
    mine = bool(cat) and cat[0].get("store_connection_id") == conn["id"]
    orders = await sdb.select("shop_orders", {"account_id": ctx.account_id, "ext_source": conn["kind"]}, order="updated_at.desc", limit=200)
    failed = [o for o in orders if not o.get("ext_order_id") and o.get("ext_error")]
    return {
        **store_sync.options(conn),
        "products": len(cat[0].get("products") or []) if mine else 0,
        "synced_at": cat[0].get("feed_synced_at") if mine else None,
        "sync_error": cat[0].get("feed_error") if mine else None,
        "orders_sent": sum(1 for o in orders if o.get("ext_order_id")),
        "orders_failed": [{"number": o["number"], "error": o["ext_error"]} for o in failed[:5]],
    }


@router.post("/{connection_id}/sync")
async def store_sync_now(connection_id: str, ctx: AdminMember, sdb: ServiceDb, bridge: Bridge, settings: Annotated[Settings, Depends(get_settings)]):
    """Products now (when switched on), then any orders waiting to be sent or updated."""
    conn = await _store(sdb, ctx.account_id, connection_id)
    newest = await store_sync.store_connection(sdb, ctx.account_id)
    if not newest or newest["id"] != conn["id"]:
        raise HTTPException(409, "Only your newest store connection is used. Remove the older one or this one.")
    out: dict = {"products": None}
    if store_sync.options(conn)["sync_products"]:
        try:
            out["products"] = await store_sync.sync_products(sdb, settings, conn, actor_id=ctx.user.id)
        except store_sync.StoreError as exc:
            raise HTTPException(422 if exc.status < 500 else 502, exc.message) from exc
    out["orders"] = await store_sync.sync_orders(sdb, settings, bridge, account_id=ctx.account_id)
    return out


@router.patch("/{connection_id}")
async def store_options(connection_id: str, body: StoreOptions, ctx: AdminMember, sdb: ServiceDb):
    conn = await _store(sdb, ctx.account_id, connection_id)
    merged = {**(conn.get("settings") or {}), **body.model_dump(exclude_none=True)}
    rows = await sdb.update("flow_connections", {"id": conn["id"], "account_id": ctx.account_id}, {"settings": merged})
    await audit.record(sdb, scope="account", action="connection.update", actor_id=ctx.user.id, account_id=ctx.account_id, target=conn["id"], details=body.model_dump(exclude_none=True))
    return rows[0] if rows else {**conn, "settings": merged}

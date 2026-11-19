"""Shopify and WooCommerce: the business's online store and its WhatsApp orders, kept in step.

- Products: every hour the store's live products (each variant on its own) become the product list
  the AI shop assistant and flows sell from. The store stays the place to edit products.
- Orders: an AI order that is paid (or cash on delivery) is created in the store, so stock,
  invoices and shipping run there as usual.
- Status: every few minutes we ask the store about the orders we sent. Fulfilled (with tracking),
  delivered or cancelled there moves the order here and tells the customer on WhatsApp.

Polling instead of store webhooks keeps the set-up to pasting API keys. Keys are stored encrypted
in flow_connection_secrets; options (send orders, sync products) in flow_connections.settings.
"""

import html
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from . import audit, catalog, shop_orders, wa_templates
from .config import Settings
from .db import Db
from .security import decrypt

log = logging.getLogger("autoshift.store_sync")

STORE_KINDS = ("shopify", "woocommerce")
SHOPIFY_VERSION = "2025-10"
MAX_PRODUCTS = catalog.MAX_PRODUCTS
PUSH_DAYS = 7  # orders older than this are never sent
RETRY_MINUTES = 30  # after a failed send, wait this long before trying again
POLL_DAYS = 30  # stop asking about an order this long after it was sent
LABEL = {"shopify": "Shopify", "woocommerce": "WooCommerce"}


class StoreError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _text(value: Any, limit: int = 200) -> str:
    plain = re.sub(r"<[^>]+>", " ", html.unescape(str(value or "")))
    return re.sub(r"\s+", " ", plain).strip()[:limit]


def options(connection: dict) -> dict:
    s = connection.get("settings") or {}
    return {"sync_products": s.get("sync_products", True) is not False, "push_orders": s.get("push_orders", True) is not False}


# ------------------------------------------------------------------ keys and addresses

def shop_domain(value: str) -> str:
    """'mystore', 'mystore.myshopify.com' or its admin link → mystore.myshopify.com."""
    v = value.strip().lower()
    v = re.sub(r"^https?://", "", v).split("/")[0]
    m = re.search(r"admin\.shopify\.com/store/([a-z0-9-]+)", value.lower())
    if m:
        v = m.group(1)
    if not v.endswith(".myshopify.com"):
        v = v.split(".")[0] + ".myshopify.com"
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com", v):
        raise StoreError(422, "Enter your shop's address, like mystore.myshopify.com")
    return v


def woo_site(value: str) -> str:
    """The WordPress site's address, https only (the keys travel with every call)."""
    v = value.strip()
    if not re.match(r"^https?://", v):
        v = "https://" + v
    u = urlparse(v)
    if u.scheme != "https" or not u.netloc or "." not in u.netloc:
        raise StoreError(422, "Enter your website's https:// address")
    return f"https://{u.netloc}{u.path.rstrip('/')}"


async def keys_of(sdb: Db, settings: Settings, connection: dict) -> dict:
    rows = await sdb.select("flow_connection_secrets", {"connection_id": connection["id"]}, limit=1)
    if not rows:
        raise StoreError(409, "This store connection has no keys; add it again")
    return json.loads(decrypt(rows[0]["ciphertext"], settings))


# ------------------------------------------------------------------ HTTP (replaced in tests)

async def http(method: str, url: str, *, headers: dict | None = None, json_body: Any = None, data: dict | None = None,
               auth: tuple[str, str] | None = None, params: dict | None = None) -> tuple[int, Any, dict]:
    async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
        res = await client.request(method, url, headers=headers, json=json_body, data=data, auth=auth, params=params)
    try:
        body = res.json()
    except ValueError:
        body = res.text[:300]
    return res.status_code, body, dict(res.headers)


# ------------------------------------------------------------------ Shopify

_tokens: dict[str, tuple[str, float]] = {}


async def shopify_token(keys: dict) -> str:
    """An Admin API access token (shpat_…), or one from the app's client id and secret (Dev Dashboard apps)."""
    if keys.get("access_token"):
        return keys["access_token"]
    cache_key = f"{keys['shop']}|{keys.get('client_id')}"
    hit = _tokens.get(cache_key)
    if hit and hit[1] > time.time() + 300:
        return hit[0]
    status, body, _ = await http("POST", f"https://{keys['shop']}/admin/oauth/access_token", data={
        "grant_type": "client_credentials", "client_id": keys.get("client_id", ""), "client_secret": keys.get("client_secret", ""),
    })
    if status >= 400 or not isinstance(body, dict) or not body.get("access_token"):
        raise StoreError(401 if status in (400, 401, 403) else 502, "Shopify refused the app's client ID and secret")
    _tokens[cache_key] = (body["access_token"], time.time() + int(body.get("expires_in") or 86000))
    return body["access_token"]


async def shopify_gql(keys: dict, query: str, variables: dict | None = None) -> dict:
    token = await shopify_token(keys)
    status, body, _ = await http("POST", f"https://{keys['shop']}/admin/api/{SHOPIFY_VERSION}/graphql.json",
                                 headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
                                 json_body={"query": query, "variables": variables or {}})
    if status in (401, 403):
        raise StoreError(401, "Shopify refused the keys. Check the access token and its permissions.")
    if status == 404:
        raise StoreError(404, "No Shopify shop at that address")
    if status >= 400 or not isinstance(body, dict):
        raise StoreError(502, f"Shopify answered {status}")
    if body.get("errors"):
        first = body["errors"][0] if isinstance(body["errors"], list) else body["errors"]
        msg = first.get("message") if isinstance(first, dict) else str(first)
        raise StoreError(403 if "access" in str(msg).lower() else 502, f"Shopify: {str(msg)[:200]}")
    return body.get("data") or {}


SHOPIFY_PRODUCTS = """
query($after: String) {
  products(first: 50, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title productType vendor description onlineStoreUrl
      featuredMedia { preview { image { url } } }
      variants(first: 100) {
        nodes { id sku title price availableForSale inventoryQuantity inventoryItem { tracked } }
      }
    }
  }
}"""


def _gid_tail(gid: str) -> str:
    return str(gid).rsplit("/", 1)[-1]


async def shopify_products(keys: dict) -> list[dict]:
    out: list[dict] = []
    after = None
    for _ in range(40):
        data = await shopify_gql(keys, SHOPIFY_PRODUCTS, {"after": after})
        page = data.get("products") or {}
        for p in page.get("nodes") or []:
            variants = (p.get("variants") or {}).get("nodes") or []
            for v in variants:
                default = str(v.get("title") or "").lower() in ("default title", "")
                name = p["title"] if default or len(variants) == 1 else f"{p['title']} – {v['title']}"
                details: dict[str, str] = {}
                for label, value in (("Type", p.get("productType")), ("Brand", p.get("vendor")), ("About", _text(p.get("description"))),
                                     ("Link", p.get("onlineStoreUrl")), ("Image", ((p.get("featuredMedia") or {}).get("preview") or {}).get("image", {}).get("url") if p.get("featuredMedia") else None)):
                    if value:
                        details[label] = str(value)[:200]
                if not default and len(variants) > 1:
                    details["Option"] = str(v["title"])[:60]
                if not v.get("availableForSale"):
                    details["Stock"] = "0"
                elif (v.get("inventoryItem") or {}).get("tracked") and v.get("inventoryQuantity") is not None:
                    details["Stock"] = str(max(0, int(v["inventoryQuantity"])))
                try:
                    price = float(v.get("price") or 0)
                except ValueError:
                    continue
                if price <= 0:
                    continue
                out.append({
                    "code": (v.get("sku") or f"SH{_gid_tail(v['id'])[-8:]}")[:20], "name": name[:80], "price": price, "details": details,
                    "ext": {"source": "shopify", "product_id": p["id"], "variant_id": v["id"]},
                })
                if len(out) >= MAX_PRODUCTS:
                    return out
        if not (page.get("pageInfo") or {}).get("hasNextPage"):
            break
        after = page["pageInfo"]["endCursor"]
    return out


SHOPIFY_ORDER_CREATE = """
mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) {
    userErrors { field message }
    order { id name }
  }
}"""

SHOPIFY_ORDER_STATUS = """
query($id: ID!) {
  order(id: $id) {
    id name cancelledAt displayFulfillmentStatus
    fulfillments(first: 5) { displayStatus trackingInfo(first: 1) { number url company } }
  }
}"""


def _money(paise: int) -> dict:
    return {"shopMoney": {"amount": f"{int(paise) / 100:.2f}", "currencyCode": "INR"}}


def _split_name(name: str) -> tuple[str, str]:
    parts = (name or "Customer").strip().split(" ", 1)
    return parts[0][:60], (parts[1] if len(parts) > 1 else "")[:60]


async def shopify_create_order(keys: dict, order: dict, lines: list[dict]) -> dict:
    first, last = _split_name(order.get("customer_name") or "")
    phone = "+" + re.sub(r"\D", "", order.get("customer_phone") or "") if order.get("customer_phone") else None
    body: dict[str, Any] = {
        "lineItems": [{"variantId": ln["variant_id"], "quantity": ln["qty"], "priceSet": _money(ln["price_paise"])} for ln in lines],
        "financialStatus": "PAID" if order["payment_status"] == "paid" else "PENDING",
        "currency": "INR",
        "note": (f"WhatsApp order #{order['number']} (AutoShift). " + (order.get("note") or "")).strip()[:500],
        "tags": ["AutoShift", "WhatsApp", "COD" if order["payment_method"] == "cod" else "Paid online"],
        "shippingAddress": {"firstName": first, "lastName": last, "address1": (order.get("address") or "")[:250], "countryCode": "IN", **({"phone": phone} if phone else {})},
        "sourceName": "AutoShift WhatsApp",
    }
    if phone:
        body["phone"] = phone
    if int(order.get("delivery_paise") or 0) > 0:
        body["shippingLines"] = [{"title": "Delivery", "priceSet": _money(int(order["delivery_paise"]))}]
    data = await shopify_gql(keys, SHOPIFY_ORDER_CREATE, {"order": body, "options": {"sendReceipt": False, "inventoryBehaviour": "DECREMENT_OBEYING_POLICY"}})
    result = data.get("orderCreate") or {}
    if result.get("userErrors"):
        raise StoreError(422, "Shopify: " + "; ".join(str(e.get("message")) for e in result["userErrors"])[:250])
    made = result.get("order") or {}
    if not made.get("id"):
        raise StoreError(502, "Shopify made no order")
    return {"id": made["id"], "name": made.get("name") or ""}


async def shopify_order_state(keys: dict, ext_id: str) -> tuple[str | None, str]:
    """(our action or None, tracking text)."""
    data = await shopify_gql(keys, SHOPIFY_ORDER_STATUS, {"id": ext_id})
    o = data.get("order")
    if not o:
        return None, ""
    if o.get("cancelledAt"):
        return "cancelled", ""
    fulfillments = o.get("fulfillments") or []
    tracking = ""
    for f in fulfillments:
        for t in f.get("trackingInfo") or []:
            tracking = " ".join(x for x in (t.get("company"), t.get("number"), t.get("url")) if x)[:200]
    if any(str(f.get("displayStatus")) == "DELIVERED" for f in fulfillments):
        return "delivered", tracking
    if str(o.get("displayFulfillmentStatus")) in ("FULFILLED", "PARTIALLY_FULFILLED") or fulfillments:
        return "shipped", tracking
    return None, tracking


# ------------------------------------------------------------------ WooCommerce

async def woo(keys: dict, method: str, path: str, *, params: dict | None = None, body: Any = None) -> Any:
    status, data, headers = await http(method, f"{keys['url']}/wp-json/wc/v3{path}", auth=(keys["consumer_key"], keys["consumer_secret"]), params=params, json_body=body)
    if status in (401, 403):
        raise StoreError(401, "WooCommerce refused the keys. They need Read/Write permission.")
    if status == 404:
        raise StoreError(404, "No WooCommerce REST API at that address (is WooCommerce installed and are permalinks on?)")
    if 300 <= status < 400:
        raise StoreError(502, "The website redirected the call; use its exact https:// address")
    if status >= 400:
        msg = data.get("message") if isinstance(data, dict) else ""
        raise StoreError(502, f"WooCommerce answered {status}{': ' + _text(msg, 150) if msg else ''}")
    return data, headers


def _woo_product(p: dict, v: dict | None) -> dict | None:
    item = v or p
    try:
        price = float(item.get("price") or item.get("regular_price") or 0)
    except ValueError:
        return None
    if price <= 0:
        return None
    option = ", ".join(str(a.get("option")) for a in (v or {}).get("attributes") or [] if a.get("option"))
    details: dict[str, str] = {}
    cats = ", ".join(c.get("name", "") for c in p.get("categories") or [] if c.get("name"))
    image = ((v or {}).get("image") or {}).get("src") or ((p.get("images") or [{}])[0] or {}).get("src")
    for label, value in (("Category", cats), ("About", _text(p.get("short_description") or p.get("description"))), ("Link", p.get("permalink")), ("Image", image), ("Option", option)):
        if value:
            details[label] = str(value)[:200]
    if item.get("stock_status") == "outofstock" or item.get("purchasable") is False:
        details["Stock"] = "0"
    elif item.get("manage_stock") and item.get("stock_quantity") is not None:
        details["Stock"] = str(max(0, int(item["stock_quantity"])))
    code = item.get("sku") or (f"WC{v['id']}" if v else f"WC{p['id']}")
    name = f"{p.get('name')} – {option}" if option else str(p.get("name") or "")
    return {
        "code": str(code)[:20], "name": _text(name, 80), "price": price, "details": details,
        "ext": {"source": "woocommerce", "product_id": p["id"], **({"variation_id": v["id"]} if v else {})},
    }


async def woo_products(keys: dict) -> list[dict]:
    out: list[dict] = []
    for page in range(1, 21):
        data, headers = await woo(keys, "GET", "/products", params={"per_page": 100, "page": page, "status": "publish"})
        for p in data or []:
            if p.get("type") == "variable":
                variations, _ = await woo(keys, "GET", f"/products/{p['id']}/variations", params={"per_page": 100, "status": "publish"})
                for v in variations or []:
                    if (made := _woo_product(p, v)):
                        out.append(made)
            elif p.get("type") in ("simple", None, ""):
                if (made := _woo_product(p, None)):
                    out.append(made)
            if len(out) >= MAX_PRODUCTS:
                return out[:MAX_PRODUCTS]
        pages = int({k.lower(): v for k, v in headers.items()}.get("x-wp-totalpages") or 1)
        if page >= pages or not data:
            break
    return out


async def woo_create_order(keys: dict, order: dict, lines: list[dict]) -> dict:
    first, last = _split_name(order.get("customer_name") or "")
    phone = re.sub(r"\D", "", order.get("customer_phone") or "")
    person = {"first_name": first, "last_name": last, "address_1": (order.get("address") or "")[:250], "country": "IN", "phone": phone}
    paid = order["payment_status"] == "paid"
    body: dict[str, Any] = {
        "payment_method": "cod" if order["payment_method"] == "cod" else "autoshift",
        "payment_method_title": "Cash on delivery" if order["payment_method"] == "cod" else "Paid online (WhatsApp)",
        "set_paid": paid,
        "status": "processing",
        "billing": person,
        "shipping": {k: v for k, v in person.items() if k != "phone"},
        "customer_note": (f"WhatsApp order #{order['number']} (AutoShift). " + (order.get("note") or "")).strip()[:500],
        "line_items": [{"product_id": ln["product_id"], **({"variation_id": ln["variation_id"]} if ln.get("variation_id") else {}),
                        "quantity": ln["qty"], "total": f"{ln['price_paise'] * ln['qty'] / 100:.2f}"} for ln in lines],
        "meta_data": [{"key": "_autoshift_order", "value": str(order["id"])}],
    }
    if int(order.get("delivery_paise") or 0) > 0:
        body["shipping_lines"] = [{"method_id": "flat_rate", "method_title": "Delivery", "total": f"{int(order['delivery_paise']) / 100:.2f}"}]
    data, _ = await woo(keys, "POST", "/orders", body=body)
    if not isinstance(data, dict) or not data.get("id"):
        raise StoreError(502, "WooCommerce made no order")
    return {"id": str(data["id"]), "name": f"#{data.get('number') or data['id']}"}


async def woo_order_state(keys: dict, ext_id: str) -> tuple[str | None, str]:
    data, _ = await woo(keys, "GET", f"/orders/{ext_id}")
    status = str((data or {}).get("status") or "")
    tracking = ""
    for meta in (data or {}).get("meta_data") or []:
        # The WooCommerce Shipment Tracking extension keeps its numbers here.
        if meta.get("key") == "_wc_shipment_tracking_items" and isinstance(meta.get("value"), list) and meta["value"]:
            t = meta["value"][-1]
            tracking = " ".join(str(x) for x in (t.get("tracking_provider") or t.get("custom_tracking_provider"), t.get("tracking_number"), t.get("custom_tracking_link")) if x)[:200]
    if status in ("cancelled", "refunded", "failed"):
        return "cancelled", ""
    if status == "completed":
        return "shipped", tracking
    return None, tracking


# ------------------------------------------------------------------ one place for both stores

async def verify(kind: str, keys: dict) -> str:
    """Checks the keys with the store; returns a name to show (the shop's name)."""
    if kind == "shopify":
        data = await shopify_gql(keys, "{ shop { name } }")
        return str((data.get("shop") or {}).get("name") or keys["shop"])
    await woo(keys, "GET", "/products", params={"per_page": 1})
    return urlparse(keys["url"]).netloc


async def store_connection(sdb: Db, account_id: str) -> dict | None:
    rows = await sdb.select("flow_connections", {"account_id": account_id, "kind": ("in", list(STORE_KINDS))}, order="created_at.desc", limit=1)
    return rows[0] if rows else None


async def sync_products(sdb: Db, settings: Settings, connection: dict, *, actor_id: str | None = None) -> dict:
    """Make the store's live products the product list. On failure the previous list stays."""
    from . import catalog_feed

    account_id, kind = connection["account_id"], connection["kind"]
    try:
        keys = await keys_of(sdb, settings, connection)
        products = await (shopify_products(keys) if kind == "shopify" else woo_products(keys))
        if not products:
            raise StoreError(422, f"{LABEL[kind]} has no published products with a price")
    except (StoreError, httpx.HTTPError) as exc:
        reason = exc.message if isinstance(exc, StoreError) else f"{LABEL[kind]} could not be reached"
        if await sdb.select("product_catalog", {"account_id": account_id}, limit=1):
            await sdb.update("product_catalog", {"account_id": account_id}, {"feed_error": reason[:300]})
        raise StoreError(getattr(exc, "status", 502), reason) from exc
    seen: set[str] = set()
    unique = []
    for p in products:  # two variants with the same SKU: keep the first
        key = re.sub(r"\s+", "", p["code"].lower())
        if key not in seen:
            seen.add(key)
            unique.append(p)
    columns = sorted({k for p in unique for k in (p.get("details") or {})})
    await catalog_feed.save(sdb, account_id, unique, columns, file_name=f"{LABEL[kind]} ({connection.get('detail') or ''})".strip(), source=kind,
                            actor_id=actor_id, extra={"feed_url": None, "feed_synced_at": _now(), "feed_error": None, "store_connection_id": connection["id"]})
    await audit.record(sdb, scope="account", action="store.products_synced", actor_id=actor_id, account_id=account_id, target=connection["id"], details={"count": len(unique), "kind": kind})
    return {"count": len(unique), "sample": [{k: p[k] for k in ("code", "name", "price")} for p in unique[:3]]}


def _lines(order: dict, products: list[dict], kind: str) -> list[dict]:
    by_code = {re.sub(r"\s+", "", str(p.get("code", "")).lower()): p for p in products}
    lines = []
    for item in order.get("items") or []:
        p = by_code.get(re.sub(r"\s+", "", str(item.get("code", "")).lower()))
        ext = (p or {}).get("ext") or {}
        if ext.get("source") != kind:
            raise StoreError(422, f"{item.get('name') or item.get('code')} isn't a {LABEL[kind]} product (sync the products, then try again)")
        lines.append({**ext, "qty": int(item.get("qty") or 1), "price_paise": int(item.get("price_paise") or 0)})
    if not lines:
        raise StoreError(422, "The order has no items")
    return lines


async def push_order(sdb: Db, settings: Settings, connection: dict, order: dict) -> dict:
    kind = connection["kind"]
    try:
        keys = await keys_of(sdb, settings, connection)
        cat = await sdb.select("product_catalog", {"account_id": order["account_id"]}, limit=1)
        lines = _lines(order, (cat[0].get("products") or []) if cat else [], kind)
        made = await (shopify_create_order(keys, order, lines) if kind == "shopify" else woo_create_order(keys, order, lines))
    except (StoreError, httpx.HTTPError) as exc:
        reason = exc.message if isinstance(exc, StoreError) else f"{LABEL[kind]} could not be reached"
        await sdb.update("shop_orders", {"id": order["id"]}, {"ext_source": kind, "ext_error": reason[:300], "ext_synced_at": _now()})
        raise StoreError(getattr(exc, "status", 502), reason) from exc
    rows = await sdb.update("shop_orders", {"id": order["id"]}, {"ext_source": kind, "ext_order_id": made["id"], "ext_order_name": made["name"], "ext_error": None, "ext_synced_at": _now()})
    await audit.record(sdb, scope="account", action="store.order_sent", actor_id=None, account_id=order["account_id"], target=order["id"], details={"kind": kind, "store_order": made["name"]})
    return rows[0] if rows else {**order, "ext_order_id": made["id"], "ext_order_name": made["name"]}


async def apply_store_state(sdb: Db, bridge, order: dict, action: str, tracking: str) -> bool:
    """Moves the order to what the store says and tells the customer. Returns whether it changed."""
    from .routers.orders import _may_message, _shop_of

    try:
        patch = shop_orders.next_state(order, action)
    except shop_orders.ActionRefused:
        return False
    if action == "shipped" and tracking:
        patch["tracking"] = tracking
    patch["updated_at"] = _now()
    rows = await sdb.update("shop_orders", {"id": order["id"]}, patch)
    order = rows[0] if rows else {**order, **patch}
    await shop_orders.move_lead(sdb, order["account_id"], order.get("lead_id"), action)

    notified = False
    accounts = await sdb.select("accounts", {"id": order["account_id"]}, limit=1)
    owner = accounts[0].get("owner_user_id") if accounts else None
    if owner and await _may_message(sdb, order["account_id"], order) is None:
        shop = await _shop_of(sdb, order)
        try:
            notified, _, _ = await wa_templates.deliver(
                sdb, bridge, account_id=order["account_id"], user_id=owner, role="owner", conversation_id=order["conversation_id"],
                text=shop_orders.update_text(shop, order, action), kind="order",
                params=[order.get("customer_name") or "there", str(order["number"]), shop_orders.update_phrase(shop, order, action)],
                language=str(shop.get("language") or "en"), custom=shop_orders.chosen_template(shop, order, action),
            )
        except Exception as exc:  # noqa: BLE001 - the order moved; a failed message must not undo that
            log.warning("could not tell the customer about order %s: %s", order["id"], exc)
    await audit.record(sdb, scope="account", action=f"shop_order.{action}", actor_id=None, account_id=order["account_id"], target=order["id"],
                       details={"number": order["number"], "notified": notified, "from": order.get("ext_source")})
    from . import events

    await events.emit(sdb, order["account_id"], "order.updated", {**shop_orders.public(order), "change": action, "from": order.get("ext_source")})
    return True


async def sync_orders(sdb: Db, settings: Settings, bridge, *, account_id: str | None = None) -> dict:
    """Send settled orders that aren't in the store yet; then ask the store about sent ones."""
    sent = moved = 0
    since = (datetime.now(timezone.utc) - timedelta(days=PUSH_DAYS)).isoformat()
    retry_before = (datetime.now(timezone.utc) - timedelta(minutes=RETRY_MINUTES)).isoformat()
    filters: dict[str, Any] = {"ext_order_id": ("is", "null"), "payment_status": ("in", ["paid", "cod"]), "status": ("neq", "cancelled"), "created_at": ("gte", since)}
    if account_id:
        filters["account_id"] = account_id
    connections: dict[str, dict | None] = {}
    for order in await sdb.select("shop_orders", filters, order="created_at.asc", limit=100):
        if order.get("ext_synced_at") and order["ext_synced_at"] > retry_before:
            continue
        acct = order["account_id"]
        if acct not in connections:
            connections[acct] = await store_connection(sdb, acct)
        conn = connections[acct]
        if not conn or not options(conn)["push_orders"]:
            continue
        try:
            await push_order(sdb, settings, conn, order)
            sent += 1
        except StoreError as exc:
            log.info("order %s not sent to %s: %s", order["id"], conn["kind"], exc.message)

    poll_since = (datetime.now(timezone.utc) - timedelta(days=POLL_DAYS)).isoformat()
    filters = {"ext_order_id": ("not.is", "null"), "status": ("in", ["new", "packed", "shipped"]), "created_at": ("gte", poll_since)}
    if account_id:
        filters["account_id"] = account_id
    keys_cache: dict[str, dict] = {}
    for order in await sdb.select("shop_orders", filters, order="created_at.asc", limit=200):
        acct = order["account_id"]
        if acct not in connections:
            connections[acct] = await store_connection(sdb, acct)
        conn = connections[acct]
        if not conn or conn["kind"] != order.get("ext_source"):
            continue
        try:
            if conn["id"] not in keys_cache:
                keys_cache[conn["id"]] = await keys_of(sdb, settings, conn)
            keys = keys_cache[conn["id"]]
            action, tracking = await (shopify_order_state(keys, order["ext_order_id"]) if conn["kind"] == "shopify" else woo_order_state(keys, order["ext_order_id"]))
        except (StoreError, httpx.HTTPError) as exc:
            log.info("order %s status check failed: %s", order["id"], exc)
            continue
        if action and await apply_store_state(sdb, bridge, order, action, tracking):
            moved += 1
    return {"sent": sent, "updated": moved}


async def sync_all_products(sdb: Db, settings: Settings) -> int:
    """The hourly pass: every business with a store connection that syncs products."""
    done = 0
    seen: set[str] = set()
    for conn in await sdb.select("flow_connections", {"kind": ("in", list(STORE_KINDS))}, order="created_at.desc", limit=1000):
        if conn["account_id"] in seen:
            continue  # only the newest store of a business is used
        seen.add(conn["account_id"])
        if not options(conn)["sync_products"]:
            continue
        try:
            await sync_products(sdb, settings, conn)
            done += 1
        except StoreError as exc:
            log.warning("store sync failed for %s: %s", conn["account_id"], exc.message)
        except Exception:  # noqa: BLE001 - one business must not stop the others
            log.exception("store sync crashed for %s", conn["account_id"])
    return done

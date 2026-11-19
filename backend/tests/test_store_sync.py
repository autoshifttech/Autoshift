import json
from datetime import datetime, timedelta, timezone

import pytest

from app import store_sync
from app.config import get_settings
from app.deps import get_web_bridge
from app.security import decrypt

TOKEN = "shpat_abcdef1234567890"
CK, CS = "ck_" + "a" * 40, "cs_" + "b" * 40


class Bridge:
    def __init__(self):
        self.calls = []

    async def call(self, action, account_id, user_id, role, **fields):
        self.calls.append((action, fields))
        return {"ok": True}


class FakeStore:
    """Answers like Shopify's GraphQL API and WooCommerce's REST API."""

    def __init__(self):
        self.calls = []
        self.shopify_order = {"id": "gid://shopify/Order/9001", "name": "#1042", "cancelledAt": None, "displayFulfillmentStatus": "UNFULFILLED", "fulfillments": []}
        self.woo_status = "processing"
        self.fail_token = False

    async def __call__(self, method, url, *, headers=None, json_body=None, data=None, auth=None, params=None):
        self.calls.append((method, url, json_body, params))
        if "myshopify.com" in url:
            if (headers or {}).get("X-Shopify-Access-Token") != TOKEN or self.fail_token:
                return 401, {"errors": "Invalid API key or access token"}, {}
            q = json_body["query"]
            if "shop { name }" in q:
                return 200, {"data": {"shop": {"name": "Asha Fashion"}}}, {}
            if "products(" in q:
                return 200, {"data": {"products": {"pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [
                    {"id": "gid://shopify/Product/1", "title": "Cotton Kurti", "productType": "Kurti", "vendor": "Asha", "description": "<p>Soft cotton</p>",
                     "onlineStoreUrl": "https://asha.in/kurti", "featuredMedia": None, "variants": {"nodes": [
                        {"id": "gid://shopify/ProductVariant/11", "sku": "KUR-M", "title": "M", "price": "799.00", "availableForSale": True, "inventoryQuantity": 4, "inventoryItem": {"tracked": True}},
                        {"id": "gid://shopify/ProductVariant/12", "sku": "KUR-L", "title": "L", "price": "799.00", "availableForSale": False, "inventoryQuantity": 0, "inventoryItem": {"tracked": True}},
                    ]}},
                    {"id": "gid://shopify/Product/2", "title": "Gift card", "productType": "", "vendor": "", "description": "", "onlineStoreUrl": None, "featuredMedia": None,
                     "variants": {"nodes": [{"id": "gid://shopify/ProductVariant/21", "sku": "", "title": "Default Title", "price": "500", "availableForSale": True, "inventoryQuantity": None, "inventoryItem": {"tracked": False}}]}},
                ]}}}, {}
            if "orderCreate" in q:
                return 200, {"data": {"orderCreate": {"userErrors": [], "order": {"id": self.shopify_order["id"], "name": self.shopify_order["name"]}}}}, {}
            if "order(id:" in q:
                return 200, {"data": {"order": self.shopify_order}}, {}
        if "/wp-json/wc/v3" in url:
            if auth != (CK, CS):
                return 401, {"message": "Sorry, you cannot list resources."}, {}
            path = url.split("/wp-json/wc/v3", 1)[1]
            if path == "/products" and method == "GET":
                if (params or {}).get("per_page") == 1:
                    return 200, [], {}
                return 200, [
                    {"id": 5, "type": "simple", "name": "Steel Bottle", "sku": "BOT-1", "price": "349", "stock_status": "instock", "manage_stock": True, "stock_quantity": 12, "categories": [{"name": "Kitchen"}], "permalink": "https://shop.example.in/bottle", "images": []},
                    {"id": 6, "type": "variable", "name": "T-shirt", "sku": "", "price": "", "categories": [], "images": []},
                ], {"X-WP-TotalPages": "1"}
            if path == "/products/6/variations":
                return 200, [{"id": 61, "sku": "", "price": "499", "stock_status": "outofstock", "attributes": [{"name": "Size", "option": "XL"}]}], {}
            if path == "/orders" and method == "POST":
                return 201, {"id": 777, "number": "777"}, {}
            if path == "/orders/777":
                return 200, {"id": 777, "status": self.woo_status, "meta_data": [{"key": "_wc_shipment_tracking_items", "value": [{"tracking_provider": "Delhivery", "tracking_number": "DL123"}]}]}, {}
        return 404, {}, {}


@pytest.fixture
def store(client, world, settings, monkeypatch):
    fake = FakeStore()
    monkeypatch.setattr(store_sync, "http", fake)
    store_sync._tokens.clear()
    bridge = Bridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    for a in world.rows("accounts"):
        if a["id"] == world.acct_a:
            a["owner_user_id"] = world.users["owner_a"]
    return {"fake": fake, "bridge": bridge}


def add_shopify(client, world):
    return client.post("/v1/connections", json={"kind": "shopify", "shopify": {"shop": "https://admin.shopify.com/store/asha-fashion", "access_token": TOKEN}}, headers=world.headers("owner_a"))


def order_row(world, **extra):
    now = datetime.now(timezone.utc)
    row = {
        "id": f"ord-{len(world.rows('shop_orders')) + 1}", "account_id": world.acct_a, "number": 1001 + len(world.rows("shop_orders")), "assistant_id": None,
        "conversation_id": "conv-1", "contact_id": None, "lead_id": None, "items": [{"code": "KUR-M", "name": "Cotton Kurti – M", "qty": 2, "price_paise": 79900, "total_paise": 159800}],
        "subtotal_paise": 159800, "delivery_paise": 5000, "total_paise": 164800, "customer_name": "Asha Rao", "customer_phone": "919876543210",
        "address": "12 MG Road, Bengaluru 560001", "note": "", "payment_method": "online", "payment_status": "paid", "status": "new", "tracking": "",
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }
    row.update(extra)
    world.rows("shop_orders").append(row)
    return row


def test_addresses():
    assert store_sync.shop_domain("asha-fashion") == "asha-fashion.myshopify.com"
    assert store_sync.shop_domain("https://admin.shopify.com/store/asha-fashion/products") == "asha-fashion.myshopify.com"
    assert store_sync.woo_site("shop.example.in/") == "https://shop.example.in"
    for bad in ("http://shop.example.in",):
        with pytest.raises(store_sync.StoreError):
            store_sync.woo_site(bad)


def test_shopify_connection_checks_the_token_and_hides_it(client, world, settings, store):
    res = add_shopify(client, world)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Asha Fashion" and body["detail"] == "asha-fashion.myshopify.com" and body["settings"] == {"sync_products": True, "push_orders": True}
    assert TOKEN not in json.dumps(body)
    assert json.loads(decrypt(world.rows("flow_connection_secrets")[-1]["ciphertext"], settings))["access_token"] == TOKEN

    bad = client.post("/v1/connections", json={"kind": "shopify", "shopify": {"shop": "asha-fashion", "access_token": "shpat_wrongwrongwrong"}}, headers=world.headers("owner_a"))
    assert bad.status_code == 422 and "refused" in bad.json()["detail"]
    assert client.post("/v1/connections", json={"kind": "shopify", "shopify": {"shop": "asha-fashion"}}, headers=world.headers("owner_a")).status_code == 422
    assert client.post("/v1/connections", json={"kind": "shopify", "shopify": {"shop": "asha-fashion", "access_token": TOKEN}}, headers=world.headers("agent_a")).status_code == 403


def test_shopify_products_orders_and_status(client, world, store):
    conn = add_shopify(client, world).json()
    h = world.headers("owner_a")

    out = client.post(f"/v1/connections/{conn['id']}/sync", headers=h)
    assert out.status_code == 200, out.text
    assert out.json()["products"]["count"] == 3
    products = world.rows("product_catalog")[0]["products"]
    m, l, gift = products
    assert m["code"] == "KUR-M" and m["name"] == "Cotton Kurti – M" and m["price"] == 799.0 and m["details"]["Stock"] == "4" and m["details"]["About"] == "Soft cotton"
    assert l["details"]["Stock"] == "0" and gift["code"] == "SH21" and gift["name"] == "Gift card" and "Stock" not in gift["details"]
    assert m["ext"] == {"source": "shopify", "product_id": "gid://shopify/Product/1", "variant_id": "gid://shopify/ProductVariant/11"}
    assert world.rows("product_catalog")[0]["source"] == "shopify"

    # A paid order goes to Shopify with the variant, the price paid and the delivery charge.
    order = order_row(world)
    world.rows("messages").append({"conversation_id": "conv-1", "sender_type": "customer", "content_text": "hi", "created_at": datetime.now(timezone.utc).isoformat()})
    awaiting = order_row(world, payment_status="awaiting")
    res = client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()
    assert res["orders"]["sent"] == 1
    sent = next(c for c in store["fake"].calls if c[2] and "orderCreate" in c[2]["query"])[2]["variables"]
    assert sent["order"]["lineItems"] == [{"variantId": "gid://shopify/ProductVariant/11", "quantity": 2, "priceSet": {"shopMoney": {"amount": "799.00", "currencyCode": "INR"}}}]
    assert sent["order"]["financialStatus"] == "PAID" and sent["order"]["shippingLines"][0]["priceSet"]["shopMoney"]["amount"] == "50.00"
    assert sent["order"]["phone"] == "+919876543210" and sent["options"]["sendReceipt"] is False
    row = next(o for o in world.rows("shop_orders") if o["id"] == order["id"])
    assert row["ext_order_id"] == "gid://shopify/Order/9001" and row["ext_order_name"] == "#1042"
    assert not next(o for o in world.rows("shop_orders") if o["id"] == awaiting["id"]).get("ext_order_id")

    # Shopify fulfils it with tracking: the order is shipped here and the customer is told.
    store["fake"].shopify_order.update(displayFulfillmentStatus="FULFILLED", fulfillments=[{"displayStatus": "IN_TRANSIT", "trackingInfo": [{"company": "Delhivery", "number": "DL99", "url": None}]}])
    res = client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()
    assert res["orders"]["updated"] == 1
    row = next(o for o in world.rows("shop_orders") if o["id"] == order["id"])
    assert row["status"] == "shipped" and row["tracking"] == "Delhivery DL99"
    assert store["bridge"].calls and store["bridge"].calls[-1][0] == "send"

    # Asking again changes nothing; delivered moves it on once more.
    assert client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()["orders"]["updated"] == 0
    store["fake"].shopify_order["fulfillments"][0]["displayStatus"] = "DELIVERED"
    assert client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()["orders"]["updated"] == 1
    assert next(o for o in world.rows("shop_orders") if o["id"] == order["id"])["status"] == "delivered"

    status = client.get(f"/v1/connections/{conn['id']}/store", headers=world.headers("agent_a")).json()
    assert status["products"] == 3 and status["orders_sent"] == 1 and status["sync_error"] is None


def test_an_order_that_cant_be_matched_is_reported_and_not_retried_at_once(client, world, store):
    conn = add_shopify(client, world).json()
    h = world.headers("owner_a")
    client.post(f"/v1/connections/{conn['id']}/sync", headers=h)
    order = order_row(world, items=[{"code": "OLD-1", "name": "Old thing", "qty": 1, "price_paise": 10000, "total_paise": 10000}], payment_method="cod", payment_status="cod")
    assert client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()["orders"]["sent"] == 0
    row = next(o for o in world.rows("shop_orders") if o["id"] == order["id"])
    assert "isn't a Shopify product" in row["ext_error"]
    creates = sum(1 for c in store["fake"].calls if c[2] and "orderCreate" in c[2].get("query", ""))
    client.post(f"/v1/connections/{conn['id']}/sync", headers=h)
    assert sum(1 for c in store["fake"].calls if c[2] and "orderCreate" in c[2].get("query", "")) == creates
    status = client.get(f"/v1/connections/{conn['id']}/store", headers=h).json()
    assert status["orders_failed"][0]["number"] == order["number"]


def test_options_switch_order_sending_off(client, world, store):
    conn = add_shopify(client, world).json()
    h = world.headers("owner_a")
    client.post(f"/v1/connections/{conn['id']}/sync", headers=h)
    res = client.patch(f"/v1/connections/{conn['id']}", json={"push_orders": False}, headers=h)
    assert res.status_code == 200 and res.json()["settings"] == {"sync_products": True, "push_orders": False}
    order_row(world)
    assert client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()["orders"]["sent"] == 0
    assert client.patch(f"/v1/connections/{conn['id']}", json={"push_orders": True}, headers=world.headers("agent_a")).status_code == 403


def test_failed_sync_keeps_the_old_list(client, world, store):
    conn = add_shopify(client, world).json()
    h = world.headers("owner_a")
    client.post(f"/v1/connections/{conn['id']}/sync", headers=h)
    store["fake"].fail_token = True
    res = client.post(f"/v1/connections/{conn['id']}/sync", headers=h)
    assert res.status_code == 422
    cat = world.rows("product_catalog")[0]
    assert len(cat["products"]) == 3 and "refused" in cat["feed_error"]


def test_woocommerce_end_to_end(client, world, store):
    h = world.headers("owner_a")
    res = client.post("/v1/connections", json={"kind": "woocommerce", "woocommerce": {"url": "shop.example.in", "consumer_key": CK, "consumer_secret": CS}}, headers=h)
    assert res.status_code == 201, res.text
    conn = res.json()
    assert conn["detail"] == "shop.example.in"
    out = client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()
    assert out["products"]["count"] == 2
    bottle, tee = world.rows("product_catalog")[0]["products"]
    assert bottle["code"] == "BOT-1" and bottle["details"]["Stock"] == "12" and bottle["ext"] == {"source": "woocommerce", "product_id": 5}
    assert tee["code"] == "WC61" and tee["name"] == "T-shirt – XL" and tee["details"]["Stock"] == "0" and tee["ext"]["variation_id"] == 61

    order = order_row(world, items=[{"code": "BOT-1", "name": "Steel Bottle", "qty": 3, "price_paise": 34900, "total_paise": 104700}], payment_method="cod", payment_status="cod")
    world.rows("messages").append({"conversation_id": "conv-1", "sender_type": "customer", "content_text": "ok", "created_at": datetime.now(timezone.utc).isoformat()})
    assert client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()["orders"]["sent"] == 1
    body = next(c for c in store["fake"].calls if c[0] == "POST" and c[1].endswith("/orders"))[2]
    assert body["set_paid"] is False and body["payment_method"] == "cod" and body["line_items"] == [{"product_id": 5, "quantity": 3, "total": "1047.00"}]
    row = next(o for o in world.rows("shop_orders") if o["id"] == order["id"])
    assert row["ext_order_id"] == "777" and row["ext_order_name"] == "#777"

    store["fake"].woo_status = "completed"
    assert client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()["orders"]["updated"] == 1
    row = next(o for o in world.rows("shop_orders") if o["id"] == order["id"])
    assert row["status"] == "shipped" and row["tracking"] == "Delhivery DL123"


def test_bad_woocommerce_keys(client, world, store):
    res = client.post("/v1/connections", json={"kind": "woocommerce", "woocommerce": {"url": "https://shop.example.in", "consumer_key": "ck_" + "z" * 40, "consumer_secret": CS}}, headers=world.headers("owner_a"))
    assert res.status_code == 422 and "WooCommerce refused" in res.json()["detail"]
    assert client.post("/v1/connections", json={"kind": "woocommerce", "woocommerce": {"url": "https://shop.example.in", "consumer_key": "nope", "consumer_secret": CS}}, headers=world.headers("owner_a")).status_code == 422


def test_old_orders_are_never_sent(client, world, store):
    conn = add_shopify(client, world).json()
    h = world.headers("owner_a")
    client.post(f"/v1/connections/{conn['id']}/sync", headers=h)
    order_row(world, created_at=(datetime.now(timezone.utc) - timedelta(days=10)).isoformat())
    assert client.post(f"/v1/connections/{conn['id']}/sync", headers=h).json()["orders"]["sent"] == 0

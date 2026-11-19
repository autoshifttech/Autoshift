import json

import pytest

from app import catalog, catalog_feed

CSV = b"SKU,Product Name,Price,Status,Stock,Colour\nA1,Blue Shirt,499,active,10,Blue\nA2,Old Cap,199,draft,5,Red\nA3,Belt,299,out of stock,,Brown\n"


def test_status_columns_hide_or_mark_out_of_stock():
    products, columns, skipped = catalog.parse_file("feed.csv", CSV)
    assert [p["code"] for p in products] == ["A1", "A3"]  # the draft product is off the list
    assert skipped == []  # hidden products aren't errors
    belt = products[1]
    assert belt["details"]["Stock"] == "0" and "Status" not in columns and "Colour" in columns


def test_availability_column_keeps_the_product_but_out_of_stock():
    rows = [["code", "name", "price", "available"], ["B1", "Mug", "249", "no"], ["B2", "Plate", "199", "yes"]]
    products, _, _ = catalog.to_products(rows)
    assert [(p["code"], p["details"].get("Stock")) for p in products] == [("B1", "0"), ("B2", None)]


def test_json_lists_and_wrapped_lists_are_read():
    data = [{"sku": "J1", "title": "Kurta", "price": 899, "is_active": True, "sizes": "S,M", "images": ["x"]}, {"sku": "J2", "title": "Saree", "price": "1,499", "status": "inactive"}]
    products, columns, _ = catalog.parse_file("feed.json", json.dumps({"products": data}).encode())
    assert [p["code"] for p in products] == ["J1"] and products[0]["price"] == 899
    assert "images" not in columns  # nested values are left out
    with pytest.raises(catalog.CatalogError):
        catalog.read_json(b"not json")
    with pytest.raises(catalog.CatalogError):
        catalog.read_json({"nothing": 1})


def test_feed_type_is_worked_out_from_the_link_the_header_or_the_bytes():
    assert catalog_feed.kind_of("https://x.com/p.json", "", b"") == "feed.json"
    assert catalog_feed.kind_of("https://x.com/api/products", "application/json; charset=utf-8", b"") == "feed.json"
    assert catalog_feed.kind_of("https://x.com/export", "", b"PK\x03\x04") == "feed.xlsx"
    assert catalog_feed.kind_of("https://x.com/export", "text/plain", b"[{}]") == "feed.json"
    assert catalog_feed.kind_of("https://x.com/export", "text/plain", b"code,name") == "feed.csv"


@pytest.fixture
def feed(monkeypatch):
    state = {"body": CSV, "type": "text/csv", "fail": None, "calls": []}

    async def fake_fetch(url):
        state["calls"].append(url)
        if state["fail"]:
            raise catalog_feed.FeedError(state["fail"])
        return state["type"], state["body"]

    monkeypatch.setattr(catalog_feed, "fetch_bytes", fake_fetch)
    return state


def test_feed_link_syncs_now_and_on_demand(client, world, feed):
    h = world.headers("admin_a")
    assert client.put("/v1/catalog/feed", json={"url": "http://shop.example.com/p.csv"}, headers=h).status_code == 422  # https only
    assert client.put("/v1/catalog/feed", json={"url": "https://shop.example.com/p.csv"}, headers=world.headers("agent_a")).status_code == 403
    out = client.put("/v1/catalog/feed", json={"url": "https://shop.example.com/p.csv"}, headers=h).json()
    assert out["count"] == 2
    row = world.rows("product_catalog")[0]
    assert row["feed_url"] == "https://shop.example.com/p.csv" and row["source"] == "feed" and row["file_name"] == "Website feed (shop.example.com)"
    assert row["feed_synced_at"] and row["feed_error"] is None

    # the website changes; Sync now picks it up
    feed["body"] = b"code,name,price\nA1,Blue Shirt,549\n"
    assert client.post("/v1/catalog/feed/sync", headers=h).json()["count"] == 1
    assert world.rows("product_catalog")[0]["products"][0]["price"] == 549

    # a failing sync keeps the previous list and shows the error
    feed["fail"] = "The website answered 500"
    r = client.post("/v1/catalog/feed/sync", headers=h)
    assert r.status_code == 422 and "500" in r.json()["detail"]
    row = world.rows("product_catalog")[0]
    assert row["products"][0]["price"] == 549 and "500" in row["feed_error"]

    # choosing a file by hand stops the website sync; stopping keeps the list
    client.delete("/v1/catalog/feed", headers=h)
    assert world.rows("product_catalog")[0]["feed_url"] is None and world.rows("product_catalog")[0]["products"]
    assert client.post("/v1/catalog/feed/sync", headers=h).status_code == 409


async def test_hourly_pass_syncs_every_feed_and_survives_failures(world, feed):
    world.rows("product_catalog").extend([
        {"account_id": world.acct_a, "feed_url": "https://a.example.com/p.csv", "products": [], "columns": []},
        {"account_id": world.acct_b, "feed_url": None, "products": [], "columns": []},
    ])
    assert await catalog_feed.sync_all(world.service) == 1
    assert feed["calls"] == ["https://a.example.com/p.csv"]
    feed["fail"] = "down"
    assert await catalog_feed.sync_all(world.service) == 0


def test_website_pushes_its_products_as_json(client, world):
    body = {"products": [{"code": "W1", "name": "Shoes", "price": 1999, "stock": 0}, {"code": "W2", "name": "Socks", "price": 99, "status": "archived"}]}
    out = client.put("/v1/catalog/products", json=body, headers=world.headers("admin_a")).json()
    assert out["count"] == 1
    row = world.rows("product_catalog")[0]
    assert row["source"] == "api" and row["file_name"] == "Website (API)" and row["products"][0]["details"]["stock"] == "0"
    assert client.put("/v1/catalog/products", json={"products": [{"x": 1}]}, headers=world.headers("admin_a")).status_code == 422
    assert client.put("/v1/catalog/products", json=body, headers=world.headers("agent_a")).status_code == 403


def test_a_website_finds_an_order_by_its_number(client, world):
    world.rows("shop_orders").extend([
        {"id": "o1", "account_id": world.acct_a, "number": 1001, "created_at": "2026-01-01T00:00:00Z"},
        {"id": "o2", "account_id": world.acct_a, "number": 1002, "created_at": "2026-01-02T00:00:00Z"},
        {"id": "o3", "account_id": world.acct_b, "number": 1001, "created_at": "2026-01-02T00:00:00Z"},
    ])
    got = client.get("/v1/orders?number=1001", headers=world.headers("agent_a")).json()
    assert [o["id"] for o in got] == ["o1"]

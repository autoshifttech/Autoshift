from app import pages


def acct(world, which="a"):
    return next(a for a in world.rows("accounts") if a["id"] == (world.acct_a if which == "a" else world.acct_b))


def test_existing_businesses_keep_every_page(client, world):
    out = client.get("/v1/workspace/pages", headers=world.headers("agent_a")).json()
    assert out["all"] is True and out["business_type"] is None
    assert set(pages.OPTIONAL) <= set(out["pages"]) and set(pages.CORE) <= set(out["pages"])
    assert client.get("/v1/orders", headers=world.headers("agent_a")).status_code == 200


def test_sign_up_type_sets_the_starting_pages_once(client, world):
    h = world.headers("owner_a")
    assert client.put("/v1/workspace/business-type", json={"business_type": "clinic"}, headers=world.headers("agent_a")).status_code == 403
    out = client.put("/v1/workspace/business-type", json={"business_type": "clinic", "shop_source": "shopify"}, headers=h).json()
    assert out["business_type"] == "clinic" and out["shop_source"] is None  # only shops have a source
    assert "leads" in out["optional_on"] and "orders" not in out["optional_on"] and out["all"] is False
    assert acct(world)["pages"] == pages.BUILTIN_DEFAULTS["clinic"]
    # the same choice again is fine; a different one is for the AutoShift team
    assert client.put("/v1/workspace/business-type", json={"business_type": "clinic"}, headers=h).status_code == 200
    assert client.put("/v1/workspace/business-type", json={"business_type": "retail"}, headers=h).status_code == 409


def test_a_shop_gets_orders_and_its_source(client, world):
    out = client.put("/v1/workspace/business-type", json={"business_type": "retail"}, headers=world.headers("owner_a")).json()
    assert out["shop_source"] == "whatsapp" and "orders" in out["optional_on"]


def test_switched_off_areas_are_blocked_in_the_api(client, world):
    client.put("/v1/workspace/business-type", json={"business_type": "clinic"}, headers=world.headers("owner_a"))
    h = world.headers("agent_a")
    r = client.get("/v1/orders", headers=h)
    assert r.status_code == 403 and "Ask AutoShift support" in r.json()["detail"]
    assert client.get("/v1/ws/automations", headers=h).status_code == 403  # clinics don't start with automations
    assert client.get("/v1/ws/contacts", headers=h).status_code == 200  # core
    # another business is untouched
    assert client.get("/v1/orders", headers=world.headers("admin_b")).status_code == 200


def test_requesting_a_page_opens_one_support_ticket(client, world):
    client.put("/v1/workspace/business-type", json={"business_type": "clinic"}, headers=world.headers("owner_a"))
    h = world.headers("agent_a")
    out = client.post("/v1/workspace/pages/request", json={"page": "orders", "note": "We sell medicines too"}, headers=h).json()
    assert out["ticket"].startswith("T-")
    ticket = world.rows("support_tickets")[-1]
    assert ticket["subject"] == "Please switch on: Orders" and ticket["account_id"] == world.acct_a
    assert "We sell medicines too" in world.rows("support_messages")[-1]["text"]
    assert client.post("/v1/workspace/pages/request", json={"page": "orders"}, headers=h).json() == {"already_requested": True}
    assert client.post("/v1/workspace/pages/request", json={"page": "leads"}, headers=h).json() == {"already_on": True}
    assert client.post("/v1/workspace/pages/request", json={"page": "nope"}, headers=h).status_code == 422


def test_staff_switch_pages_per_business_and_reset(client, world):
    staff, url = world.headers("staff_support"), f"/v1/platform/businesses/{world.acct_a}/pages"
    assert client.put(url, json={"pages": ["orders"]}, headers=world.headers("owner_a")).status_code in (401, 403)
    assert client.put(url, json={"pages": ["orders"]}, headers=world.headers("staff_finance")).status_code == 403
    out = client.put(url, json={"pages": ["orders", "leads", "bogus"], "business_type": "clinic"}, headers=staff).json()
    assert out["optional_on"] == ["leads", "orders"] and out["business_type"] == "clinic"
    assert client.get("/v1/orders", headers=world.headers("agent_a")).status_code == 200
    assert client.get("/v1/ws/flows", headers=world.headers("agent_a")).status_code == 403
    log = [a for a in world.rows("audit_log") if a["action"] == "pages.update"][-1]
    assert log["details"]["off"] and "orders" not in log["details"]["off"]
    reset = client.post(f"{url}/reset", json={"business_type": "real_estate"}, headers=staff).json()
    assert reset["business_type"] == "real_estate" and reset["optional_on"] == pages.BUILTIN_DEFAULTS["real_estate"]
    every = client.put(url, json={"pages": None}, headers=staff).json()
    assert every["all"] is True
    seen = client.get(url, headers=world.headers("staff_finance")).json()
    assert seen["all"] is True and "clinic" in seen["defaults"]


def test_defaults_per_type_are_edited_by_super_admins_for_new_businesses(client, world):
    body = {"defaults": {"clinic": ["leads", "orders"]}}
    assert client.put("/v1/platform/page-defaults", json=body, headers=world.headers("staff_support")).status_code == 403
    out = client.put("/v1/platform/page-defaults", json=body, headers=world.headers("staff_super")).json()
    assert out["defaults"]["clinic"] == ["leads", "orders"] and out["defaults"]["retail"] == pages.BUILTIN_DEFAULTS["retail"]
    assert client.put("/v1/platform/page-defaults", json={"defaults": {"bakery": []}}, headers=world.headers("staff_super")).status_code == 422
    chosen = client.put("/v1/workspace/business-type", json={"business_type": "clinic"}, headers=world.headers("owner_a")).json()
    assert chosen["optional_on"] == ["leads", "orders"]


async def test_the_ai_takes_no_orders_while_orders_is_switched_off(client, world, settings, llm):
    from app.config import get_settings
    from app.security import encrypt
    from app import wallet
    import json

    s = settings.model_copy(update={"internal_secret": "internal-shared-secret-123"})
    client.app.dependency_overrides[get_settings] = lambda: s
    p = next(p for p in world.rows("platform_ai_providers") if p["vendor"] == "openai")
    p.update(enabled=True, key_ciphertext=encrypt("sk-1234", s), key_tail="1234")
    await wallet.apply(world.service, world.acct_a, 5000, "topup", "t", "fund-pages")
    world.rows("product_catalog").append({"account_id": world.acct_a, "file_name": "p.csv", "products": [{"code": "P001", "name": "Cap", "price": 199, "details": {}}], "columns": []})
    aid = client.post("/v1/assistants", json={"name": "Shop", "provider": "openai", "model_id": "gpt-5.5", "enabled": True, "shop": {"enabled": True}}, headers=world.headers("admin_a")).json()["id"]
    acct(world)["pages"] = ["leads"]
    llm.answer = 'Sure.\n[ORDER]' + json.dumps({"items": [{"code": "P001", "qty": 1}], "name": "A", "address": "12 MG Road 560001", "pay": "cod"})
    out = client.post("/v1/internal/ai-reply", json={"account_id": world.acct_a, "assistant_id": aid, "message": "yes", "ref": "wamid.pages.1", "conversation_id": "c1", "contact_id": "k1"}, headers={"X-AutoShift-Internal": "internal-shared-secret-123"}).json()
    assert out["order"] is None and not world.rows("shop_orders")
    assert "[ORDER]" not in llm.calls[-1]["system"]

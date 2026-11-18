import hashlib
import hmac
import json

import pytest

from app import shop_orders, shop_payments, wallet
from app.config import get_settings
from app.deps import get_web_bridge
from app.security import encrypt

SECRET = "internal-shared-secret-123"
HOOK = "shop-hook-secret"
PRODUCTS = [
    {"code": "P001", "name": "Cotton T-shirt", "price": 499, "details": {"Size": "M"}},
    {"code": "P002", "name": "Denim jeans", "price": 1299, "details": {"Stock": "3"}},
    {"code": "P003", "name": "Cap", "price": 199, "details": {"Stock": "0"}},
]
SHOP = {"enabled": True, "online": True, "cod": True, "delivery_fee": 50, "free_above": 1500, "min_order": 0, "cod_max": 2000, "language": "en"}


def order_line(**over):
    req = {"items": [{"code": "P001", "qty": 2}], "name": "Asha Rao", "address": "12 MG Road, Bengaluru 560001", "pay": "online", **over}
    return "Great, placing your order now!\n[ORDER]" + json.dumps(req)


class Bridge:
    def __init__(self):
        self.calls, self.fail = [], None

    async def call(self, action, account_id, user_id, role, **fields):
        if self.fail:
            from app.web_bridge import BridgeError
            raise BridgeError(400, self.fail)
        self.calls.append((action, fields))
        return {"ok": True}


@pytest.fixture
async def shop(client, world, settings, monkeypatch, llm):
    s = settings.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    bridge = Bridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    links = []

    async def fake_post(key_id, key_secret, path, body):
        if path == "/payment_links":
            links.append(body)
            return {"id": f"plink_{len(links)}", "short_url": f"https://rzp.io/i/l{len(links)}"}
        return {}

    monkeypatch.setattr(shop_payments, "rzp_post", fake_post)
    remote = {}  # Razorpay's view of each link: link id -> its status reply

    async def fake_get(key_id, key_secret, path):
        return remote.get(path.rsplit("/", 1)[-1], {"status": "created"})

    monkeypatch.setattr(shop_payments, "rzp_get", fake_get)
    conn = {"id": "4f9b2c1e-1111-4222-8333-944455556666", "account_id": world.acct_a, "kind": "razorpay", "name": "Shop", "detail": "x", "mode": "test", "created_at": "2026-01-01T00:00:00Z"}
    world.rows("flow_connections").append(conn)
    keys = {"key_id": "rzp_test_Shop123456", "key_secret": "shopsecret", "webhook_secret": HOOK}
    world.rows("flow_connection_secrets").append({"connection_id": conn["id"], "ciphertext": encrypt(json.dumps(keys), s)})
    owner = world.users["owner_a"]
    for a in world.rows("accounts"):
        if a["id"] == world.acct_a:
            a["owner_user_id"] = owner
    world.rows("pipelines").append({"id": "pl_1", "account_id": world.acct_a, "name": "Order"})
    world.rows("pipeline_stages").extend([
        {"id": "st_new", "pipeline_id": "pl_1", "name": "New order"}, {"id": "st_paid", "pipeline_id": "pl_1", "name": "Paid"},
        {"id": "st_cod", "pipeline_id": "pl_1", "name": "Cash on delivery"}, {"id": "st_ship", "pipeline_id": "pl_1", "name": "Shipped"},
        {"id": "st_done", "pipeline_id": "pl_1", "name": "Delivered"},
    ])
    world.rows("product_catalog").append({"account_id": world.acct_a, "file_name": "p.csv", "products": PRODUCTS, "columns": []})
    p = next(p for p in world.rows("platform_ai_providers") if p["vendor"] == "openai")
    p.update(enabled=True, key_ciphertext=encrypt("sk-live-1234", s), key_tail="1234")
    await wallet.apply(world.service, world.acct_a, 5000, "topup", "t", "fund-shop")
    aid = client.post("/v1/assistants", json={"name": "Shop", "provider": "openai", "model_id": "gpt-5.5", "enabled": True, "shop": SHOP}, headers=world.headers("admin_a")).json()["id"]
    return {"h": {"X-AutoShift-Internal": SECRET}, "aid": aid, "bridge": bridge, "links": links, "conn": conn, "llm": llm, "remote": remote, "settings": s}


def ask(client, world, shop, ref, message="yes, confirm"):
    body = {"account_id": world.acct_a, "assistant_id": shop["aid"], "message": message, "ref": ref, "conversation_id": "conv_1", "contact_id": "contact_1", "customer_phone": "+91 98765 43210"}
    return client.post("/v1/internal/ai-reply", json=body, headers=shop["h"]).json()


# ------------------------------------------------------------------ pricing
def test_price_takes_prices_from_the_list_and_adds_delivery():
    out = shop_orders.price(PRODUCTS, SHOP, {"items": [{"code": " p001 ", "qty": 1}, {"code": "P001", "qty": "2"}], "name": "A", "address": "12 MG Road 560001", "pay": "cash"})
    assert out["items"] == [{"code": "P001", "name": "Cotton T-shirt", "option": "", "qty": 3, "price_paise": 49900, "total_paise": 149700}]
    assert (out["delivery_paise"], out["total_paise"], out["payment_method"]) == (5000, 154700, "cod")
    free = shop_orders.price(PRODUCTS, SHOP, {"items": [{"code": "P002", "qty": 2}], "name": "A", "address": "12 MG Road 560001", "pay": "online"})
    assert free["delivery_paise"] == 0 and free["total_paise"] == 259800


@pytest.mark.parametrize("req,key", [
    ({"items": [{"code": "X9", "qty": 1}]}, "unknown_product"),
    ({"items": [{"code": "P003", "qty": 1}]}, "out_of_stock"),
    ({"items": [{"code": "P002", "qty": 4}]}, "out_of_stock"),
    ({"items": []}, "no_items"),
    ({"items": [{"code": "P001", "qty": 1}], "address": "short"}, "no_address"),
    ({"items": [{"code": "P001", "qty": 1}], "pay": "bitcoin"}, "pay_option"),
    ({"items": [{"code": "P002", "qty": 2}], "pay": "cod"}, "cod_max"),
    ({"_bad": True}, "bad_order"),
])
def test_price_refuses_what_is_wrong(req, key):
    full = {"name": "A", "address": "12 MG Road 560001", "pay": "online", **req}
    with pytest.raises(shop_orders.OrderProblem) as exc:
        shop_orders.price(PRODUCTS, SHOP, full)
    assert exc.value.key == key
    assert shop_orders.problem_text(SHOP, exc.value).startswith("I couldn't place the order yet")


def test_only_one_payment_option_is_used_whatever_the_ai_says():
    out = shop_orders.price(PRODUCTS, {**SHOP, "cod": False}, {"items": [{"code": "P001"}], "name": "A", "address": "12 MG Road 560001", "pay": "cod"})
    assert out["payment_method"] == "online"


def test_extract_strips_the_order_line():
    text, req = shop_orders.extract('Done!\n[ORDER]{"items":[{"code":"P001","qty":1}],"name":"A","address":"x","pay":"cod"}')
    assert text == "Done!" and req["items"][0]["code"] == "P001"
    assert shop_orders.extract("[ORDER]{not json}")[1] == {"_bad": True}
    assert shop_orders.extract("Just chatting") == ("Just chatting", None)


def test_summary_is_in_the_shop_language():
    order = {**shop_orders.price(PRODUCTS, SHOP, {"items": [{"code": "P001"}], "name": "A", "address": "12 MG Road 560001", "pay": "cod"}), "number": 1001}
    assert "Pedido nº 1001" in shop_orders.summary({**SHOP, "language": "pt"}, order)
    assert "주문 #1001" in shop_orders.summary({**SHOP, "language": "ko"}, order)


# ------------------------------------------------------------------ the AI places it
async def test_the_assistant_is_told_how_to_take_orders(client, world, shop):
    shop["llm"].answer = "Which size would you like?"
    out = ask(client, world, shop, "wamid.shop.0", "I want a t-shirt")
    assert out["status"] == "reply" and out["order"] is None
    system = shop["llm"].calls[-1]["system"]
    assert "[ORDER]" in system and "P001" in system and "free for orders of ₹1,500" in system and "no earlier orders" in system


async def test_confirmed_online_order_gets_a_payment_link(client, world, shop):
    shop["llm"].answer = order_line()
    out = ask(client, world, shop, "wamid.shop.1")
    assert out["status"] == "reply" and out["order"]["number"] == 1001
    assert "[ORDER]" not in out["text"] and "Great, placing your order now!" in out["text"]
    assert "2 × Cotton T-shirt (P001) — ₹998" in out["text"] and "₹1,048" in out["text"] and "https://rzp.io/i/l1" in out["text"]
    order = world.rows("shop_orders")[0]
    assert (order["total_paise"], order["payment_status"], order["status"], order["customer_phone"]) == (104800, "awaiting", "new", "+919876543210")
    assert shop["links"][0]["amount"] == 104800 and shop["links"][0]["description"].startswith("Order #1001: 2 × Cotton T-shirt")
    link = world.rows("payment_links")[0]
    assert link["order_id"] == order["id"] and link["lead_id"] == order["lead_id"]
    deal = next(d for d in world.rows("deals") if d["id"] == order["lead_id"])
    assert deal["stage_id"] == "st_new" and deal["title"] == "Order #1001"

    # the customer says yes twice: no second order, the same link again
    from datetime import datetime, timezone
    order["created_at"] = datetime.now(timezone.utc).isoformat()  # the fake database's clock is fixed
    again = ask(client, world, shop, "wamid.shop.2")
    assert again["order"]["number"] == 1001 and len(world.rows("shop_orders")) == 1 and len(shop["links"]) == 1

    # next time the assistant knows about the order
    shop["llm"].answer = "It is on its way."
    ask(client, world, shop, "wamid.shop.3", "where is my order?")
    assert "Order #1001" in shop["llm"].calls[-1]["system"] and "payment: not paid yet" in shop["llm"].calls[-1]["system"] and "status: being prepared" in shop["llm"].calls[-1]["system"]


async def test_paying_the_link_marks_the_order_paid(client, world, shop):
    shop["llm"].answer = order_line()
    ask(client, world, shop, "wamid.shop.p")
    raw = json.dumps({"event": "payment_link.paid", "payload": {"payment_link": {"entity": {"id": "plink_1"}}, "payment": {"entity": {"id": "pay_1", "amount": 104800}}}}).encode()
    sig = hmac.new(HOOK.encode(), raw, hashlib.sha256).hexdigest()
    res = client.post(f"/v1/webhooks/razorpay/c/{shop['conn']['id']}", content=raw, headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_p"})
    assert res.status_code == 200
    order = world.rows("shop_orders")[0]
    assert order["payment_status"] == "paid" and order["paid_at"]
    assert next(d for d in world.rows("deals") if d["id"] == order["lead_id"])["stage_id"] == "st_paid"


async def test_cash_on_delivery_order_needs_no_link(client, world, shop):
    shop["llm"].answer = order_line(pay="cod")
    out = ask(client, world, shop, "wamid.shop.c")
    assert "Cash on delivery: please keep ₹1,048 ready." in out["text"] and not shop["links"]
    order = world.rows("shop_orders")[0]
    assert order["payment_status"] == "cod"
    assert next(d for d in world.rows("deals") if d["id"] == order["lead_id"])["stage_id"] == "st_cod"


async def test_wrong_order_is_not_placed(client, world, shop):
    shop["llm"].answer = order_line(items=[{"code": "P003", "qty": 1}])
    out = ask(client, world, shop, "wamid.shop.w")
    assert out["order"] is None and "Cap is out of stock" in out["text"] and not world.rows("shop_orders")


async def test_missing_razorpay_still_saves_the_order(client, world, shop):
    world.rows("flow_connections").clear()
    shop["llm"].answer = order_line()
    out = ask(client, world, shop, "wamid.shop.n")
    assert "Our team will send it to you shortly" in out["text"]
    assert world.rows("shop_orders")[0].get("payment_url") is None


async def test_test_reply_never_saves_an_order(client, world, shop):
    shop["llm"].answer = order_line()
    out = client.post(f"/v1/assistants/{shop['aid']}/test-reply", json={"message": "yes", "history": [], "idempotency_key": "test-order-1"}, headers=world.headers("admin_a")).json()
    assert "Order #TEST" in out["text"] and "rzp.io/i/test-link" in out["text"]
    assert not world.rows("shop_orders") and not shop["links"]


# ------------------------------------------------------------------ the team moves it on
def patch(client, world, oid, user="agent_a", **body):
    return client.patch(f"/v1/orders/{oid}", json=body, headers=world.headers(user))


async def test_orders_move_on_and_the_customer_is_told(client, world, shop):
    shop["llm"].answer = order_line(pay="cod")
    ask(client, world, shop, "wamid.shop.m")
    oid = world.rows("shop_orders")[0]["id"]
    listed = client.get("/v1/orders", headers=world.headers("agent_a")).json()
    assert [o["number"] for o in listed] == [1001]
    assert client.get("/v1/orders", headers=world.headers("admin_b")).json() == []
    assert client.get(f"/v1/orders/{oid}", headers=world.headers("admin_b")).status_code == 404

    r = patch(client, world, oid, action="shipped", tracking="https://track.example.com/AB1")
    assert r.status_code == 200 and r.json()["notified"] is True
    action, fields = shop["bridge"].calls[-1]
    assert action == "send" and fields["conversation_id"] == "conv_1"
    assert "order #1001 has been shipped" in fields["text"] and "https://track.example.com/AB1" in fields["text"]
    assert patch(client, world, oid, action="packed").status_code == 409  # can't go back

    r = patch(client, world, oid, action="delivered")
    order = r.json()["order"]
    assert order["status"] == "delivered" and order["payment_status"] == "paid"  # cash collected at the door
    assert patch(client, world, oid, action="cancelled").status_code == 409
    assert next(d for d in world.rows("deals") if d["id"] == order["lead_id"])["stage_id"] == "st_done"


async def test_unpaid_online_order_waits_and_can_get_a_new_link(client, world, shop):
    shop["llm"].answer = order_line()
    ask(client, world, shop, "wamid.shop.u")
    oid = world.rows("shop_orders")[0]["id"]
    assert patch(client, world, oid, action="packed").status_code == 409
    r = patch(client, world, oid, action="resend_link")
    assert r.status_code == 200 and "https://rzp.io/i/l2" in shop["bridge"].calls[-1][1]["text"]
    assert world.rows("shop_orders")[0]["payment_url"] == "https://rzp.io/i/l2"
    r = patch(client, world, oid, action="cancelled", notify=False)
    assert r.json()["order"]["status"] == "cancelled" and r.json()["notified"] is False


async def test_blocked_or_stopped_customers_are_never_messaged(client, world, shop):
    shop["llm"].answer = order_line(pay="cod")
    ask(client, world, shop, "wamid.shop.b")
    oid = world.rows("shop_orders")[0]["id"]
    world.rows("messages").append({"id": "m1", "conversation_id": "conv_1", "sender_type": "customer", "content_text": "STOP", "created_at": "2026-02-01T00:00:00Z"})
    r = patch(client, world, oid, action="packed").json()
    assert r["notified"] is False and "STOP" in r["not_notified_reason"] and not shop["bridge"].calls


async def test_whatsapp_refusal_is_reported_not_raised(client, world, shop):
    shop["llm"].answer = order_line(pay="cod")
    ask(client, world, shop, "wamid.shop.f")
    shop["bridge"].fail = "Outside the 24-hour window"
    r = patch(client, world, world.rows("shop_orders")[0]["id"], action="packed").json()
    assert r["order"]["status"] == "packed" and r["notified"] is False and "24-hour" in r["not_notified_reason"]


def test_a_malformed_order_id_is_refused(client, world):
    assert client.get("/v1/orders/not-an-id", headers=world.headers("agent_a")).status_code == 422
    assert client.patch("/v1/orders/not-an-id", json={"action": "packed"}, headers=world.headers("agent_a")).status_code == 422


def test_sizes_are_kept_per_item_and_shown():
    out = shop_orders.price(PRODUCTS, SHOP, {"items": [{"code": "P001", "qty": 1, "option": "M"}, {"code": "P001", "qty": 2, "size": " l "}, {"code": "p001", "qty": 1, "option": "m"}], "name": "A", "address": "12 MG Road 560001", "pay": "cod"})
    assert [(i["option"], i["qty"]) for i in out["items"]] == [("M", 2), ("l", 2)]
    text = shop_orders.summary(SHOP, {**out, "number": 1001})
    assert "2 × Cotton T-shirt (M) (P001)" in text and "2 × Cotton T-shirt (l) (P001)" in text
    with pytest.raises(shop_orders.OrderProblem):  # stock counts every size of the product
        shop_orders.price(PRODUCTS, SHOP, {"items": [{"code": "P002", "qty": 2, "option": "30"}, {"code": "P002", "qty": 2, "option": "32"}], "name": "A", "address": "12 MG Road 560001", "pay": "cod"})


def test_the_whole_product_list_is_shown_and_unclear_details_are_asked_not_handed_over():
    from app import ai_runner, catalog

    products = [{"code": f"P{n:03d}", "name": f"Item {n}", "price": 100 + n, "details": {}} for n in range(1, 61)]
    assistant = {"name": "Shop", "shop": SHOP, "_catalog": catalog.as_facts(products), "handoff": {"onUnknown": True}}
    system = ai_runner.build_system(assistant, "Hi")
    assert "P017" in system and "P060" in system
    assert "ask the customer: never hand over" in system


def fresh(world):
    """The fake database's clock is fixed in the past; make the links look just made."""
    from datetime import datetime, timezone
    for row in world.rows("payment_links"):
        row["created_at"] = datetime.now(timezone.utc).isoformat()
        row.setdefault("notified_at", None)


PAID = {"status": "paid", "amount_paid": 104800, "payments": [{"payment_id": "pay_77", "amount": 104800, "status": "captured"}]}


def platform_hook(client, settings, event, link_id, event_id="evt_platform_1"):
    from tests.conftest import RZP_WEBHOOK_SECRET

    raw = json.dumps({"event": event, "payload": {"payment_link": {"entity": {"id": link_id, "status": "paid"}}}}).encode()
    sig = hmac.new(settings.razorpay_webhook_secret.encode() if settings.razorpay_webhook_secret else RZP_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return client.post("/v1/webhooks/razorpay", content=raw, headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": event_id})


async def test_a_shop_link_paid_event_on_the_platform_webhook_is_checked_with_razorpay(client, world, shop):
    shop["llm"].answer = order_line()
    ask(client, world, shop, "wamid.shop.pw")
    # the payload alone is not trusted: while Razorpay says "created", nothing changes
    assert platform_hook(client, shop["settings"], "payment_link.paid", "plink_1").json()["status"] == "ignored"
    assert world.rows("shop_orders")[0]["payment_status"] == "awaiting"
    shop["remote"]["plink_1"] = PAID
    assert platform_hook(client, shop["settings"], "payment_link.paid", "plink_1", "evt_platform_2").json()["status"] == "processed"
    order = world.rows("shop_orders")[0]
    assert order["payment_status"] == "paid"
    assert ("payment_paid", world.acct_a, {"payment_link_id": world.rows("payment_links")[0]["id"]}) in [(a, acct, f) for a, acct, f in [(c[0], world.acct_a, c[1]) for c in shop["bridge"].calls]]


async def test_the_customer_saying_they_paid_gets_the_real_status(client, world, shop):
    shop["llm"].answer = order_line()
    ask(client, world, shop, "wamid.shop.ip")
    fresh(world)
    shop["remote"]["plink_1"] = PAID
    shop["llm"].answer = "Thank you!"
    ask(client, world, shop, "wamid.shop.ip2", "I paid")
    assert world.rows("shop_orders")[0]["payment_status"] == "paid"
    assert "payment: paid and confirmed" in shop["llm"].calls[-1]["system"]


async def test_check_payment_from_the_orders_page_and_the_background_check(client, world, shop, settings):
    shop["llm"].answer = order_line()
    ask(client, world, shop, "wamid.shop.cp")
    oid = world.rows("shop_orders")[0]["id"]
    r = patch(client, world, oid, action="check_payment").json()
    assert r["payment"] == "unpaid" and r["order"]["payment_status"] == "awaiting"
    shop["remote"]["plink_1"] = {"status": "expired"}
    fresh(world)
    assert await shop_payments.reconcile_pending(world.service, shop["settings"], shop["bridge"]) == 0
    assert world.rows("shop_orders")[0]["payment_status"] == "expired"
    shop["remote"]["plink_1"] = PAID
    world.rows("payment_links")[0]["status"] = "created"
    r = patch(client, world, oid, action="check_payment").json()
    assert r["payment"] == "paid" and r["order"]["payment_status"] == "paid"
    shop["llm"].answer = order_line(pay="cod")
    world.rows("shop_orders").clear()
    ask(client, world, shop, "wamid.shop.cp2")
    assert patch(client, world, world.rows("shop_orders")[0]["id"], action="check_payment").status_code == 409  # cash on delivery has no link


async def test_a_shop_customer_is_told_when_a_person_takes_over(client, world, shop):
    out = ask(client, world, shop, "wamid.shop.h", "Let me talk to a human")
    assert out["status"] == "handoff" and "A member of our team will reply" in out["text"]

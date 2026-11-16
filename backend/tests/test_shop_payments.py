import hashlib
import hmac
import json

import pytest

from app import shop_payments
from app.config import get_settings
from app.deps import get_web_bridge
from app.security import encrypt

SECRET = "internal-shared-secret-123"
HOOK = "shop-hook-secret"


class Bridge:
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    async def call(self, action, account_id, user_id, role, **fields):
        if self.fail:
            from app.web_bridge import BridgeError
            raise BridgeError(502, "down")
        self.calls.append((action, account_id, fields))
        return {"ok": True}


@pytest.fixture
def shop(client, world, settings, monkeypatch):
    s = settings.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    bridge = Bridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    calls = []

    async def fake_post(key_id, key_secret, path, body):
        calls.append((key_id, path, body))
        if path == "/payment_links":
            return {"id": "plink_1", "short_url": "https://rzp.io/i/abc"}
        if path == "/payments/qr_codes":
            return {"id": "qr_1", "image_url": "https://rzp.io/qr/abc.png"}
        return {}

    monkeypatch.setattr(shop_payments, "rzp_post", fake_post)
    conn = {"id": "4f9b2c1e-1111-4222-8333-944455556666", "account_id": world.acct_a, "kind": "razorpay", "name": "Shop", "detail": "x", "mode": "test", "created_at": "2026-01-01T00:00:00Z"}
    world.rows("flow_connections").append(conn)
    keys = {"key_id": "rzp_test_Shop123456", "key_secret": "shopsecret", "webhook_secret": HOOK}
    world.rows("flow_connection_secrets").append({"connection_id": conn["id"], "ciphertext": encrypt(json.dumps(keys), s)})
    owner = world.users["owner_a"]
    for a in world.rows("accounts"):
        if a["id"] == world.acct_a:
            a["owner_user_id"] = owner
    world.rows("pipeline_stages").extend([{"id": "st_new", "pipeline_id": "pl_1", "name": "New order"}, {"id": "st_paid", "pipeline_id": "pl_1", "name": "Paid"}])
    world.rows("deals").append({"id": "deal_1", "account_id": world.acct_a, "pipeline_id": "pl_1", "stage_id": "st_new"})
    return {"h": {"X-AutoShift-Internal": SECRET}, "conn": conn, "bridge": bridge, "calls": calls}


def make_link(client, shop, world, **extra):
    body = {"account_id": world.acct_a, "amount": "1,498", "description": "2 × T-shirt", "conversation_id": "conv_1", "lead_id": "deal_1", "customer_phone": "91 98765 43210", **extra}
    return client.post("/v1/internal/payment-link", json=body, headers=shop["h"])


def hook(client, conn_id, event, payload, event_id="evt_1", secret=HOOK):
    raw = json.dumps({"event": event, "payload": payload}).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post(f"/v1/webhooks/razorpay/c/{conn_id}", content=raw, headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": event_id})


def test_to_paise():
    assert shop_payments.to_paise("₹ 1,498.50") == 149850
    assert shop_payments.to_paise(999) == 99900
    for bad in ("", "abc", "0.5", "99999999"):
        with pytest.raises(shop_payments.PaymentLinkError):
            shop_payments.to_paise(bad)


def test_link_needs_the_internal_secret_and_a_connection(client, world, shop):
    assert client.post("/v1/internal/payment-link", json={"account_id": world.acct_a, "amount": "10"}, headers=world.headers("owner_a")).status_code == 401
    res = client.post("/v1/internal/payment-link", json={"account_id": world.acct_b, "amount": "10"}, headers=shop["h"])
    assert res.status_code == 409 and "Connections" in res.json()["detail"]


def test_creates_a_link_on_the_business_account(client, world, shop):
    res = make_link(client, shop, world, send_qr=True)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["short_url"] == "https://rzp.io/i/abc" and body["qr_image_url"] == "https://rzp.io/qr/abc.png" and body["amount_paise"] == 149800
    key_id, path, sent = shop["calls"][0]
    assert key_id == "rzp_test_Shop123456" and path == "/payment_links"
    assert sent["amount"] == 149800 and sent["customer"]["contact"] == "+919876543210" and sent["reference_id"] == body["id"]
    row = world.rows("payment_links")[0]
    assert row["status"] == "created" and row["razorpay_qr_id"] == "qr_1" and "shopsecret" not in json.dumps(body)


def test_paid_link_moves_the_order_and_tells_the_customer_once(client, world, shop):
    make_link(client, shop, world, send_qr=True)
    payload = {"payment_link": {"entity": {"id": "plink_1"}}, "payment": {"entity": {"id": "pay_9", "amount": 149800}}}
    res = hook(client, shop["conn"]["id"], "payment_link.paid", payload)
    assert res.status_code == 200 and res.json()["status"] == "processed"
    row = world.rows("payment_links")[0]
    assert row["status"] == "paid" and row["razorpay_payment_id"] == "pay_9" and row["notified_at"]
    assert world.rows("deals")[0]["stage_id"] == "st_paid"
    assert shop["bridge"].calls == [("payment_paid", world.acct_a, {"payment_link_id": row["id"]})]
    assert any(p.endswith("/qr_codes/qr_1/close") for _, p, _ in shop["calls"])  # can't pay twice
    assert hook(client, shop["conn"]["id"], "payment_link.paid", payload).json()["status"] == "duplicate"
    assert hook(client, shop["conn"]["id"], "payment_link.paid", payload, event_id="evt_2").json()["status"] == "processed"
    assert len(shop["bridge"].calls) == 1


def test_paid_by_qr_cancels_the_link(client, world, shop):
    make_link(client, shop, world, send_qr=True)
    payload = {"qr_code": {"entity": {"id": "qr_1"}}, "payment": {"entity": {"id": "pay_q", "amount": 149800}}}
    assert hook(client, shop["conn"]["id"], "qr_code.credited", payload).json()["status"] == "processed"
    assert any(p.endswith("/payment_links/plink_1/cancel") for _, p, _ in shop["calls"])


def test_bad_signature_wrong_amount_and_strangers(client, world, shop):
    make_link(client, shop, world)
    payload = {"payment_link": {"entity": {"id": "plink_1"}}, "payment": {"entity": {"id": "pay_9", "amount": 100}}}
    assert hook(client, shop["conn"]["id"], "payment_link.paid", payload, secret="wrong").status_code == 400
    assert hook(client, "not-a-uuid", "payment_link.paid", payload).status_code == 404
    assert hook(client, shop["conn"]["id"], "payment_link.paid", payload).status_code == 500
    assert world.rows("payment_links")[0]["status"] == "created"
    other = {"payment_link": {"entity": {"id": "plink_other"}}, "payment": {"entity": {"id": "p", "amount": 1}}}
    assert hook(client, shop["conn"]["id"], "payment_link.paid", other, event_id="e3").json()["status"] == "ignored"


def test_web_app_down_means_razorpay_retries(client, world, shop):
    make_link(client, shop, world)
    shop["bridge"].fail = True
    payload = {"payment_link": {"entity": {"id": "plink_1"}}, "payment": {"entity": {"id": "pay_9", "amount": 149800}}}
    assert hook(client, shop["conn"]["id"], "payment_link.paid", payload).status_code == 500
    assert world.rows("payment_links")[0]["status"] == "paid" and not world.rows("payment_links")[0].get("notified_at")
    shop["bridge"].fail = False
    assert hook(client, shop["conn"]["id"], "payment_link.paid", payload).json()["status"] == "processed"
    assert len(shop["bridge"].calls) == 1 and len([a for a in world.rows("audit_log") if a["action"] == "shop_payment.paid"]) == 1

import json
from datetime import datetime, timedelta, timezone

import pytest

from app import events
from app.security import decrypt

from .helpers import order_paid, payment_signature, start_topup, webhook

PUBLIC_IP, PRIVATE_IP = "93.184.216.34", "10.0.0.5"


@pytest.fixture(autouse=True)
def fake_dns(monkeypatch):
    def getaddrinfo(host, port, **kw):
        ip = PRIVATE_IP if host in ("internal.corp", "10.0.0.5") else ("169.254.169.254" if host == "169.254.169.254" else ("127.0.0.1" if host == "localhost" else PUBLIC_IP))
        return [(2, 1, 6, "", (ip, port))]

    monkeypatch.setattr(events.socket, "getaddrinfo", getaddrinfo)


def H(world, who="admin_a"):
    return world.headers(who)


def _make(client, world, url="https://n8n.example.com/webhook/abc", **kw):
    res = client.post("/v1/hooks", json={"url": url, **kw}, headers=H(world))
    assert res.status_code == 201, res.text
    return res.json()


class Recorder:
    def __init__(self, status=200):
        self.status, self.calls = status, []

    async def __call__(self, url, headers, body):
        self.calls.append((url, headers, body))
        return self.status


def test_secret_is_shown_once_and_stored_encrypted(client, world, settings):
    made = _make(client, world)
    assert made["secret"].startswith("whsec_")
    stored = world.rows("webhook_subscriptions")[0]
    assert made["secret"] not in str(stored) and decrypt(stored["secret_cipher"], settings) == made["secret"]
    listed = client.get("/v1/hooks", headers=H(world)).json()
    assert "secret" not in listed[0] and "secret_cipher" not in listed[0]


@pytest.mark.parametrize("url", ["http://n8n.example.com/x", "https://internal.corp/x", "https://10.0.0.5/x", "https://169.254.169.254/latest", "https://localhost/x", "https://user:pw@n8n.example.com/x", "ftp://x.com"])
def test_unsafe_urls_are_refused(client, world, url):
    res = client.post("/v1/hooks", json={"url": url}, headers=H(world))
    assert res.status_code == 422 and world.rows("webhook_subscriptions") == []


def test_unknown_event_name_refused(client, world):
    assert client.post("/v1/hooks", json={"url": "https://n8n.example.com/x", "events": ["nope"]}, headers=H(world)).status_code == 422


async def test_delivery_is_signed_and_verifiable(client, world, settings):
    made = _make(client, world)
    await events.emit(world.service, world.acct_a, "wallet.topped_up", {"amount_paise": 100})
    rec = Recorder()
    out = await events.deliver_pending(world.service, settings, send=rec, resolver=lambda h: [PUBLIC_IP])
    assert out["delivered"] == 1
    url, headers, body = rec.calls[0]
    expected = events.sign(made["secret"], headers["X-AutoShift-Timestamp"], body)
    assert headers["X-AutoShift-Signature"] == expected and headers["X-AutoShift-Event"] == "wallet.topped_up"
    payload = json.loads(body)
    assert payload["type"] == "wallet.topped_up" and payload["account_id"] == world.acct_a and payload["data"]["amount_paise"] == 100


async def test_only_subscribed_events_and_only_own_account(client, world):
    _make(client, world, events=["wallet.topped_up"])
    client.post("/v1/hooks", json={"url": "https://other.example.com/x"}, headers=H(world, "admin_b"))
    assert await events.emit(world.service, world.acct_a, "subscription.updated", {}) == 0
    assert await events.emit(world.service, world.acct_a, "wallet.topped_up", {}) == 1
    assert {d["account_id"] for d in world.rows("webhook_deliveries")} == {world.acct_a}


async def test_retries_back_off_then_fail_after_six_attempts(client, world, settings):
    _make(client, world)
    await events.emit(world.service, world.acct_a, "test.ping", {})
    rec = Recorder(status=500)
    now = datetime.now(timezone.utc)
    for attempt in range(6):
        out = await events.deliver_pending(world.service, settings, send=rec, resolver=lambda h: [PUBLIC_IP], now=now)
        now += timedelta(hours=7)
        assert out["failed" if attempt == 5 else "retry"] == 1
    d = world.rows("webhook_deliveries")[0]
    assert d["status"] == "failed" and d["attempts"] == 6 and "500" in d["last_error"]
    again = await events.deliver_pending(world.service, settings, send=rec, resolver=lambda h: [PUBLIC_IP], now=now)
    assert again == {"delivered": 0, "retry": 0, "failed": 0} and len(rec.calls) == 6


async def test_not_retried_before_its_time(client, world, settings):
    _make(client, world)
    await events.emit(world.service, world.acct_a, "test.ping", {})
    rec = Recorder(status=503)
    await events.deliver_pending(world.service, settings, send=rec, resolver=lambda h: [PUBLIC_IP])
    await events.deliver_pending(world.service, settings, send=rec, resolver=lambda h: [PUBLIC_IP])  # a second ago: not due
    assert len(rec.calls) == 1


async def test_dns_changing_to_a_private_address_blocks_delivery(client, world, settings):
    _make(client, world)
    await events.emit(world.service, world.acct_a, "test.ping", {})
    rec = Recorder()
    out = await events.deliver_pending(world.service, settings, send=rec, resolver=lambda h: [PRIVATE_IP])
    assert out["failed"] == 1 and rec.calls == []


def test_top_up_sends_one_event_even_when_verify_and_webhook_both_arrive(client, world, settings):
    _make(client, world, events=["wallet.topped_up"])
    order = start_topup(client, world, 1000)
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": payment_signature(order["razorpay_order_id"], "pay_1")}
    client.post("/v1/wallet/topups/verify", json=pay, headers=H(world))
    webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000))
    sent = world.rows("webhook_deliveries")
    assert len(sent) == 1 and sent[0]["payload"]["data"]["amount_paise"] == 100000


def test_a_broken_hook_never_breaks_the_payment(client, world):
    _make(client, world)
    world.fail_on.add("webhook_deliveries")
    order = start_topup(client, world, 1000)
    res = webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000))
    assert res.status_code == 200 and world.rows("wallet_balances")[0]["balance_paise"] == 100000


def test_delete_and_isolation_and_roles(client, world):
    made = _make(client, world)
    assert client.delete(f"/v1/hooks/{made['id']}", headers=H(world, "admin_b")).status_code == 404
    assert client.get("/v1/hooks", headers=H(world, "agent_a")).status_code == 403
    assert client.post("/v1/hooks", json={"url": "https://x.example.com/a"}, headers=H(world, "viewer_a")).status_code == 403
    assert client.delete(f"/v1/hooks/{made['id']}", headers=H(world)).status_code == 204
    assert world.rows("webhook_subscriptions") == []


def test_limit_of_ten_hooks(client, world):
    for i in range(10):
        _make(client, world, url=f"https://n8n.example.com/w{i}")
    assert client.post("/v1/hooks", json={"url": "https://n8n.example.com/w11"}, headers=H(world)).status_code == 409

import pytest

from app import wallet
from app.config import get_settings
from app.security import encrypt

SECRET = "internal-shared-secret-123"


@pytest.fixture
def internal(client, settings, world):
    world.rows("platform_settings").append({"key": "meta_fees_billed_to", "value": "autoshift"})  # Solution Partner mode
    s = settings.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    return {"X-AutoShift-Internal": SECRET}


def charge(client, h, acct, category="marketing", key="wamid.1", units=1):
    return client.post("/v1/internal/charge", json={"account_id": acct, "category": category, "units": units, "ref": key, "idempotency_key": f"msg:{key}"}, headers=h)


def test_off_without_a_secret_and_refused_with_a_wrong_one(client, world, settings):
    assert charge(client, {}, world.acct_a).status_code == 503
    s = settings.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    assert charge(client, {"X-AutoShift-Internal": "nope"}, world.acct_a).status_code == 401
    assert charge(client, world.headers("owner_a"), world.acct_a).status_code == 401  # a user login is not enough


async def test_a_delivered_message_is_charged_once(client, world, internal):
    await wallet.apply(world.service, world.acct_a, 1000, "topup", "t", "fund-int")
    r1 = charge(client, internal, world.acct_a)
    r2 = charge(client, internal, world.acct_a)  # Meta sends "sent" and "delivered": same message
    assert r1.json() == {"charged_paise": 99, "balance_paise": 901, "applied": True}
    assert r2.json()["applied"] is False and r2.json()["balance_paise"] == 901
    assert charge(client, internal, world.acct_a, "service", "wamid.2").json()["charged_paise"] == 0  # free


async def test_unpaid_charge_is_refused_and_recorded(client, world, internal):
    r = charge(client, internal, world.acct_b)
    assert r.status_code == 402
    assert any(a["action"] == "wallet.unpaid_charge" for a in world.rows("audit_log"))


async def test_low_balance_event_fires_once_when_crossing(client, world, internal, monkeypatch):
    from app import events

    sent = []
    async def fake_emit(sdb, acct, typ, data, **kw):
        sent.append(typ)
        return 1
    monkeypatch.setattr(events, "emit", fake_emit)
    await wallet.apply(world.service, world.acct_a, 20100, "topup", "t", "fund-low")  # ₹201
    charge(client, internal, world.acct_a, key="wamid.low1")  # -> ₹200.02: still above
    charge(client, internal, world.acct_a, key="wamid.low2")  # -> ₹199.03: crosses
    charge(client, internal, world.acct_a, key="wamid.low3")  # stays below: no repeat
    assert sent == ["wallet.low"]


async def test_can_send_checks_money_and_suspension(client, world, internal):
    await wallet.apply(world.service, world.acct_a, 500, "topup", "t", "fund-cs")
    ok = client.post("/v1/internal/can-send", json={"account_id": world.acct_a, "category": "marketing", "units": 5}, headers=internal).json()
    assert ok == {"ok": True, "reason": None, "balance_paise": 500, "needed_paise": 495}
    no = client.post("/v1/internal/can-send", json={"account_id": world.acct_a, "category": "marketing", "units": 6}, headers=internal).json()
    assert no["ok"] is False and no["reason"] == "insufficient_funds"
    next(a for a in world.rows("accounts") if a["id"] == world.acct_a)["status"] = "suspended"
    assert client.post("/v1/internal/can-send", json={"account_id": world.acct_a, "category": "utility"}, headers=internal).json()["reason"] == "suspended"


async def test_live_ai_reply_uses_platform_keys_charges_and_emits_handoff(client, world, internal, settings, llm):
    p = next(p for p in world.rows("platform_ai_providers") if p["vendor"] == "openai")
    p.update(enabled=True, key_ciphertext=encrypt("sk-live-1234", settings), key_tail="1234")
    await wallet.apply(world.service, world.acct_a, 1000, "topup", "t", "fund-ai")
    aid = client.post("/v1/assistants", json={"name": "Sam", "provider": "openai", "model_id": "gpt-5.5", "enabled": True}, headers=world.headers("admin_a")).json()["id"]
    body = {"account_id": world.acct_a, "assistant_id": aid, "message": "hours?", "ref": "wamid.in.1"}
    out = client.post("/v1/internal/ai-reply", json=body, headers=internal).json()
    assert out["status"] == "reply" and out["balance_paise"] == 975
    again = client.post("/v1/internal/ai-reply", json=body, headers=internal).json()
    assert again["balance_paise"] == 975  # the same inbound message is never charged twice
    hand = client.post("/v1/internal/ai-reply", json={**body, "message": "talk to a human", "ref": "wamid.in.2"}, headers=internal).json()
    assert hand["status"] == "handoff"
    # another business's assistant can't be used
    assert client.post("/v1/internal/ai-reply", json={**body, "account_id": world.acct_b}, headers=internal).status_code == 404


def test_events_from_the_web_app_reach_webhooks(client, world, internal):
    world.rows("webhook_subscriptions").append({"id": "s1", "account_id": world.acct_a, "url": "https://x.example.com", "events": ["message.received"], "enabled": True, "secret_cipher": "x"})
    r = client.post("/v1/internal/events", json={"account_id": world.acct_a, "type": "message.received", "data": {"from": "+91"}}, headers=internal)
    assert r.status_code == 202 and r.json() == {"queued": 1}
    assert client.post("/v1/internal/events", json={"account_id": world.acct_a, "type": "nope"}, headers=internal).status_code == 422


async def test_by_default_meta_bills_the_business_and_the_wallet_charges_only_ai(client, world, settings):
    s = settings.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    h = {"X-AutoShift-Internal": SECRET}
    await wallet.apply(world.service, world.acct_a, 1000, "topup", "t", "fund-default")
    r = charge(client, h, world.acct_a, "marketing", "wamid.default1")
    assert r.json() == {"charged_paise": 0, "balance_paise": 1000, "applied": False, "billed_by": "meta"}
    assert client.post("/v1/internal/can-send", json={"account_id": world.acct_a, "category": "marketing", "units": 1000}, headers=h).json()["ok"] is True
    ai = charge(client, h, world.acct_a, "ai", "wamid.default2")
    assert ai.json()["charged_paise"] == 25  # AI replies are still charged


def test_only_super_admins_flip_the_meta_fees_switch(client, world):
    assert client.get("/v1/platform/settings", headers=world.headers("staff_finance")).json() == {"meta_fees_billed_to": "business"}
    assert client.put("/v1/platform/settings/meta-fees", json={"billed_to": "autoshift"}, headers=world.headers("staff_finance")).status_code == 403
    assert client.put("/v1/platform/settings/meta-fees", json={"billed_to": "autoshift"}, headers=world.headers("staff_super")).json() == {"meta_fees_billed_to": "autoshift"}
    assert client.get("/v1/platform/settings", headers=world.headers("staff_support")).json()["meta_fees_billed_to"] == "autoshift"
    assert any(a["action"] == "settings.meta_fees" for a in world.rows("audit_log"))

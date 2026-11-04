import pytest

from app import ai_runner, wallet
from app.security import encrypt

from .conftest import FakeDb


def _enable_openai(world, settings, key="sk-live-secret-1234"):
    p = next(p for p in world.rows("platform_ai_providers") if p["vendor"] == "openai")
    p.update(enabled=True, key_ciphertext=encrypt(key, settings), key_tail=key[-4:])


async def _fund(world, paise=1000):
    await wallet.apply(world.service, world.acct_a, paise, "topup", "t", f"fund-{paise}")


def _assistant(client, world, **kw):
    res = client.post("/v1/assistants", json={"name": "Sam", "provider": "openai", "model_id": "gpt-5.5", **kw}, headers=world.headers("admin_a"))
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _test(client, world, aid, message="When do you open?", key="idem-0000001", **kw):
    return client.post(f"/v1/assistants/{aid}/test-reply", json={"message": message, "idempotency_key": key, **kw}, headers=world.headers("admin_a"))


async def test_reply_is_charged_once_and_uses_the_platform_key(client, world, settings, llm):
    _enable_openai(world, settings)
    await _fund(world)
    aid = _assistant(client, world, instructions="Shop hours are 9 to 5.")
    out = _test(client, world, aid).json()
    assert out["status"] == "reply" and out["text"] == "We open at 9am."
    assert llm.calls[0]["api_key"] == "sk-live-secret-1234" and llm.calls[0]["model"] == "gpt-5.5"
    assert out["balance_paise"] == 1000 - wallet.RATES_PAISE["charge_ai"]
    # the key never reaches the customer-facing answer
    assert "sk-live" not in str(out)
    again = _test(client, world, aid).json()  # same idempotency key
    assert again["balance_paise"] == out["balance_paise"] and len(world.rows("wallet_ledger")) == 2


async def test_no_funds_means_no_ai_call(client, world, settings, llm):
    _enable_openai(world, settings)
    aid = _assistant(client, world)
    out = _test(client, world, aid).json()
    assert out["status"] == "no_funds" and llm.calls == []


def test_no_model_when_no_provider_is_on(client, world, llm):
    aid = _assistant(client, world)
    assert _test(client, world, aid).json()["status"] == "no_model" and llm.calls == []


async def test_falls_back_to_platform_default_when_model_is_off(client, world, settings, llm):
    _enable_openai(world, settings)
    await _fund(world)
    for m in world.rows("platform_ai_models"):
        if m["model_id"] == "gpt-5.5":
            m["enabled"] = False
    aid = _assistant(client, world)
    _test(client, world, aid)
    assert llm.calls[0]["model"] == "gpt-5.4-mini"


async def test_failed_call_is_not_charged(client, world, settings, llm):
    _enable_openai(world, settings)
    await _fund(world)
    llm.fail = True
    out = _test(client, world, _assistant(client, world)).json()
    assert out["status"] == "failed" and world.rows("wallet_balances")[0]["balance_paise"] == 1000


async def test_handoff_when_customer_asks_for_a_person_or_model_is_unsure(client, world, settings, llm):
    _enable_openai(world, settings)
    await _fund(world)
    aid = _assistant(client, world)
    out = _test(client, world, aid, message="Let me talk to a human").json()
    assert out["status"] == "handoff" and llm.calls == []
    llm.answer = "[HANDOFF]"
    out = _test(client, world, aid, key="idem-0000002").json()
    assert out["status"] == "handoff" and world.rows("wallet_balances")[0]["balance_paise"] == 1000


async def test_reply_limit_hands_over(client, world, settings, llm):
    _enable_openai(world, settings)
    await _fund(world)
    aid = _assistant(client, world, handoff={"onRequest": True, "onUnknown": True, "maxReplies": 1})
    history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
    assert _test(client, world, aid, history=history).json()["status"] == "handoff"


async def test_live_assistant_must_be_switched_on(world, settings, llm):
    _enable_openai(world, settings)
    await _fund(world)
    a = {"id": "x", "account_id": world.acct_a, "name": "Sam", "enabled": False, "provider": "openai", "model_id": "gpt-5.5"}
    out = await ai_runner.reply(world.service, llm, settings, a, [], "hi", "r1")
    assert out.status == "off" and llm.calls == []


def test_knowledge_is_picked_by_relevance():
    faqs = [{"q": "Opening hours", "a": "9 to 5"}, {"q": "Refund policy", "a": "30 days"}]
    assert ai_runner.pick_knowledge(faqs, "what are your opening hours")[0]["q"] == "Opening hours"
    assert ai_runner.pick_knowledge(faqs, "zzz") == []


def test_only_admins_can_run_it_and_not_across_workspaces(client, world):
    aid = _assistant(client, world)
    r = client.post(f"/v1/assistants/{aid}/test-reply", json={"message": "hi", "idempotency_key": "idem-0000001"}, headers=world.headers("agent_a"))
    assert r.status_code == 403
    r = client.post(f"/v1/assistants/{aid}/test-reply", json={"message": "hi", "idempotency_key": "idem-0000001"}, headers=world.headers("admin_b"))
    assert r.status_code == 404

import json

from ..helpers import order_paid, payment_signature, webhook
import os

import pytest

from .conftest import sql

pytestmark = pytest.mark.skipif(not os.environ.get("E2E_PG_DSN"), reason="set E2E_PG_DSN to run against a real Postgres")


def test_login_reads_the_real_profile_and_workspace(env):
    u = env.user("owner")
    me = env.client.get("/v1/me", headers=u["h"])
    assert me.status_code == 200, me.text
    assert me.json()["account_id"] == u["account_id"] and me.json()["role"] == "owner"


def test_assistants_with_real_row_level_security(env):
    a, b = env.user("a"), env.user("b")
    made = env.client.post("/v1/assistants", json={"name": "Alpha", "instructions": "Be kind"}, headers=a["h"])
    assert made.status_code == 201, made.text
    aid = made.json()["id"]
    assert made.json()["account_id"] == a["account_id"] and made.json()["tone"] == "friendly"
    assert [x["name"] for x in env.client.get("/v1/assistants", headers=a["h"]).json()] == ["Alpha"]
    assert env.client.get("/v1/assistants", headers=b["h"]).json() == []
    assert env.client.get(f"/v1/assistants/{aid}", headers=b["h"]).status_code == 404
    assert env.client.patch(f"/v1/assistants/{aid}", json={"name": "Hacked"}, headers=b["h"]).status_code == 404
    assert env.client.delete(f"/v1/assistants/{aid}", headers=b["h"]).status_code == 404
    patched = env.client.patch(f"/v1/assistants/{aid}", json={"enabled": True, "knowledge": [{"q": "Hours", "a": "9-5"}]}, headers=a["h"])
    assert patched.status_code == 200 and patched.json()["enabled"] is True and patched.json()["knowledge"][0]["q"] == "Hours"
    assert env.client.delete(f"/v1/assistants/{aid}", headers=a["h"]).status_code == 204


def test_topup_through_webhook_credits_real_wallet_once_and_issues_invoice(env):
    u = env.user("pay")
    order = env.client.post("/v1/wallet/topups", json={"amount_inr": 1000}, headers=u["h"])
    assert order.status_code == 201, order.text
    oid = order.json()["razorpay_order_id"]
    r1 = webhook(env.client, "order.paid", order_paid(oid, f"pay_{oid}", 118000), event_id=f"evt_{oid}")
    assert r1.status_code == 200 and r1.json()["status"] == "processed", r1.text
    r2 = webhook(env.client, "order.paid", order_paid(oid, f"pay_{oid}", 118000), event_id=f"evt_{oid}_again")
    assert r2.status_code == 200
    wallet = env.client.get("/v1/wallet", headers=u["h"]).json()
    assert wallet["balance_paise"] == 100000
    ledger = env.client.get("/v1/wallet/ledger", headers=u["h"]).json()
    assert len(ledger) == 1 and ledger[0]["kind"] == "topup"
    invoices = env.client.get("/v1/wallet/invoices", headers=u["h"]).json()
    assert len(invoices) == 1 and invoices[0]["total_paise"] == 118000 and invoices[0]["number"].startswith("INV-")


def test_ai_reply_charges_the_real_wallet_and_refuses_when_empty(env):
    u = env.user("ai")
    sql("UPDATE platform_ai_providers SET enabled = true, key_ciphertext = %s, key_tail = '1234' WHERE vendor = 'openai'", __import__("app.security", fromlist=["encrypt"]).encrypt("sk-test-1234", env.client.app.dependency_overrides[__import__("app.config", fromlist=["get_settings"]).get_settings]()))
    sql("INSERT INTO platform_ai_models (vendor, model_id, label, tier, enabled, is_default) VALUES ('openai', 'gpt-e2e', 'E2E', 'fast', true, false) ON CONFLICT DO NOTHING")
    aid = env.client.post("/v1/assistants", json={"name": "Bot", "provider": "openai", "model_id": "gpt-e2e"}, headers=u["h"]).json()["id"]
    body = {"message": "hours?", "idempotency_key": "e2e-key-0001"}
    empty = env.client.post(f"/v1/assistants/{aid}/test-reply", json=body, headers=u["h"]).json()
    assert empty["status"] == "no_funds"
    sql("SELECT wallet_apply(%s, 1000, 'topup', 'seed', %s)", u["account_id"], f"seed-{u['id']}")
    ok = env.client.post(f"/v1/assistants/{aid}/test-reply", json=body, headers=u["h"]).json()
    assert ok["status"] == "reply" and ok["balance_paise"] == 1000 - 25
    again = env.client.post(f"/v1/assistants/{aid}/test-reply", json=body, headers=u["h"]).json()
    assert again["balance_paise"] == 1000 - 25  # the same key is never charged twice
    assert sql("SELECT count(*) FROM wallet_ledger WHERE account_id = %s AND kind = 'charge_ai'", u["account_id"])[0][0] == 1


def test_platform_creates_a_business_reusing_the_signup_account(env):
    staff = env.staff()
    before = sql("SELECT count(*) FROM accounts")[0][0]
    res = env.client.post("/v1/platform/businesses", json={"name": "Real Shop", "industry": "retail", "city": "Pune", "owner": {"name": "Asha", "email": f"asha-{staff['id'][:6]}@shop.test"}, "plan_id": "growth"}, headers=staff["h"])
    assert res.status_code == 201, res.text
    b = res.json()
    assert sql("SELECT count(*) FROM accounts")[0][0] == before + 1  # the trigger's account was reused, not duplicated
    assert b["name"] == "Real Shop" and b["members"] == 1 and b["subscription_status"] == "trialing"
    team = env.client.get(f"/v1/platform/businesses/{b['id']}/team", headers=staff["h"]).json()
    assert [m["role"] for m in team] == ["owner"]


def test_platform_adds_a_member_and_their_personal_account_disappears(env):
    staff, owner = env.staff(), env.user("owner")
    mail = f"raj-{staff['id'][:6]}@team.test"
    res = env.client.post(f"/v1/platform/businesses/{owner['account_id']}/team", json={"name": "Raj", "email": mail, "role": "agent"}, headers=staff["h"])
    assert res.status_code == 201, res.text
    uid = res.json()["user_id"]
    assert sql("SELECT account_id::text FROM profiles WHERE user_id = %s", uid)[0][0] == owner["account_id"]
    assert sql("SELECT count(*) FROM accounts WHERE owner_user_id = %s", uid)[0][0] == 0


def test_suspension_locks_a_business_out_of_the_real_api(env):
    staff, owner = env.staff(), env.user("sus")
    assert env.client.get("/v1/assistants", headers=owner["h"]).status_code == 200
    env.client.post(f"/v1/platform/businesses/{owner['account_id']}/suspend", json={"suspended": True, "reason": "test"}, headers=staff["h"])
    assert env.client.get("/v1/assistants", headers=owner["h"]).status_code == 403
    env.client.post(f"/v1/platform/businesses/{owner['account_id']}/suspend", json={"suspended": False}, headers=staff["h"])
    assert env.client.get("/v1/assistants", headers=owner["h"]).status_code == 200


def test_api_key_and_mcp_work_against_the_real_database(env):
    u = env.user("mcp")
    key = env.client.post("/v1/mcp-keys", json={"name": "claude", "scope": "write"}, headers=u["h"]).json()["key"]
    stored = sql("SELECT key_hash FROM mcp_keys WHERE account_id = %s", u["account_id"])[0][0]
    assert key not in stored
    kh = {"Authorization": f"Bearer {key}"}
    assert env.client.get("/v1/me", headers=kh).json()["account_id"] == u["account_id"]
    rpc = env.client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "assistants_create", "arguments": {"name": "Via MCP"}}}, headers={**kh, "Accept": "application/json, text/event-stream"})
    assert rpc.status_code == 200 and "Via MCP" in rpc.text
    assert [x["name"] for x in env.client.get("/v1/assistants", headers=u["h"]).json()] == ["Via MCP"]


def test_webhook_subscription_and_signed_delivery_on_real_tables(env, monkeypatch):
    from app import events

    monkeypatch.setattr(events.socket, "getaddrinfo", lambda h, p, **k: [(2, 1, 6, "", ("93.184.216.34", p))])
    u = env.user("hook")
    made = env.client.post("/v1/hooks", json={"url": "https://n8n.example.com/webhook/x", "events": ["wallet.topped_up"]}, headers=u["h"])
    assert made.status_code == 201, made.text
    order = env.client.post("/v1/wallet/topups", json={"amount_inr": 500}, headers=u["h"]).json()["razorpay_order_id"]
    webhook(env.client, "order.paid", order_paid(order, f"pay_{order}", 59000), event_id=f"evt_{order}")
    rows = sql("SELECT status, event, payload FROM webhook_deliveries WHERE account_id = %s", u["account_id"])
    assert len(rows) == 1 and rows[0][0] == "pending" and rows[0][1] == "wallet.topped_up"
    assert json.loads(json.dumps(rows[0][2]))["data"]["amount_paise"] == 50000

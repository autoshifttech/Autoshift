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


def test_billing_details_usage_and_invoice_snapshot_on_the_real_database(env):
    from app.gst import check_char

    u = env.user("bill")
    first14 = "29ABCDE1234F1Z"
    body = {"legal_name": "Real Buyer LLP", "has_gstin": True, "gstin": first14 + check_char(first14), "state_code": "29", "address": "1 MG Road", "city": "Bengaluru", "pincode": "560001", "email": "a@b.in"}
    assert env.client.put("/v1/billing-details", json=body, headers=u["h"]).status_code == 200
    assert env.client.get("/v1/billing-details", headers=u["h"]).json()["legal_name"] == "Real Buyer LLP"
    bad = env.client.put("/v1/billing-details", json={**body, "gstin": "29ABCDE1234F1ZX"}, headers=u["h"])
    assert bad.status_code == 422

    order = env.client.post("/v1/wallet/topups", json={"amount_inr": 1000}, headers=u["h"]).json()["razorpay_order_id"]
    pay = {"razorpay_order_id": order, "razorpay_payment_id": f"pay_{order}", "razorpay_signature": payment_signature(order, f"pay_{order}")}
    assert env.client.post("/v1/wallet/topups/verify", json=pay, headers=u["h"]).status_code == 200
    inv = env.client.get("/v1/invoices", headers=u["h"]).json()[0]
    assert inv["buyer"]["gstin"] == body["gstin"] and inv["cgst_paise"] == 9000 and inv["sgst_paise"] == 9000 and inv["igst_paise"] == 0  # same state as the seller

    sql("INSERT INTO contacts (account_id, user_id, phone, name) VALUES (%s, %s, '+911', 'A'), (%s, %s, '+912', 'B')", u["account_id"], u["id"], u["account_id"], u["id"])
    usage = env.client.get("/v1/usage", headers=u["h"]).json()
    assert usage["contacts"]["used"] == 2 and usage["seats"]["used"] == 1 and usage["ai_replies"]["used"] == 0
    assert usage["seats"]["limit"] == 5  # the trial plan (growth)


def test_platform_business_list_plan_change_and_notes_on_the_real_database(env):
    staff = env.staff()
    email = f"owner-{staff['id'][:6]}@list.test"
    made = env.client.post("/v1/platform/businesses", json={"name": "List Shop", "industry": "retail", "city": "Pune", "owner": {"name": "Lata", "email": email}, "plan_id": "starter"}, headers=staff["h"])
    assert made.status_code == 201, made.text
    bid = made.json()["id"]
    listed = {b["id"]: b for b in env.client.get("/v1/platform/businesses", headers=staff["h"]).json()}
    assert listed[bid]["owner"]["email"] == email and listed[bid]["plan_id"] == "starter" and listed[bid]["subscription_status"] == "trialing"

    changed = env.client.post(f"/v1/platform/businesses/{bid}/subscription", json={"plan_id": "pro", "extend_trial_days": 10}, headers=staff["h"])
    assert changed.status_code == 200 and changed.json()["plan_id"] == "pro"
    days = sql("SELECT extract(day from trial_ends_at - now()) FROM subscriptions WHERE account_id = %s", bid)[0][0]
    assert days >= 23  # 14-day trial + 10 more

    notes = env.client.post(f"/v1/platform/businesses/{bid}/notes", json={"text": "Wants a demo on Friday"}, headers=staff["h"]).json()
    assert notes[0]["text"] == "Wants a demo on Friday"
    detail = env.client.get(f"/v1/platform/businesses/{bid}", headers=staff["h"]).json()
    assert detail["notes"][0]["author"] and detail["contacts"] == 0 and len(detail["team"]) == 1


def test_team_invite_redeem_role_and_remove_on_the_real_database(env):
    owner, joiner = env.user("teamowner"), env.user("joiner")
    res = env.client.post("/v1/team/invitations", json={"role": "agent"}, headers=owner["h"])
    assert res.status_code == 201, res.text
    token = res.json()["url"].rsplit("/join/", 1)[1]
    # the app's own redeem function accepts a link made by the backend
    with __import__("psycopg").connect(__import__("os").environ["E2E_PG_DSN"], autocommit=True) as c:
        c.execute("SET ROLE authenticated")
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (joiner["id"],))
        c.execute("SELECT redeem_invitation(encode(sha256(%s::bytea), 'hex'))", (token,))
    team = {m["user_id"]: m["role"] for m in env.client.get("/v1/team", headers=owner["h"]).json()}
    assert team.get(joiner["id"]) == "agent"
    assert env.client.patch(f"/v1/team/{joiner['id']}", json={"role": "viewer"}, headers=owner["h"]).json()["role"] == "viewer"
    assert env.client.delete(f"/v1/team/{joiner['id']}", headers=owner["h"]).status_code == 204
    acct, role = sql("SELECT account_id::text, account_role::text FROM profiles WHERE user_id = %s", joiner["id"])[0]
    assert acct != owner["account_id"] and role == "owner"
    assert env.client.get("/v1/me", headers=joiner["h"]).json()["account_id"] == acct  # their login still works


def test_support_tickets_notes_and_announcements_on_the_real_database(env):
    staff, u = env.staff("super_admin"), env.user("helpme")
    t = env.client.post("/v1/support/tickets", json={"subject": "Can't connect", "category": "WhatsApp connection", "message": "Help"}, headers=u["h"])
    assert t.status_code == 201, t.text
    n = t.json()["number"]
    env.client.post(f"/v1/platform/tickets/{n}/messages", json={"text": "secret staff note", "note": True}, headers=staff["h"])
    env.client.post(f"/v1/platform/tickets/{n}/messages", json={"text": "Try again now"}, headers=staff["h"])
    mine = env.client.get("/v1/support/tickets", headers=u["h"]).json()[0]
    assert [m["from"] for m in mine["messages"]] == ["business", "admin"] and mine["status"] == "pending"
    # even reading the table directly with their own login, the database hides staff notes
    import os

    import psycopg

    with psycopg.connect(os.environ["E2E_PG_DSN"], autocommit=True) as c:
        c.execute("SET ROLE authenticated")
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (u["id"],))
        texts = [r[0] for r in c.execute("SELECT text FROM support_messages WHERE ticket = %s", (n,)).fetchall()]
    assert "secret staff note" not in texts and "Try again now" in texts
    made = env.client.post("/v1/platform/announcements", json={"title": f"Hello {n}", "audience": "trial"}, headers=staff["h"])
    assert made.status_code == 201
    assert f"Hello {n}" in [a["title"] for a in env.client.get("/v1/announcements", headers=u["h"]).json()]


def test_internal_charge_and_events_on_the_real_database(env):
    from app.config import get_settings

    base = env.client.app.dependency_overrides[get_settings]()
    s = base.model_copy(update={"internal_secret": "e2e-internal-secret"})
    env.client.app.dependency_overrides[get_settings] = lambda: s
    try:
        h = {"X-AutoShift-Internal": "e2e-internal-secret"}
        u = env.user("internal")
        # default: Meta bills the business, so the wallet is not charged for messages
        sql("UPDATE platform_settings SET value = '\"business\"' WHERE key = 'meta_fees_billed_to'")
        free = env.client.post("/v1/internal/charge", json={"account_id": u["account_id"], "category": "marketing", "ref": "wamid.free", "idempotency_key": "msg:wamid.free"}, headers=h).json()
        assert free["billed_by"] == "meta" and free["charged_paise"] == 0
        # Solution Partner mode: the wallet recovers the fee
        sql("UPDATE platform_settings SET value = '\"autoshift\"' WHERE key = 'meta_fees_billed_to'")
        sql("SELECT wallet_apply(%s, 1000, 'topup', 'seed', %s)", u["account_id"], f"seed-int-{u['id']}")
        body = {"account_id": u["account_id"], "category": "marketing", "units": 1, "ref": f"wamid.{u['id']}", "idempotency_key": f"msg:wamid.{u['id']}"}
        r1 = env.client.post("/v1/internal/charge", json=body, headers=h).json()
        r2 = env.client.post("/v1/internal/charge", json=body, headers=h).json()
        assert r1["balance_paise"] == 901 and r2["applied"] is False and r2["balance_paise"] == 901
        assert sql("SELECT count(*) FROM wallet_ledger WHERE account_id = %s AND kind = 'charge_marketing'", u["account_id"])[0][0] == 1
        hook = env.client.post("/v1/internal/events", json={"account_id": u["account_id"], "type": "message.received", "data": {"text": "hi"}}, headers=h)
        assert hook.status_code == 202
        assert env.client.post("/v1/internal/charge", json=body, headers=u["h"]).status_code == 401  # a user's login can't use it
    finally:
        sql("UPDATE platform_settings SET value = '\"business\"' WHERE key = 'meta_fees_billed_to'")
        env.client.app.dependency_overrides[get_settings] = lambda: base


def test_closing_a_business_on_the_real_database_keeps_money_and_removes_customer_data(env):
    owner, mate = env.user("closer"), env.user("mate")
    acct = owner["account_id"]
    # a teammate, money history, customers with a chat, an assistant
    sql("UPDATE profiles SET account_id = %s, account_role = 'agent' WHERE user_id = %s", acct, mate["id"])
    sql("DELETE FROM accounts WHERE id = %s", mate["account_id"])
    sql("SELECT wallet_apply(%s, 2500, 'topup', 'pay_close', %s)", acct, f"close-{acct}")
    contact = sql("INSERT INTO contacts (account_id, user_id, phone, name) VALUES (%s, %s, '+919999', 'Ravi') RETURNING id", acct, owner["id"])[0][0]
    conv = sql("INSERT INTO conversations (account_id, user_id, contact_id) VALUES (%s, %s, %s) RETURNING id", acct, owner["id"], contact)[0][0]
    msg = sql("INSERT INTO messages (conversation_id, sender_type, content_text) VALUES (%s, 'customer', 'hi') RETURNING id", conv)[0][0]
    env.client.post("/v1/assistants", json={"name": "Bot"}, headers=owner["h"])
    name = sql("SELECT name FROM accounts WHERE id = %s", acct)[0][0]

    r = env.client.post("/v1/account/close", json={"confirm_name": name}, headers=owner["h"])
    assert r.status_code == 200, r.text
    assert r.json()["wallet_left_paise"] == 2500 and r.json()["members_moved"] == 1
    for table in ("contacts", "conversations", "assistants"):
        assert sql(f"SELECT count(*) FROM {table} WHERE account_id = %s", acct)[0][0] == 0, table
    assert sql("SELECT count(*) FROM messages WHERE id = %s", msg)[0][0] == 0  # gone with its conversation
    assert sql("SELECT count(*) FROM wallet_ledger WHERE account_id = %s", acct)[0][0] == 1
    assert sql("SELECT status, name FROM accounts WHERE id = %s", acct)[0] == ("closed", "Closed business")
    mate_acct = sql("SELECT account_id::text FROM profiles WHERE user_id = %s", mate["id"])[0][0]
    assert mate_acct != acct and env.client.get("/v1/me", headers=mate["h"]).json()["account_id"] == mate_acct
    assert env.client.get("/v1/assistants", headers=owner["h"]).status_code == 403

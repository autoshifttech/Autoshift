from datetime import timedelta

from .test_platform_ops import S, iso
from .test_workspace_ops import FakeBridge, seed_chat


def test_reports(client, world):
    seed_chat(world)
    world.store["subscriptions"] = [
        {"account_id": world.acct_a, "plan_id": "starter", "cycle": "monthly", "status": "trialing", "trial_ends_at": iso(timedelta(days=3))},
        {"account_id": world.acct_b, "plan_id": "starter", "cycle": "monthly", "status": "active", "trial_ends_at": iso(-timedelta(days=30))},
    ]
    world.store["plans"] = [{"id": "starter", "name": "Starter", "monthly_paise": 99900, "ai_replies": 500}]
    world.store["payment_orders"] = [{"id": "p1", "account_id": world.acct_a, "status": "paid", "base_paise": 100000, "gst_paise": 18000, "total_paise": 118000, "razorpay_payment_id": "pay_1", "razorpay_order_id": "order_1", "created_at": iso(), "paid_at": iso()}]
    daily = client.get("/v1/platform/reports/daily", headers=S(world)).json()
    assert daily["top_ups"] == {"count": 1, "rupees_before_gst": 1000.0}
    assert client.get("/v1/platform/reports/daily", headers=world.headers("owner_a")).status_code == 403
    growth = client.get("/v1/platform/reports/growth", headers=S(world, "staff_support")).json()
    assert growth["paying"] == 1 and growth["mrr_rupees"] == 999.0
    ending = client.get("/v1/platform/reports/trials-ending?days=7", headers=S(world)).json()
    assert [e["account_id"] for e in ending] == [world.acct_a]
    risk = client.get("/v1/platform/reports/churn-risk", headers=S(world)).json()
    b = next(r for r in risk if r["account_id"] == world.acct_b)
    assert "wallet empty" in b["reasons"] and any("no chats" in x for x in b["reasons"])
    assert all("no chats" not in x for x in next(r for r in risk if r["account_id"] == world.acct_a)["reasons"])


def test_business_search_timeline_whatsapp(client, world):
    found = client.get("/v1/platform/businesses-search?q=business a", headers=S(world)).json()
    assert [f["id"] for f in found] == [world.acct_a]
    found = client.get("/v1/platform/businesses-search?q=admin_b@example", headers=S(world)).json()
    assert world.acct_b in [f["id"] for f in found]
    world.store["audit_log"] = [{"id": 1, "account_id": world.acct_a, "action": "contact.create", "actor_id": "u", "target": "c", "created_at": iso()}]
    world.store["support_tickets"] = [{"number": 7, "account_id": world.acct_a, "subject": "Help", "status": "open", "created_at": iso()}]
    tl = client.get(f"/v1/platform/businesses/{world.acct_a}/timeline", headers=S(world)).json()
    assert {e["kind"] for e in tl} == {"change", "support"}
    world.store["whatsapp_config"] = [{"id": "w", "account_id": world.acct_a, "status": "connected", "phone_number_id": "1", "access_token": "SECRET"}]
    wa = client.get(f"/v1/platform/businesses/{world.acct_a}/whatsapp", headers=S(world)).json()
    assert wa["connected"] and "SECRET" not in str(wa)


def test_money_plans_settings(client, world):
    world.store["payment_orders"] = [{"id": "p1", "account_id": world.acct_a, "status": "paid", "base_paise": 100000, "gst_paise": 18000, "total_paise": 118000, "razorpay_payment_id": "pay_1", "razorpay_order_id": "order_1", "created_at": iso(), "paid_at": iso()}]
    assert client.get("/v1/platform/payments/pay_1", headers=S(world, "staff_support")).status_code == 403
    p = client.get("/v1/platform/payments/order_1", headers=S(world, "staff_finance")).json()
    assert p["total_rupees"] == 1180.0 and p["business"] == "Business A"
    assert client.get("/v1/platform/payments/nope", headers=S(world, "staff_finance")).status_code == 404
    assert client.get("/v1/platform/refunds", headers=S(world, "staff_finance")).json() == []
    body = {"id": "business", "name": "Business", "monthly_paise": 499900, "ai_replies": 5000}
    assert client.post("/v1/platform/plans", json=body, headers=S(world, "staff_finance")).status_code == 403
    made = client.post("/v1/platform/plans", json=body, headers=S(world)).json()
    assert made["active"] is False
    assert client.post("/v1/platform/plans", json=body, headers=S(world)).status_code == 409
    bs = client.get("/v1/platform/billing-settings", headers=S(world)).json()
    assert bs["api_key_limits_per_day"]["messages"] == 300 and bs["rates_paise"]


def test_failures_models_otp_keys(client, world):
    _, conv = seed_chat(world)
    world.store["messages"].append({"id": "m9", "conversation_id": conv["id"], "sender_type": "agent", "status": "failed", "error_code": 131047, "error_title": "Re-engagement message", "created_at": iso()})
    mf = client.get("/v1/platform/message-failures", headers=S(world)).json()
    assert mf["failed"] == 1 and mf["by_business"][0]["business"] == "Business A"
    world.store["platform_ai_models"] = [{"vendor": "openai", "model_id": "gpt-x", "is_default": True}, {"vendor": "openai", "model_id": "gpt-y", "is_default": False}]
    world.store["assistants"] = [{"id": "a", "account_id": world.acct_a, "provider": "openai", "model_id": "gpt-y"}]
    assert client.delete("/v1/platform/ai-providers/openai/models/gpt-x", headers=S(world)).status_code == 409
    assert client.delete("/v1/platform/ai-providers/openai/models/gpt-y", headers=S(world)).status_code == 409
    world.store["assistants"] = []
    assert client.delete("/v1/platform/ai-providers/openai/models/gpt-y", headers=S(world)).status_code == 204
    assert client.get("/v1/platform/phone-verification", headers=S(world)).json()["enabled"] is False
    assert client.put("/v1/platform/phone-verification", json={"enabled": True}, headers=S(world)).status_code == 409
    world.store["platform_settings"] = [{"key": "phone_otp", "value": {"sender_account_id": world.acct_a}}]
    on = client.put("/v1/platform/phone-verification", json={"enabled": True}, headers=S(world)).json()
    assert on["enabled"] and on["required_since"]
    from app.deps import get_web_bridge

    b = FakeBridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: b
    client.post("/v1/platform/phone-verification/template", headers=S(world))
    assert b.calls[0][:2] == ("otp_template_create", world.acct_a)
    world.store["mcp_keys"] = [{"id": "k1", "key_hash": "HASH", "prefix": "asmcp_ab", "name": "n8n", "kind": "account", "scope": "write", "account_id": world.acct_a, "user_id": world.users["owner_a"], "created_at": iso()}]
    keys = client.get("/v1/platform/api-keys", headers=S(world)).json()
    assert keys[0]["business"] == "Business A" and "HASH" not in str(keys)
    assert client.get("/v1/platform/api-keys", headers=S(world, "staff_support")).status_code == 403
    assert client.post("/v1/platform/api-keys/k1/revoke", headers=S(world)).json()["ok"]
    assert world.store["mcp_keys"][0]["revoked_at"]
    assert client.get("/v1/platform/api-keys", headers=S(world)).json() == []


def test_audit_filters(client, world):
    world.store["audit_log"] = [
        {"id": 1, "scope": "platform", "action": "payment.refund", "account_id": world.acct_a, "created_at": iso()},
        {"id": 2, "scope": "account", "action": "contact.create", "account_id": world.acct_a, "created_at": iso()},
        {"id": 3, "scope": "platform", "action": "plan.update", "account_id": None, "created_at": iso(-timedelta(days=40))},
    ]
    h = S(world)
    assert [r["id"] for r in client.get("/v1/platform/audit?action=payment.*", headers=h).json()] == [1]
    assert {r["id"] for r in client.get("/v1/platform/audit?scope=platform", headers=h).json()} == {1, 3}
    assert {r["id"] for r in client.get("/v1/platform/audit?days=30", headers=h).json()} == {1, 2}

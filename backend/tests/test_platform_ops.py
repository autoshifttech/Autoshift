import uuid
from datetime import datetime, timedelta, timezone

from .test_mcp import call_tool
from .test_workspace_ops import seed_chat


def iso(delta=timedelta()):
    return (datetime.now(timezone.utc) + delta).isoformat()


def S(world, who="staff_super"):
    return world.headers(who)


def test_business_usage_and_low_wallets(client, world):
    seed_chat(world)
    world.store["wallet_balances"] = [{"account_id": world.acct_a, "balance_paise": 5000}, {"account_id": world.acct_b, "balance_paise": 90000}]
    world.store["wallet_ledger"] = [{"id": 1, "account_id": world.acct_a, "kind": "charge_marketing", "amount_paise": -99, "created_at": iso()}]
    u = client.get(f"/v1/platform/businesses/{world.acct_a}/usage", headers=S(world, "staff_support")).json()
    assert u["contacts"] == 1 and u["spend_paise_by_kind"] == {"marketing": 99} and u["wallet_paise"] == 5000
    assert client.get(f"/v1/platform/businesses/{world.acct_a}/usage", headers=world.headers("owner_a")).status_code == 403
    low = client.get("/v1/platform/low-wallets", headers=S(world)).json()
    assert [w["account_id"] for w in low] == [world.acct_a]


def test_revenue_needs_finance_and_groups(client, world):
    world.store["invoices"] = [
        {"id": "i1", "account_id": world.acct_a, "kind": "topup", "base_paise": 100000, "gst_paise": 18000, "total_paise": 118000, "issued_at": iso(-timedelta(days=1))},
        {"id": "i2", "account_id": world.acct_b, "kind": "subscription", "base_paise": 249900, "gst_paise": 44982, "total_paise": 294882, "issued_at": iso()},
    ]
    assert client.get("/v1/platform/revenue", headers=S(world, "staff_support")).status_code == 403
    r = client.get("/v1/platform/revenue", headers=S(world, "staff_finance")).json()
    assert r["total_base_paise"] == 349900 and r["by_kind_base_paise"] == {"topup": 100000, "subscription": 249900}


def test_plans_and_rates_super_only_and_audited(client, world):
    assert client.patch("/v1/platform/plans/growth", json={"monthly_paise": 299900}, headers=S(world, "staff_support")).status_code == 403
    world.store["plans"][1]["razorpay_plan_monthly"] = "plan_old"
    res = client.patch("/v1/platform/plans/growth", json={"monthly_paise": 299900}, headers=S(world))
    assert res.status_code == 200 and res.json()["monthly_paise"] == 299900 and res.json()["razorpay_plan_monthly"] is None
    assert client.patch("/v1/platform/plans/nope", json={"seats": 3}, headers=S(world)).status_code == 404
    assert client.put("/v1/platform/rates", json={"marketing": 120}, headers=S(world, "staff_finance")).status_code == 403
    assert client.put("/v1/platform/rates", json={"marketing": 120}, headers=S(world)).json()["rates_paise"]["charge_marketing"] == 120
    # the wallet now charges the new rate
    assert client.get("/v1/wallet", headers=world.headers("viewer_a")).json()["rates_paise"]["charge_marketing"] == 120
    actions = {a["action"] for a in world.store["audit_log"]}
    assert {"plan.update", "rates.update"} <= actions


def test_whatsapp_health_and_issues(client, world):
    _, conv = seed_chat(world)
    world.store["whatsapp_config"] = [{"id": "w", "account_id": world.acct_a, "status": "connected", "phone_number_id": "1", "access_token": "SECRET", "last_registration_error": None}]
    world.store["messages"].append({"id": str(uuid.uuid4()), "conversation_id": conv["id"], "sender_type": "agent", "status": "failed", "error_title": "Re-engagement message", "created_at": iso()})
    h = client.get("/v1/platform/whatsapp-health", headers=S(world, "staff_support")).json()
    assert h["connected"] == 1 and "SECRET" not in str(h)
    issues = client.get("/v1/platform/whatsapp-issues", headers=S(world)).json()
    assert [i["account_id"] for i in issues] == [world.acct_a] and issues[0]["top_errors"][0]["error"] == "Re-engagement message"


def test_system_status_alerts_and_dismiss(client, world):
    world.store["wallet_balances"] = [{"account_id": world.acct_a, "balance_paise": -500}]
    world.store["subscriptions"] = [{"account_id": world.acct_a, "plan_id": "starter", "status": "active"}, {"account_id": world.acct_b, "plan_id": "growth", "status": "past_due"}]
    st = client.get("/v1/platform/system-status", headers=S(world)).json()
    assert st["checks"]["database"] == "ok"
    alerts = client.get("/v1/platform/alerts", headers=S(world)).json()
    ids = {a["id"] for a in alerts}
    assert f"w-{world.acct_a}" in ids and f"p-{world.acct_b}" in ids
    assert client.post(f"/v1/platform/alerts/w-{world.acct_a}/dismiss", headers=S(world, "staff_finance")).status_code == 403
    assert client.post(f"/v1/platform/alerts/w-{world.acct_a}/dismiss", headers=S(world, "staff_support")).status_code == 200
    assert f"w-{world.acct_a}" not in {a["id"] for a in client.get("/v1/platform/alerts", headers=S(world)).json()}
    assert client.put("/v1/platform/alert-settings", json={"rules": {"paymentFailed": False}}, headers=S(world, "staff_support")).status_code == 403
    assert client.put("/v1/platform/alert-settings", json={"rules": {"paymentFailed": False}}, headers=S(world)).json()["rules"]["paymentFailed"] is False
    assert f"p-{world.acct_b}" not in {a["id"] for a in client.get("/v1/platform/alerts", headers=S(world)).json()}


def test_ticket_get(client, world):
    res = client.post("/v1/support/tickets", json={"subject": "Help", "message": "Broken"}, headers=world.headers("admin_a"))
    number = res.json()["number"]
    t = client.get(f"/v1/platform/tickets/{number}", headers=S(world, "staff_support")).json()
    assert t["business"] == "Business A" and t["messages"][0]["text"] == "Broken"
    assert client.get("/v1/platform/tickets/99999", headers=S(world)).status_code == 404


def test_users_list_get_role_and_reset(client, world, auth_admin):
    rows = client.get("/v1/platform/users?q=agent_a", headers=S(world, "staff_support")).json()
    assert [r["user_id"] for r in rows] == [world.users["agent_a"]] and rows[0]["business"] == "Business A"
    staff = client.get("/v1/platform/users?q=staff_super", headers=S(world)).json()
    assert staff[0]["autoshift_team"] == "super_admin"
    one = client.get(f"/v1/platform/users/{world.users['agent_a']}", headers=S(world)).json()
    assert one["disabled"] is False and "password" not in str(one).lower()
    assert client.patch(f"/v1/platform/users/{world.users['agent_a']}/role", json={"role": "admin"}, headers=S(world, "staff_support")).json()["role"] == "admin"
    assert client.patch(f"/v1/platform/users/{world.users['owner_a']}/role", json={"role": "agent"}, headers=S(world)).status_code == 409  # a business keeps an owner
    res = client.post(f"/v1/platform/users/{world.users['agent_a']}/send-reset", headers=S(world, "staff_support"))
    assert res.status_code == 200 and auth_admin.recoveries == ["agent_a@example.com"] and "link" not in res.json()
    assert client.post(f"/v1/platform/users/{world.users['staff_finance']}/send-reset", headers=S(world)).status_code == 403  # staff are managed elsewhere


def test_invite_never_grants_staff_access(client, world, auth_admin):
    res = client.post("/v1/platform/users/invite", json={"account_id": world.acct_a, "name": "New", "email": "new@x.in", "role": "agent"}, headers=S(world, "staff_support"))
    assert res.status_code == 201
    assert client.post("/v1/platform/users/invite", json={"account_id": world.acct_a, "name": "N", "email": "n2@x.in", "role": "super_admin"}, headers=S(world)).status_code == 422
    assert not any(a["user_id"] == res.json()["user_id"] for a in world.store["platform_admins"])


def test_disable_enable_revokes_keys(client, world, auth_admin):
    uid = world.users["agent_a"]
    world.store.setdefault("mcp_keys", []).append({"id": "k1", "user_id": uid, "account_id": world.acct_a, "revoked_at": None})
    assert client.post(f"/v1/platform/users/{uid}/disable", json={"reason": "spam"}, headers=S(world, "staff_finance")).status_code == 403
    res = client.post(f"/v1/platform/users/{uid}/disable", json={"reason": "spam"}, headers=S(world, "staff_support")).json()
    assert res["api_keys_revoked"] == 1 and world.store["mcp_keys"][0]["revoked_at"]
    assert client.get(f"/v1/platform/users/{uid}", headers=S(world)).json()["disabled"] is True
    assert client.post(f"/v1/platform/users/{uid}/enable", headers=S(world, "staff_support")).status_code == 200
    assert client.get(f"/v1/platform/users/{uid}", headers=S(world)).json()["disabled"] is False
    assert client.post(f"/v1/platform/users/{world.users['staff_support']}/disable", json={}, headers=S(world, "staff_support")).status_code == 403


def test_remove_user_keeps_business_and_money_but_not_last_owner(client, world, auth_admin):
    contact, _ = seed_chat(world)
    world.store.setdefault("wallet_ledger", []).append({"id": 9, "account_id": world.acct_a, "kind": "topup", "amount_paise": 100000, "created_by": world.users["admin_a"], "created_at": iso()})
    assert client.post(f"/v1/platform/users/{world.users['owner_a']}/remove", json={}, headers=S(world)).status_code == 409
    uid = world.users["admin_a"]
    assert client.post(f"/v1/platform/users/{uid}/remove", json={}, headers=S(world, "staff_support")).status_code == 403
    res = client.post(f"/v1/platform/users/{uid}/remove", json={"reason": "asked to be deleted"}, headers=S(world))
    assert res.status_code == 200
    p = next(p for p in world.store["profiles"] if p["user_id"] == uid)
    assert p["full_name"] == "Deleted user" and p["email"] is None and p["account_id"] is None
    assert any(c["id"] == contact["id"] for c in world.store["contacts"])  # business data kept
    assert world.store["wallet_ledger"][-1]["created_by"] == uid  # money record kept
    assert auth_admin.updates[-1][1]["email"].startswith("removed+")
    assert client.post(f"/v1/platform/users/{uid}/enable", headers=S(world)).status_code == 409


def test_platform_tools_with_a_platform_key(client, world):
    from .test_keys import _mint

    res = client.post("/v1/platform/mcp-keys", json={"name": "ops", "scope": "write"}, headers=S(world))
    assert res.status_code == 201, res.text
    key = res.json()["key"]
    err, text = call_tool(client, key, "platform_rates_update", marketing=110)
    assert not err and "confirmation_required" in text
    err, text = call_tool(client, key, "platform_user_remove", user_id=world.users["agent_a"])
    assert not err and "confirmation_required" in text and "agent_a@example.com" in text
    err, text = call_tool(client, key, "platform_system_status")
    assert not err and "database" in text
    # a workspace key can't use platform tools
    ws = _mint(client, world, scope="write")["key"]
    err, text = call_tool(client, ws, "platform_users_list")
    assert err

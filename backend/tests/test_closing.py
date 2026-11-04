from app import wallet


def H(world, who):
    return world.headers(who)


async def _with_history(world):
    await wallet.apply(world.service, world.acct_a, 5000, "topup", "pay_1", "close-history")
    world.rows("invoices").append({"id": "i1", "account_id": world.acct_a, "number": "INV-1", "kind": "topup", "razorpay_payment_id": "pay_1", "base_paise": 5000, "gst_paise": 900, "total_paise": 5900})
    world.rows("contacts").append({"id": "c1", "account_id": world.acct_a, "phone": "+911", "name": "Customer"})
    world.rows("assistants").append({"id": "as1", "account_id": world.acct_a, "name": "Bot"})
    world.rows("subscriptions").append({"account_id": world.acct_a, "plan_id": "growth", "cycle": "monthly", "status": "active", "razorpay_subscription_id": "sub_9"})


async def test_owner_closes_their_business_keeping_money_records(client, world, rzp):
    await _with_history(world)
    assert client.post("/v1/account/close", json={"confirm_name": "Wrong"}, headers=H(world, "owner_a")).status_code == 422
    assert client.post("/v1/account/close", json={"confirm_name": "Business A"}, headers=H(world, "admin_a")).status_code == 403  # owner only
    r = client.post("/v1/account/close", json={"confirm_name": "Business A"}, headers=H(world, "owner_a"))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out == {"closed": True, "wallet_left_paise": 5000, "invoices_kept": 1, "members_moved": 3}
    # money kept, customer data gone
    assert len(world.rows("wallet_ledger")) == 1 and len(world.rows("invoices")) == 1
    assert world.rows("contacts") == [] and world.rows("assistants") == []
    # billing stopped right away
    assert rzp.cancelled == [("sub_9", False)] and world.rows("subscriptions")[0]["status"] == "cancelled"
    # anonymous shell; the team can still sign in to their own new workspaces
    acct = next(a for a in world.rows("accounts") if a["id"] == world.acct_a)
    assert acct["name"] == "Closed business" and acct["status"] == "closed"
    assert client.get("/v1/me", headers=H(world, "agent_a")).json()["account_id"] != world.acct_a
    assert client.get("/v1/assistants", headers=H(world, "owner_a")).status_code == 403
    assert any(a["action"] == "business.close" for a in world.rows("audit_log"))


async def test_closing_needs_a_real_sign_in_not_a_key(client, world):
    key = client.post("/v1/mcp-keys", json={"name": "k", "scope": "write"}, headers=H(world, "owner_a")).json()["key"]
    r = client.post("/v1/account/close", json={"confirm_name": "Business A"}, headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 403 and next(a for a in world.rows("accounts") if a["id"] == world.acct_a)["status"] == "active"


async def test_staff_close_a_business_and_razorpay_failure_closes_nothing(client, world, rzp):
    await _with_history(world)
    rzp.fail = True
    assert client.post(f"/v1/platform/businesses/{world.acct_a}/close", json={"confirm_name": "Business A"}, headers=H(world, "staff_super")).status_code == 502
    assert world.rows("contacts") != []  # nothing was deleted
    rzp.fail = False
    assert client.post(f"/v1/platform/businesses/{world.acct_a}/close", json={"confirm_name": "Business A"}, headers=H(world, "staff_support")).status_code == 403
    assert client.post(f"/v1/platform/businesses/{world.acct_a}/close", json={"confirm_name": "Business A"}, headers=H(world, "staff_super")).json()["closed"] is True
    assert client.post(f"/v1/platform/businesses/{world.acct_a}/close", json={"confirm_name": "Closed business"}, headers=H(world, "staff_super")).status_code == 409


async def test_owner_schedules_deletion_can_cancel_and_the_worker_closes_it_when_due(client, world, rzp):
    from app import closing

    await _with_history(world)
    assert client.post("/v1/account/close-request", json={"confirm_name": "Business A"}, headers=H(world, "admin_a")).status_code == 403  # owner only
    assert client.post("/v1/account/close-request", json={"confirm_name": "Nope"}, headers=H(world, "owner_a")).status_code == 422
    r = client.post("/v1/account/close-request", json={"confirm_name": "Business A", "reason": "too_expensive"}, headers=H(world, "owner_a"))
    assert r.status_code == 200 and r.json()["close_after"]
    assert await closing.close_due(world.service, rzp) == 0  # not yet: 30 days of grace
    assert world.rows("contacts") != []
    assert client.delete("/v1/account/close-request", headers=H(world, "owner_a")).json()["close_after"] is None
    client.post("/v1/account/close-request", json={"confirm_name": "Business A"}, headers=H(world, "owner_a"))
    next(a for a in world.rows("accounts") if a["id"] == world.acct_a)["close_after"] = "2000-01-01T00:00:00+00:00"  # grace over
    assert await closing.close_due(world.service, rzp) == 1
    assert world.rows("contacts") == [] and next(a for a in world.rows("accounts") if a["id"] == world.acct_a)["status"] == "closed"

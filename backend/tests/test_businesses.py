def H(world, who):
    return world.headers(who)


def _create(client, world, who="staff_super", email="new@shop.in", **kw):
    return client.post("/v1/platform/businesses", json={"name": "Shop", "industry": "retail", "city": "Pune", "owner": {"name": "Asha", "email": email}, "plan_id": "growth", **kw}, headers=H(world, who))


def test_staff_can_create_a_business_with_owner_and_trial(client, world, auth_admin):
    res = _create(client, world)
    assert res.status_code == 201, res.text
    b = res.json()
    assert b["plan_id"] == "growth" and b["subscription_status"] == "trialing" and b["members"] == 1
    assert auth_admin.invited == ["new@shop.in"]
    owner = next(p for p in world.rows("profiles") if p.get("email") == "new@shop.in")
    assert owner["account_role"] == "owner" and owner["account_id"] == b["id"]
    assert any(a["action"] == "business.create" for a in world.rows("audit_log"))


def test_the_logins_automatic_empty_account_is_reused_not_duplicated(client, world):
    before = len(world.rows("accounts"))
    b = _create(client, world).json()
    # the invited login arrived with its own personal account; it became this business
    assert len(world.rows("accounts")) == before + 1
    assert [a["name"] for a in world.rows("accounts") if a["id"] == b["id"]] == ["Shop"]


def test_a_login_whose_personal_account_already_has_data_is_refused(client, world):
    # new@shop.in signed up earlier and has already built something
    uid = world.add_user("new", None, None, bare=True)
    prof = next(p for p in world.rows("profiles") if p["user_id"] == uid)
    prof["email"] = "new@shop.in"
    world.rows("assistants").append({"id": "x", "account_id": prof["account_id"], "name": "Mine"})
    res = _create(client, world)
    assert res.status_code == 409 and len(world.rows("assistants")) == 1


def test_creating_for_someone_already_in_a_business_is_refused(client, world):
    res = _create(client, world, email="owner_a@example.com")
    assert res.status_code == 409 and len(world.rows("accounts")) == 2


def test_unknown_plan_refused(client, world):
    assert _create(client, world, plan_id="nope").status_code == 422


def test_businesses_routes_are_for_platform_staff_only(client, world):
    for who in ("owner_a", "loner"):
        assert client.get("/v1/platform/businesses", headers=H(world, who)).status_code == 403
    assert _create(client, world, who="owner_a").status_code == 403
    assert _create(client, world, who="staff_finance").status_code == 403  # finance can look, not manage


def test_list_and_detail_show_team_and_wallet(client, world):
    listed = client.get("/v1/platform/businesses", headers=H(world, "staff_support")).json()
    assert {b["name"] for b in listed} == {"Business A", "Business B"}
    detail = client.get(f"/v1/platform/businesses/{world.acct_a}", headers=H(world, "staff_finance")).json()
    assert {m["role"] for m in detail["team"]} == {"owner", "admin", "agent", "viewer"}


def test_suspended_business_is_locked_out_including_keys_then_restored(client, world):
    key = client.post("/v1/mcp-keys", json={"name": "k"}, headers=H(world, "admin_a")).json()["key"]
    r = client.post(f"/v1/platform/businesses/{world.acct_a}/suspend", json={"suspended": True, "reason": "unpaid"}, headers=H(world, "staff_support"))
    assert r.status_code == 200 and r.json()["status"] == "suspended"
    assert client.get("/v1/assistants", headers=H(world, "owner_a")).status_code == 403
    assert client.get("/v1/assistants", headers={"Authorization": f"Bearer {key}"}).status_code == 403
    # the other business is unaffected
    assert client.get("/v1/assistants", headers=H(world, "admin_b")).status_code == 200
    client.post(f"/v1/platform/businesses/{world.acct_a}/suspend", json={"suspended": False}, headers=H(world, "staff_support"))
    assert client.get("/v1/assistants", headers=H(world, "owner_a")).status_code == 200


def test_update_and_delete(client, world):
    r = client.patch(f"/v1/platform/businesses/{world.acct_b}", json={"city": "Delhi"}, headers=H(world, "staff_support"))
    assert r.json()["city"] == "Delhi"
    assert client.delete(f"/v1/platform/businesses/{world.acct_b}", headers=H(world, "staff_support")).status_code == 403
    assert client.delete(f"/v1/platform/businesses/{world.acct_b}", headers=H(world, "staff_super")).status_code == 204
    assert all(a["id"] != world.acct_b for a in world.rows("accounts"))
    assert client.get(f"/v1/platform/businesses/{world.acct_b}", headers=H(world, "staff_super")).status_code == 404


def test_team_add_role_remove_and_last_owner_protection(client, world):
    base = f"/v1/platform/businesses/{world.acct_b}/team"
    r = client.post(base, json={"name": "Raj", "email": "raj@b.in", "role": "agent"}, headers=H(world, "staff_support"))
    assert r.status_code == 201, r.text
    uid = r.json()["user_id"]
    # the new member's automatic personal account is gone; they are on this team only
    assert [p["account_id"] for p in world.rows("profiles") if p["user_id"] == uid] == [world.acct_b]
    assert sum(1 for a in world.rows("accounts") if a["owner_user_id"] == uid) == 0
    assert client.patch(f"{base}/{uid}", json={"role": "admin"}, headers=H(world, "staff_support")).json()["role"] == "admin"
    assert client.delete(f"{base}/{uid}", headers=H(world, "staff_support")).status_code == 204
    # admin_b is the only person; make them owner then try to demote/remove the sole owner
    admin_b = world.users["admin_b"]
    client.patch(f"{base}/{admin_b}", json={"role": "owner"}, headers=H(world, "staff_support"))
    assert client.patch(f"{base}/{admin_b}", json={"role": "agent"}, headers=H(world, "staff_support")).status_code == 409
    assert client.delete(f"{base}/{admin_b}", headers=H(world, "staff_support")).status_code == 409


def test_plan_seat_limit_is_enforced(client, world):
    world.rows("subscriptions").append({"account_id": world.acct_a, "plan_id": "starter"})  # 2 seats, 4 people already
    r = client.post(f"/v1/platform/businesses/{world.acct_a}/team", json={"name": "X", "email": "x@a.in", "role": "agent"}, headers=H(world, "staff_super"))
    assert r.status_code == 409

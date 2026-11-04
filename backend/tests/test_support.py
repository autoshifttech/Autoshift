def H(world, who="admin_a"):
    return world.headers(who)


def _open(client, world, who="agent_a", subject="Template rejected"):
    r = client.post("/v1/support/tickets", json={"subject": subject, "category": "Templates", "priority": "high", "message": "Why was it rejected?"}, headers=H(world, who))
    assert r.status_code == 201, r.text
    return r.json()


def test_any_member_opens_a_ticket_and_sees_only_their_business(client, world):
    t = _open(client, world)
    assert t["id"] == "T-1041" and t["status"] == "open" and t["messages"][0]["author"] == "agent_a"
    assert [x["id"] for x in client.get("/v1/support/tickets", headers=H(world, "viewer_a")).json()] == ["T-1041"]
    assert client.get("/v1/support/tickets", headers=H(world, "admin_b")).json() == []
    assert client.post("/v1/support/tickets/1041/messages", json={"text": "hello"}, headers=H(world, "admin_b")).status_code == 404


def test_staff_reply_note_and_close_and_the_business_never_sees_notes(client, world):
    _open(client, world)
    r = client.post("/v1/platform/tickets/1041/messages", json={"text": "Internal: check Meta policy", "note": True}, headers=H(world, "staff_support"))
    assert r.status_code == 201 and r.json()["status"] == "open"
    r = client.post("/v1/platform/tickets/1041/messages", json={"text": "Please remove the discount code."}, headers=H(world, "staff_support"))
    assert r.json()["status"] == "pending" and r.json()["assignee"] == "staff_support"
    mine = client.get("/v1/support/tickets", headers=H(world, "agent_a")).json()[0]
    assert [m["from"] for m in mine["messages"]] == ["business", "admin"]  # the note is not there
    assert "Internal" not in str(mine)
    staff = client.get("/v1/platform/tickets", headers=H(world, "staff_finance")).json()[0]
    assert [m["from"] for m in staff["messages"]] == ["business", "note", "admin"] and staff["business"] == "Business A"
    # the business replies -> reopened; staff closes
    assert client.post("/v1/support/tickets/1041/messages", json={"text": "Done, thanks"}, headers=H(world, "agent_a")).json()["status"] == "open"
    assert client.post("/v1/platform/tickets/1041/messages", json={"text": "Great!", "close": True}, headers=H(world, "staff_support")).json()["status"] == "closed"


def test_ticket_fields_and_who_may_change_them(client, world):
    _open(client, world)
    assert client.patch("/v1/platform/tickets/1041", json={"priority": "urgent", "assignee": "Deepa"}, headers=H(world, "staff_support")).json()["priority"] == "urgent"
    assert client.patch("/v1/platform/tickets/1041", json={"status": "closed"}, headers=H(world, "staff_finance")).status_code == 403
    assert client.get("/v1/platform/tickets", headers=H(world, "owner_a")).status_code == 403


def test_announcements_reach_the_right_businesses(client, world):
    world.rows("subscriptions").extend([{"account_id": world.acct_a, "plan_id": "growth", "status": "trialing"}, {"account_id": world.acct_b, "plan_id": "pro", "status": "active"}])
    for title, audience in (("For all", "all"), ("Trial only", "trial"), ("Paying only", "paying"), ("Pro plan", "pro")):
        assert client.post("/v1/platform/announcements", json={"title": title, "audience": audience}, headers=H(world, "staff_support")).status_code == 201
    client.post("/v1/platform/announcements", json={"title": "Draft", "draft": True}, headers=H(world, "staff_support"))
    client.post("/v1/platform/announcements", json={"title": "Later", "publish_at": "2099-01-01T00:00:00+00:00"}, headers=H(world, "staff_support"))
    a = {x["title"] for x in client.get("/v1/announcements", headers=H(world, "viewer_a")).json()}
    b = {x["title"] for x in client.get("/v1/announcements", headers=H(world, "admin_b")).json()}
    assert a == {"For all", "Trial only"} and b == {"For all", "Paying only", "Pro plan"}
    assert client.post("/v1/platform/announcements", json={"title": "x"}, headers=H(world, "staff_finance")).status_code == 403


def test_admin_team_rules(client, world, auth_admin):
    r = client.post("/v1/platform/admins", json={"email": "deepa@autoshift.app", "name": "Deepa", "role": "support"}, headers=H(world, "staff_super"))
    assert r.status_code == 201, r.text
    uid = r.json()["user_id"]
    assert client.post("/v1/platform/admins", json={"email": "x@y.in", "name": "X", "role": "support"}, headers=H(world, "staff_support")).status_code == 403
    assert client.patch(f"/v1/platform/admins/{uid}", json={"role": "finance"}, headers=H(world, "staff_super")).json()["role"] == "finance"
    sup = world.users["staff_super"]
    assert client.patch(f"/v1/platform/admins/{sup}", json={"role": "support"}, headers=H(world, "staff_super")).status_code == 409  # the last super admin
    assert client.delete(f"/v1/platform/admins/{sup}", headers=H(world, "staff_super")).status_code == 400  # not yourself
    assert client.delete(f"/v1/platform/admins/{uid}", headers=H(world, "staff_super")).status_code == 204
    assert client.get("/v1/platform/businesses", headers={"Authorization": f"Bearer {world.token('deepa')}"}).status_code == 403  # access gone

import hashlib


def H(world, who="admin_a"):
    return world.headers(who)


def test_everyone_on_the_team_can_see_it_and_only_their_own(client, world):
    names = {m["name"] for m in client.get("/v1/team", headers=H(world, "viewer_a")).json()}
    assert names == {"owner_a", "admin_a", "agent_a", "viewer_a"}
    assert {m["name"] for m in client.get("/v1/team", headers=H(world, "admin_b")).json()} == {"admin_b"}


def test_admins_change_roles_with_the_same_rules_as_the_database(client, world):
    agent, owner, admin = world.users["agent_a"], world.users["owner_a"], world.users["admin_a"]
    assert client.patch(f"/v1/team/{agent}", json={"role": "viewer"}, headers=H(world)).json()["role"] == "viewer"
    assert client.patch(f"/v1/team/{agent}", json={"role": "admin"}, headers=H(world, "agent_a")).status_code == 403
    assert client.patch(f"/v1/team/{admin}", json={"role": "agent"}, headers=H(world)).status_code == 400  # not yourself
    assert client.patch(f"/v1/team/{owner}", json={"role": "agent"}, headers=H(world)).status_code == 400  # not the owner
    assert client.patch(f"/v1/team/{agent}", json={"role": "owner"}, headers=H(world)).status_code == 400  # no new owners here
    assert client.patch(f"/v1/team/{world.users['admin_b']}", json={"role": "agent"}, headers=H(world)).status_code == 404  # other business


def test_a_removed_person_gets_an_empty_workspace_of_their_own(client, world):
    agent = world.users["agent_a"]
    assert client.delete(f"/v1/team/{agent}", headers=H(world)).status_code == 204
    prof = next(p for p in world.rows("profiles") if p["user_id"] == agent)
    assert prof["account_id"] != world.acct_a and prof["account_role"] == "owner"
    assert any(a["id"] == prof["account_id"] and a["owner_user_id"] == agent for a in world.rows("accounts"))
    assert client.delete(f"/v1/team/{world.users['owner_a']}", headers=H(world)).status_code == 400


def test_invite_link_is_shown_once_and_only_its_hash_is_stored(client, world):
    res = client.post("/v1/team/invitations", json={"role": "agent", "label": "For Raj"}, headers=H(world, "admin_b"))
    assert res.status_code == 201, res.text
    url = res.json()["url"]
    token = url.rsplit("/join/", 1)[1]
    stored = world.rows("account_invitations")[0]
    assert stored["token_hash"] == hashlib.sha256(token.encode()).hexdigest() and token not in str(stored)
    listed = client.get("/v1/team/invitations", headers=H(world, "admin_b")).json()
    assert len(listed) == 1 and "url" not in listed[0] and "token_hash" not in listed[0]
    assert client.post("/v1/team/invitations", json={"role": "owner"}, headers=H(world, "admin_b")).status_code == 422
    assert client.delete(f"/v1/team/invitations/{listed[0]['id']}", headers=H(world)).status_code == 404  # other business
    assert client.delete(f"/v1/team/invitations/{listed[0]['id']}", headers=H(world, "admin_b")).status_code == 204


def test_invites_count_against_the_plan_seats(client, world):
    world.rows("subscriptions").append({"account_id": world.acct_b, "plan_id": "starter"})  # 2 seats, 1 used
    assert client.post("/v1/team/invitations", json={"role": "agent"}, headers=H(world, "admin_b")).status_code == 201
    r = client.post("/v1/team/invitations", json={"role": "agent"}, headers=H(world, "admin_b"))
    assert r.status_code == 409 and "pending invites" in r.json()["detail"]

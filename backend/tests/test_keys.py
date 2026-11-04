from datetime import datetime, timedelta, timezone

from app.security import hash_key


def _mint(client, world, who="admin_a", **body):
    res = client.post("/v1/mcp-keys", json={"name": "Claude", **body}, headers=world.headers(who))
    assert res.status_code == 201, res.text
    return res.json()


def _bearer(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def test_the_key_is_shown_once_and_only_its_hash_is_stored(client, world):
    made = _mint(client, world)
    assert made["key"].startswith("asmcp_") and made["prefix"] == made["key"][:12]
    stored = world.rows("mcp_keys")[0]
    assert stored["key_hash"] == hash_key(made["key"]) and made["key"] not in str(stored)
    listed = client.get("/v1/mcp-keys", headers=world.headers("admin_a")).json()
    assert len(listed) == 1 and "key" not in listed[0] and "key_hash" not in listed[0]


def test_a_key_acts_as_its_owner_in_its_workspace(client, world):
    key = _mint(client, world, scope="write")["key"]
    me = client.get("/v1/me", headers=_bearer(key)).json()
    assert me["account_id"] == world.acct_a and me["role"] == "admin"
    made = client.post("/v1/assistants", json={"name": "Via key"}, headers=_bearer(key))
    assert made.status_code == 201 and made.json()["created_by"] == world.users["admin_a"]


def test_a_read_only_key_cannot_change_anything(client, world):
    key = _mint(client, world, scope="read")["key"]
    assert client.get("/v1/assistants", headers=_bearer(key)).status_code == 200
    assert client.post("/v1/assistants", json={"name": "Nope"}, headers=_bearer(key)).status_code == 403
    assert world.rows("assistants") == []


def test_a_key_is_limited_to_its_owners_current_role(client, world):
    key = _mint(client, world, scope="write")["key"]
    next(p for p in world.rows("profiles") if p["user_id"] == world.users["admin_a"])["account_role"] = "viewer"  # demoted
    assert client.post("/v1/assistants", json={"name": "Nope"}, headers=_bearer(key)).status_code == 403


def test_revoked_expired_and_unknown_keys_are_401(client, world):
    made = _mint(client, world)
    assert client.get("/v1/me", headers=_bearer("asmcp_unknown")).status_code == 401
    assert client.delete(f"/v1/mcp-keys/{made['id']}", headers=world.headers("admin_a")).status_code == 204
    assert client.get("/v1/me", headers=_bearer(made["key"])).status_code == 401
    other = _mint(client, world)
    world.rows("mcp_keys")[-1]["expires_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    assert client.get("/v1/me", headers=_bearer(other["key"])).status_code == 401


def test_a_key_cannot_mint_or_reach_another_workspace_or_platform(client, world):
    key = _mint(client, world, scope="write")["key"]
    assert client.post("/v1/mcp-keys", json={"name": "Child"}, headers=_bearer(key)).status_code == 403
    assert client.get("/v1/platform/ai-models", headers=_bearer(key)).status_code == 403
    mine = client.post("/v1/assistants", json={"name": "A"}, headers=_bearer(key)).json()
    keyb = _mint(client, world, who="admin_b", scope="write")["key"]
    assert client.get(f"/v1/assistants/{mine['id']}", headers=_bearer(keyb)).status_code == 404


def test_only_admins_manage_keys_and_each_business_sees_only_its_own(client, world):
    assert client.post("/v1/mcp-keys", json={"name": "x"}, headers=world.headers("agent_a")).status_code == 403
    _mint(client, world)
    assert client.get("/v1/mcp-keys", headers=world.headers("admin_b")).json() == []
    made = world.rows("mcp_keys")[0]
    assert client.delete(f"/v1/mcp-keys/{made['id']}", headers=world.headers("admin_b")).status_code == 404


def test_platform_keys_are_for_super_admins_and_only_work_on_platform_routes(client, world):
    assert client.post("/v1/platform/mcp-keys", json={"name": "Ops"}, headers=world.headers("staff_finance")).status_code == 403
    made = client.post("/v1/platform/mcp-keys", json={"name": "Ops", "scope": "write"}, headers=world.headers("staff_super")).json()
    key = made["key"]
    assert client.get("/v1/platform/ai-models", headers=_bearer(key)).status_code == 200
    assert client.get("/v1/me", headers=_bearer(key)).status_code == 403  # not a workspace key
    assert client.post("/v1/platform/mcp-keys", json={"name": "Child"}, headers=_bearer(key)).status_code == 403
    assert client.delete(f"/v1/platform/mcp-keys/{made['id']}", headers=world.headers("staff_super")).status_code == 204
    assert client.get("/v1/platform/ai-models", headers=_bearer(key)).status_code == 401


def test_key_creation_and_revocation_are_audited(client, world):
    made = _mint(client, world)
    client.delete(f"/v1/mcp-keys/{made['id']}", headers=world.headers("admin_a"))
    assert [a["action"] for a in world.rows("audit_log")] == ["api_key.create", "api_key.revoke"]

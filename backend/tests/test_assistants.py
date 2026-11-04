def test_viewer_and_agent_can_read_but_not_write(client, world):
    for who in ("viewer_a", "agent_a"):
        assert client.get("/v1/assistants", headers=world.headers(who)).status_code == 200
        assert client.post("/v1/assistants", json={"name": "Nope"}, headers=world.headers(who)).status_code == 403


def test_admin_creates_updates_and_deletes_with_an_audit_trail(client, world):
    h = world.headers("admin_a")
    made = client.post("/v1/assistants", json={"name": "Sales", "provider": "anthropic", "model_id": "claude-sonnet-5-5", "tone": "concise"}, headers=h)
    assert made.status_code == 201
    row = made.json()
    assert row["account_id"] == world.acct_a and row["created_by"] == world.users["admin_a"]

    patched = client.patch(f"/v1/assistants/{row['id']}", json={"enabled": True, "greeting": "Hi!"}, headers=h)
    assert patched.status_code == 200 and patched.json()["enabled"] is True

    assert client.delete(f"/v1/assistants/{row['id']}", headers=h).status_code == 204
    assert client.get(f"/v1/assistants/{row['id']}", headers=h).status_code == 404

    actions = [a["action"] for a in world.rows("audit_log")]
    assert actions == ["assistant.create", "assistant.update", "assistant.delete"]
    assert all(a["account_id"] == world.acct_a and a["scope"] == "account" for a in world.rows("audit_log"))


def test_validation_rejects_bad_input(client, world):
    h = world.headers("admin_a")
    assert client.post("/v1/assistants", json={"name": ""}, headers=h).status_code == 422
    assert client.post("/v1/assistants", json={"name": "X", "color": "red"}, headers=h).status_code == 422
    assert client.post("/v1/assistants", json={"name": "X", "provider": "skynet"}, headers=h).status_code == 422
    made = client.post("/v1/assistants", json={"name": "X"}, headers=h).json()
    assert client.patch(f"/v1/assistants/{made['id']}", json={}, headers=h).status_code == 422


def test_businesses_cannot_see_or_touch_each_others_assistants(client, world):
    mine = client.post("/v1/assistants", json={"name": "A's bot"}, headers=world.headers("admin_a")).json()
    hb = world.headers("admin_b")
    assert client.get("/v1/assistants", headers=hb).json() == []
    assert client.get(f"/v1/assistants/{mine['id']}", headers=hb).status_code == 404
    assert client.patch(f"/v1/assistants/{mine['id']}", json={"name": "Hacked"}, headers=hb).status_code == 404
    assert client.delete(f"/v1/assistants/{mine['id']}", headers=hb).status_code == 404
    still = client.get(f"/v1/assistants/{mine['id']}", headers=world.headers("owner_a")).json()
    assert still["name"] == "A's bot"


def test_account_filter_holds_even_if_row_level_security_were_off(client, world, monkeypatch):
    """The router filters by account itself, so isolation never rests on one layer."""
    from app.deps import get_user_db
    from .conftest import FakeDb

    client.app.dependency_overrides[get_user_db] = lambda: FakeDb(world.store, tenant=None)  # no RLS simulation
    mine = client.post("/v1/assistants", json={"name": "A's bot"}, headers=world.headers("admin_a")).json()
    hb = world.headers("admin_b")
    assert client.get("/v1/assistants", headers=hb).json() == []
    assert client.get(f"/v1/assistants/{mine['id']}", headers=hb).status_code == 404
    assert client.patch(f"/v1/assistants/{mine['id']}", json={"name": "Hacked"}, headers=hb).status_code == 404
    assert client.delete(f"/v1/assistants/{mine['id']}", headers=hb).status_code == 404
    assert world.rows("assistants")[0]["name"] == "A's bot"

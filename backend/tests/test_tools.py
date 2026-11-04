import pytest

from app import events


@pytest.fixture(autouse=True)
def fake_dns(monkeypatch):
    import ipaddress

    def resolve(h, p, **k):
        try:
            ip = str(ipaddress.ip_address(h))  # an address resolves to itself, as real DNS does
        except ValueError:
            ip = "10.0.0.1" if h.endswith(".internal") else "93.184.216.34"
        return [(2, 1, 6, "", (ip, p))]

    monkeypatch.setattr(events.socket, "getaddrinfo", resolve)


def H(world, who="admin_a"):
    return world.headers(who)


def hook(url="https://n8n.example.com/webhook/order"):
    return {"url": url, "method": "POST", "params": [{"name": "order_id", "type": "string", "required": True, "description": "Order number"}]}


def test_every_business_starts_with_the_builtins_switched_on(client, world):
    tools = client.get("/v1/tools", headers=H(world, "viewer_a")).json()
    assert [t["key"] for t in tools] == ["capture_lead", "add_tag", "send_template", "send_file", "handoff"]
    assert all(t["builtin"] and t["enabled"] for t in tools)
    client.get("/v1/tools", headers=H(world, "viewer_a"))
    assert len([r for r in world.rows("ai_tools") if r["account_id"] == world.acct_a]) == 5  # not seeded twice


def test_custom_webhook_tool_create_edit_delete(client, world):
    made = client.post("/v1/tools", json={"name": "Order status", "description": "Where is my order", "webhook": hook()}, headers=H(world))
    assert made.status_code == 201, made.text
    key = made.json()["key"]
    assert key.startswith("custom_") and made.json()["webhook"]["params"][0]["name"] == "order_id"
    assert client.patch(f"/v1/tools/{key}", json={"enabled": False}, headers=H(world)).json()["enabled"] is False
    aid = client.post("/v1/assistants", json={"name": "Bot", "tool_ids": [key, "handoff"]}, headers=H(world)).json()["id"]
    assert client.delete(f"/v1/tools/{key}", headers=H(world)).status_code == 204
    assert client.get(f"/v1/assistants/{aid}", headers=H(world)).json()["tool_ids"] == ["handoff"]  # no dangling reference


@pytest.mark.parametrize("url", ["http://n8n.example.com/x", "https://db.internal/x", "https://10.0.0.1/x"])
def test_webhook_tools_must_point_at_public_https(client, world, url):
    assert client.post("/v1/tools", json={"name": "X", "description": "x", "webhook": hook(url)}, headers=H(world)).status_code == 422


def test_builtins_only_switch_on_or_off_and_cannot_be_deleted(client, world):
    client.get("/v1/tools", headers=H(world))
    assert client.patch("/v1/tools/handoff", json={"enabled": False}, headers=H(world)).json()["enabled"] is False
    assert client.patch("/v1/tools/handoff", json={"name": "Renamed"}, headers=H(world)).status_code == 400
    assert client.delete("/v1/tools/handoff", headers=H(world)).status_code == 400


def test_roles_and_isolation(client, world):
    key = client.post("/v1/tools", json={"name": "Mine", "description": "d", "webhook": hook()}, headers=H(world)).json()["key"]
    assert client.post("/v1/tools", json={"name": "No", "description": "d", "webhook": hook()}, headers=H(world, "agent_a")).status_code == 403
    assert client.patch(f"/v1/tools/{key}", json={"enabled": False}, headers=H(world, "admin_b")).status_code == 404
    assert key not in [t["key"] for t in client.get("/v1/tools", headers=H(world, "admin_b")).json()]

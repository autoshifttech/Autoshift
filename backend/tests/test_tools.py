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


# ------------------------------------------------------------------ "Send a test request"
from app.routers.tools import get_sender  # noqa: E402


@pytest.fixture
def sent(client):
    calls = []

    async def fake(method, url, args):
        calls.append((method, url, args))
        if "down" in url:
            import httpx
            raise httpx.ConnectError("refused")
        if "broken" in url:
            return 500, "oops"
        return 200, '{"status": "shipped"}'

    client.app.dependency_overrides[get_sender] = lambda: fake
    yield calls
    client.app.dependency_overrides.pop(get_sender, None)


def test_test_request_really_calls_the_webhook_and_reports_its_answer(client, world, sent):
    res = client.post("/v1/tools/test", json={"webhook": hook(), "arguments": {"order_id": "A12", "not_a_field": "x"}}, headers=H(world))
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["ok"] is True and out["status"] == 200 and out["body"] == '{"status": "shipped"}' and out["error"] is None
    assert sent == [("POST", "https://n8n.example.com/webhook/order", {"order_id": "A12"})]  # only the tool's own fields go out


def test_test_request_reports_failures_instead_of_pretending(client, world, sent):
    broken = client.post("/v1/tools/test", json={"webhook": hook("https://n8n.example.com/broken")}, headers=H(world)).json()
    assert broken["ok"] is False and broken["status"] == 500 and broken["body"] == "oops"
    down = client.post("/v1/tools/test", json={"webhook": hook("https://n8n.example.com/down")}, headers=H(world)).json()
    assert down["ok"] is False and down["status"] == 0 and "Could not reach" in down["error"]


@pytest.mark.parametrize("url", ["http://n8n.example.com/x", "https://db.internal/x", "https://10.0.0.1/x"])
def test_test_request_only_goes_to_public_https(client, world, sent, url):
    assert client.post("/v1/tools/test", json={"webhook": hook(url)}, headers=H(world)).status_code == 422
    assert sent == []


def test_test_request_needs_an_admin(client, world, sent):
    assert client.post("/v1/tools/test", json={"webhook": hook()}, headers=H(world, "viewer_a")).status_code == 403
    assert sent == []

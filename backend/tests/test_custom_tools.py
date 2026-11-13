import json

import pytest

from app import events
from app.routers.custom_tools import get_poster

from .test_keys import _mint
from .test_mcp import call_tool, rpc


class Hook:
    def __init__(self, status=200, answer=None):
        self.status, self.answer, self.calls = status, answer if answer is not None else {"ok": True, "order": "A-1"}, []

    async def __call__(self, url, headers, body):
        self.calls.append((url, headers, json.loads(body)))
        return self.status, json.dumps(self.answer)


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    def getaddrinfo(host, port, **kw):
        return [(2, 1, 6, "", ("10.0.0.5" if host == "internal.corp" else "93.184.216.34", port))]

    monkeypatch.setattr(events.socket, "getaddrinfo", getaddrinfo)


@pytest.fixture
def hook(client):
    h = Hook()
    client.app.dependency_overrides[get_poster] = lambda: h
    return h


TOOL = {
    "name": "order_status",
    "description": "Look up an order in the shop system",
    "params": [{"name": "order_id", "type": "string", "required": True, "description": "Order number"}, {"name": "notify", "type": "boolean"}],
    "webhook_url": "https://n8n.example.com/webhook/order",
    "audience": "business",
    "min_role": "agent",
}


def make(client, world, **over):
    res = client.post("/v1/platform/custom-tools", json={**TOOL, **over}, headers=world.headers("staff_super"))
    assert res.status_code == 201, res.text
    return res.json()


def test_only_super_admins_manage_and_secret_shown_once(client, world):
    assert client.post("/v1/platform/custom-tools", json=TOOL, headers=world.headers("staff_support")).status_code == 403
    assert client.post("/v1/platform/custom-tools", json=TOOL, headers=world.headers("owner_a")).status_code == 403
    t = make(client, world)
    assert t["secret"].startswith("whsec_")
    listed = client.get("/v1/platform/custom-tools", headers=world.headers("staff_support")).json()
    assert listed[0]["name"] == "order_status" and "secret" not in json.dumps(listed)
    assert client.post("/v1/platform/custom-tools", json=TOOL, headers=world.headers("staff_super")).status_code == 409
    assert client.post("/v1/platform/custom-tools", json={**TOOL, "name": "x2", "webhook_url": "https://internal.corp/h"}, headers=world.headers("staff_super")).status_code == 422
    assert client.post("/v1/platform/custom-tools", json={**TOOL, "name": "platform_hack"}, headers=world.headers("staff_super")).status_code == 422
    assert client.post("/v1/platform/custom-tools", json={**TOOL, "name": "x3", "webhook_url": "http://n8n.example.com/h"}, headers=world.headers("staff_super")).status_code == 422
    rotated = client.patch(f"/v1/platform/custom-tools/{t['id']}", json={"rotate_secret": True}, headers=world.headers("staff_super")).json()
    assert rotated["secret"] != t["secret"]


def test_business_run_is_signed_validated_confirmed_and_audited(client, world, hook):
    t = make(client, world)
    assert [x["name"] for x in client.get("/v1/custom-tools", headers=world.headers("agent_a")).json()] == ["order_status"]
    assert client.get("/v1/custom-tools", headers=world.headers("viewer_a")).json() == []  # below min_role
    assert client.post("/v1/custom-tools/run/order_status", json={"arguments": {"order_id": "A-1"}, "confirm": True}, headers=world.headers("viewer_a")).status_code == 403
    assert client.post("/v1/custom-tools/run/order_status", json={"arguments": {}, "confirm": True}, headers=world.headers("agent_a")).status_code == 422
    assert client.post("/v1/custom-tools/run/order_status", json={"arguments": {"order_id": 5}, "confirm": True}, headers=world.headers("agent_a")).status_code == 422
    assert client.post("/v1/custom-tools/run/order_status", json={"arguments": {"order_id": "A", "evil": 1}, "confirm": True}, headers=world.headers("agent_a")).status_code == 422
    prev = client.post("/v1/custom-tools/run/order_status", json={"arguments": {"order_id": "A-1"}}, headers=world.headers("agent_a")).json()
    assert prev["confirmation_required"] and hook.calls == []
    res = client.post("/v1/custom-tools/run/order_status", json={"arguments": {"order_id": "A-1", "notify": True}, "confirm": True}, headers=world.headers("agent_a"))
    assert res.status_code == 200 and res.json()["result"] == {"ok": True, "order": "A-1"}
    url, headers, body = hook.calls[0]
    assert body["caller"]["account_id"] == world.acct_a and body["arguments"] == {"order_id": "A-1", "notify": True}
    raw = json.dumps(body, separators=(",", ":")).encode()
    assert headers["X-AutoShift-Signature"] == events.sign(t["secret"], headers["X-AutoShift-Timestamp"], raw)
    assert any(a["action"] == "custom_tool.run" and a["account_id"] == world.acct_a for a in world.store["audit_log"])
    assert world.store["custom_mcp_tools"][0]["calls"] == 1


def test_platform_only_tools_are_invisible_to_businesses(client, world, hook):
    make(client, world, name="refund_check", audience="platform", requires_confirm=False)
    assert client.get("/v1/custom-tools", headers=world.headers("owner_a")).json() == []
    assert client.post("/v1/custom-tools/run/refund_check", json={"arguments": {"order_id": "1"}, "confirm": True}, headers=world.headers("owner_a")).status_code == 404
    res = client.post("/v1/platform/custom-tools/run/refund_check", json={"arguments": {"order_id": "1"}}, headers=world.headers("staff_support"))
    assert res.status_code == 200 and hook.calls[0][2]["caller"]["kind"] == "platform"


def test_failures_and_switched_off(client, world, hook):
    t = make(client, world, requires_confirm=False)
    hook.status, hook.answer = 500, {"error": "boom"}
    res = client.post("/v1/custom-tools/run/order_status", json={"arguments": {"order_id": "1"}}, headers=world.headers("agent_a"))
    assert res.status_code == 502 and "500" in res.json()["detail"]
    client.patch(f"/v1/platform/custom-tools/{t['id']}", json={"enabled": False}, headers=world.headers("staff_super"))
    assert client.post("/v1/custom-tools/run/order_status", json={"arguments": {"order_id": "1"}}, headers=world.headers("agent_a")).status_code == 409
    assert client.delete(f"/v1/platform/custom-tools/{t['id']}", headers=world.headers("staff_support")).status_code == 403
    assert client.delete(f"/v1/platform/custom-tools/{t['id']}", headers=world.headers("staff_super")).status_code == 204


def test_mcp_list_and_run_with_both_key_kinds(client, world, hook):
    make(client, world)
    make(client, world, name="staff_report", audience="platform")
    ws = _mint(client, world, scope="write")["key"]
    err, text = call_tool(client, ws, "custom_tools_list")
    assert not err and "order_status" in text and "staff_report" not in text
    err, text = call_tool(client, ws, "custom_tool_run", name="order_status", arguments={"order_id": "A-1"})
    assert not err and "confirmation_required" in text and hook.calls == []
    err, text = call_tool(client, ws, "custom_tool_run", name="order_status", arguments={"order_id": "A-1"}, confirm=True)
    assert not err and "A-1" in text and len(hook.calls) == 1
    pk = client.post("/v1/platform/mcp-keys", json={"name": "ops", "scope": "write"}, headers=world.headers("staff_super")).json()["key"]
    res = rpc(client, pk, "tools/call", {"name": "custom_tools_list", "arguments": {}}).json()["result"]
    assert not res.get("isError") and "staff_report" in json.dumps(res["content"])
    ro = _mint(client, world, scope="read")["key"]
    err, text = call_tool(client, ro, "custom_tool_run", name="order_status", arguments={"order_id": "A-1"}, confirm=True)
    assert err and len(hook.calls) == 1

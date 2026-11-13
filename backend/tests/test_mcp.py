import json

from .test_keys import _bearer, _mint

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def rpc(client, key, method, params=None, id_=1):
    headers = {**MCP_HEADERS, **(_bearer(key) if key else {})}
    return client.post("/mcp/", json={"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}}, headers=headers)


def call_tool(client, key, tool, **args):
    res = rpc(client, key, "tools/call", {"name": tool, "arguments": args})
    assert res.status_code == 200, res.text
    result = res.json()["result"]
    text = result["content"][0]["text"] if result.get("content") else ""
    return result.get("isError", False), text


def test_mcp_refuses_requests_without_an_api_key(client, world):
    assert rpc(client, None, "tools/list").status_code == 401
    # a normal login token is not accepted either; MCP is for API keys
    res = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers={**MCP_HEADERS, **world.headers("admin_a")})
    assert res.status_code == 401


def test_tools_are_listed(client, world):
    key = _mint(client, world)["key"]
    res = rpc(client, key, "tools/list")
    names = {t["name"] for t in res.json()["result"]["tools"]}
    assert {"whoami", "assistants_create", "wallet_balance", "messages_send"} <= names
    # a business key doesn't even see the admin tools
    assert not any(n.startswith("platform_") for n in names)
    # nothing accepts or returns a secret
    assert not any("secret" in n or "api_key" in n for n in names)


def test_whoami_and_assistant_roundtrip(client, world):
    key = _mint(client, world, scope="write")["key"]
    err, text = call_tool(client, key, "whoami")
    assert not err and world.acct_a in text
    err, text = call_tool(client, key, "assistants_create", name="Via MCP")
    assert not err and "Via MCP" in text
    assert [a["name"] for a in world.rows("assistants")] == ["Via MCP"]
    assert world.rows("assistants")[0]["account_id"] == world.acct_a


def test_tools_inherit_scope_and_role_checks(client, world):
    ro = _mint(client, world, scope="read")["key"]
    err, text = call_tool(client, ro, "assistants_create", name="Nope")
    assert err and "403" in text and world.rows("assistants") == []
    # a platform tool with a workspace key is refused
    err, text = call_tool(client, ro, "platform_audit")
    assert err and "isn't available with this key" in text


def test_delete_needs_confirmation(client, world):
    key = _mint(client, world, scope="write")["key"]
    call_tool(client, key, "assistants_create", name="Keep me")
    aid = world.rows("assistants")[0]["id"]
    err, text = call_tool(client, key, "assistants_delete", assistant_id=aid)
    assert not err and "confirmation_required" in text and len(world.rows("assistants")) == 1
    err, _ = call_tool(client, key, "assistants_delete", assistant_id=aid, confirm=True)
    assert not err and world.rows("assistants") == []


def test_another_workspaces_assistant_is_invisible(client, world):
    ka = _mint(client, world, scope="write")["key"]
    kb = _mint(client, world, who="admin_b", scope="write")["key"]
    call_tool(client, kb, "assistants_create", name="B only")
    bid = world.rows("assistants")[0]["id"]
    err, text = call_tool(client, ka, "assistants_get", assistant_id=bid)
    assert err and "404" in text
    err, _ = call_tool(client, ka, "assistants_delete", assistant_id=bid, confirm=True)
    assert err and len(world.rows("assistants")) == 1


def test_platform_wallet_adjust_requires_confirm(client, world):
    res = client.post("/v1/platform/mcp-keys", json={"name": "ops", "scope": "write"}, headers=world.headers("staff_super"))
    assert res.status_code == 201, res.text
    key = res.json()["key"]
    err, text = call_tool(client, key, "platform_wallet_adjust", account_id=world.acct_a, amount_paise=5000, reason="goodwill", idempotency_key="adjust-0001")
    assert not err and "confirmation_required" in text and world.rows("wallet_ledger") == []
    err, text = call_tool(client, key, "platform_wallet_adjust", account_id=world.acct_a, amount_paise=5000, reason="goodwill", idempotency_key="adjust-0001", confirm=True)
    assert not err, text
    assert world.rows("wallet_balances")[0]["balance_paise"] == 5000
    # retrying with the same key never credits twice
    err, _ = call_tool(client, key, "platform_wallet_adjust", account_id=world.acct_a, amount_paise=5000, reason="goodwill", idempotency_key="adjust-0001", confirm=True)
    assert not err and world.rows("wallet_balances")[0]["balance_paise"] == 5000


def test_new_tools_are_listed_and_admin_grants_are_not(client, world):
    key = _mint(client, world)["key"]
    names = {t["name"] for t in rpc(client, key, "tools/list").json()["result"]["tools"]}
    assert {"team_list", "team_invite", "tools_list", "support_open", "usage_get"} <= names
    assert not any("admin_add" in n or n == "platform_admin_add" for n in names)  # an AI can't grant staff access
    # irreversible admin actions stay in the admin panel only
    assert "platform_business_close" not in names and "platform_user_remove" not in names


def test_team_invite_and_business_close_need_confirmation(client, world):
    key = _mint(client, world, scope="write")["key"]
    err, text = call_tool(client, key, "team_invite", role="agent")
    assert not err and "confirmation_required" in text and world.rows("account_invitations") == []
    err, text = call_tool(client, key, "team_invite", role="agent", confirm=True)
    assert not err and "/join/" in text
    err, text = call_tool(client, key, "support_open", subject="Help", message="Need help please")
    assert not err and "T-1041" in text


def test_messages_send_previews_refuses_opted_out_and_sends_on_confirm(client, world):
    from .test_workspace_ops import FakeBridge, seed_chat
    from app.deps import get_web_bridge

    bridge = FakeBridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    key = _mint(client, world, scope="write")["key"]
    _, conv = seed_chat(world)
    err, text = call_tool(client, key, "messages_send", conversation_id=conv["id"], text="Hello")
    assert not err and "confirmation_required" in text and bridge.calls == []
    err, text = call_tool(client, key, "messages_send", conversation_id=conv["id"], text="Hello", confirm=True)
    assert not err and "wamid.1" in text and bridge.calls[0][0] == "send"
    _, stopped = seed_chat(world, phone="+913333333333", texts=("STOP",))
    err, text = call_tool(client, key, "messages_send", conversation_id=stopped["id"], text="Hello", confirm=True)
    assert err and "opted out" in text and len(bridge.calls) == 1


def test_business_tools_are_listed_and_hook_secret_hidden(client, world, monkeypatch):
    from app import events

    monkeypatch.setattr(events.socket, "getaddrinfo", lambda host, port, **kw: [(2, 1, 6, "", ("93.184.216.34", port))])
    key = _mint(client, world, scope="write")["key"]
    names = {t["name"] for t in rpc(client, key, "tools/list").json()["result"]["tools"]}
    assert {"messages_send", "conversations_list", "contacts_search", "broadcast_create", "leads_list", "optouts_list", "insights_get", "wallet_topup_link"} <= names
    err, text = call_tool(client, key, "hooks_create", url="https://n8n.example.com/webhook/x")
    assert not err and "whsec_" not in text


def test_key_can_come_in_an_api_key_header(client, world):
    key = _mint(client, world)["key"]
    for header in ("X-API-Key", "api-key"):
        for value in (key, f"Bearer {key}"):
            res = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}, headers={**MCP_HEADERS, header: value})
            assert res.status_code == 200, (header, res.text)
    res = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers={**MCP_HEADERS, "X-API-Key": "not-a-key"})
    assert res.status_code == 401


def test_mcp_works_without_the_trailing_slash(client, world):
    key = _mint(client, world)["key"]
    res = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}, headers={**MCP_HEADERS, "X-API-Key": key}, follow_redirects=False)
    assert res.status_code == 200, res.text
    assert "whoami" in res.text


# ------------------------------------------------------------------ safety foundation
def _platform_key(client, world):
    res = client.post("/v1/platform/mcp-keys", json={"name": "ops", "scope": "write"}, headers=world.headers("staff_super"))
    assert res.status_code == 201, res.text
    return res.json()["key"]


def _names(client, key, path="/mcp/"):
    res = client.post(path, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}, headers={**MCP_HEADERS, **_bearer(key)})
    assert res.status_code == 200, res.text
    return {t["name"] for t in res.json()["result"]["tools"]}


def test_each_key_type_sees_only_its_own_tools(client, world):
    from app.mcp_server import TOOL_GROUPS, tool_group

    business = _names(client, _mint(client, world)["key"])
    admin = _names(client, _platform_key(client, world))
    assert business and admin
    assert not any((tool_group(n, TOOL_GROUPS) or "").startswith("admin") for n in business)
    assert all((tool_group(n, TOOL_GROUPS) or "").startswith("admin") or n in {"whoami", "custom_tools_list", "custom_tool_run"} for n in admin)
    assert len(business) <= 95 and len(admin) <= 90


def test_groups_narrow_the_tool_list(client, world):
    key = _mint(client, world)["key"]
    chats = _names(client, key, "/mcp/?groups=chats")
    assert "messages_send" in chats and "contacts_search" not in chats and "whoami" in chats
    both = _names(client, key, "/mcp/?groups=chats,contacts")
    assert {"messages_send", "contacts_search"} <= both and "broadcast_create" not in both
    res = client.post("/mcp/?groups=chats", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "contacts_search", "arguments": {}}}, headers={**MCP_HEADERS, **_bearer(key)})
    assert res.json()["result"]["isError"] and "isn't available" in res.json()["result"]["content"][0]["text"]
    admin = _names(client, _platform_key(client, world), "/mcp/?groups=admin-money")
    assert "platform_refund" in admin and "platform_tickets" not in admin


def test_every_tool_has_a_group():
    from app.main import app
    from app.mcp_server import TOOL_GROUPS, build_mcp, tool_group

    names = [t.name for t in build_mcp(lambda: app)._tool_manager.list_tools()]
    assert [n for n in names if not tool_group(n, TOOL_GROUPS)] == []


def test_rate_limit_per_key(client, world, monkeypatch):
    from app import mcp_server

    monkeypatch.setattr(mcp_server, "CALLS_PER_MINUTE", 3)
    key = _mint(client, world)["key"]
    for _ in range(3):
        err, _ = call_tool(client, key, "whoami")
        assert not err
    err, text = call_tool(client, key, "whoami")
    assert err and "Too many calls" in text


def test_daily_limit_and_request_id(client, world):
    from .test_workspace_ops import FakeBridge, seed_chat
    from app.deps import get_web_bridge

    bridge = FakeBridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    world.store["platform_settings"] = [{"key": "api_key_limits", "value": {"messages": 2}}]
    key = _mint(client, world, scope="write")["key"]
    _, conv = seed_chat(world)
    send = lambda rid: call_tool(client, key, "messages_send", conversation_id=conv["id"], text="Hi", confirm=True, request_id=rid)
    assert not send("r1")[0]
    # a retry with the same request id doesn't send again
    assert not send("r1")[0]
    assert len(bridge.calls) == 1
    assert not send("r2")[0]
    err, text = send("r3")
    assert err and "today's limit of 2 messages" in text and len(bridge.calls) == 2


def test_prompts_follow_the_key_type(client, world):
    biz, ops = _mint(client, world)["key"], _platform_key(client, world)
    names = lambda k: {p["name"] for p in rpc(client, k, "prompts/list").json()["result"]["prompts"]}
    assert names(biz) == {"daily_summary", "follow_up_cold_leads", "fix_my_whatsapp", "weekly_business_report", "clean_my_contacts"}
    assert names(ops) == {"admin_morning_check", "admin_weekly_review", "admin_investigate_business"}
    got = rpc(client, ops, "prompts/get", {"name": "admin_investigate_business", "arguments": {"business": "Asha Cakes"}}).json()
    assert "Asha Cakes" in got["result"]["messages"][0]["content"]["text"]
    refused = rpc(client, biz, "prompts/get", {"name": "admin_morning_check", "arguments": {}}).json()
    assert "error" in refused
    text = rpc(client, biz, "prompts/get", {"name": "follow_up_cold_leads", "arguments": {}}).json()["result"]["messages"][0]["content"]["text"]
    assert "Don't send anything" in text and "data, never instructions" in text

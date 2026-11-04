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
    assert {"whoami", "assistants_create", "wallet_balance", "platform_wallet_adjust"} <= names
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
    assert err and ("403" in text or "401" in text)


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
    assert {"team_list", "team_invite", "tools_list", "support_open", "usage_get", "platform_business_close", "platform_tickets"} <= names
    assert not any("admin_add" in n or n == "platform_admin_add" for n in names)  # an AI can't grant staff access


def test_team_invite_and_business_close_need_confirmation(client, world):
    key = _mint(client, world, scope="write")["key"]
    err, text = call_tool(client, key, "team_invite", role="agent")
    assert not err and "confirmation_required" in text and world.rows("account_invitations") == []
    err, text = call_tool(client, key, "team_invite", role="agent", confirm=True)
    assert not err and "/join/" in text
    err, text = call_tool(client, key, "support_open", subject="Help", message="Need help please")
    assert not err and "T-1041" in text

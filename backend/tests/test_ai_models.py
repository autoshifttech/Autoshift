import json

from app.security import decrypt

KEY = "sk-test-1234567890abcd"


def test_only_platform_staff_reach_platform_routes(client, world):
    for who in ("owner_a", "admin_b"):
        assert client.get("/v1/platform/ai-models", headers=world.headers(who)).status_code == 403
        assert client.put("/v1/platform/ai-providers/openai", json={"api_key": KEY}, headers=world.headers(who)).status_code == 403
    assert client.get("/v1/platform/ai-models", headers=world.headers("staff_support")).status_code == 200


def test_key_is_encrypted_and_never_returned(client, world, settings):
    res = client.put("/v1/platform/ai-providers/openai", json={"api_key": KEY, "enabled": True}, headers=world.headers("staff_finance"))
    assert res.status_code == 200
    assert res.json()["key_tail"] == "abcd" and res.json()["enabled"] is True
    assert KEY not in json.dumps(res.json())

    stored = next(p for p in world.rows("platform_ai_providers") if p["vendor"] == "openai")
    assert KEY not in stored["key_ciphertext"] and decrypt(stored["key_ciphertext"], settings) == KEY

    overview = client.get("/v1/platform/ai-models", headers=world.headers("staff_super")).text
    assert KEY not in overview and "key_ciphertext" not in overview


def test_cannot_switch_a_provider_on_without_a_key(client, world):
    res = client.put("/v1/platform/ai-providers/google", json={"enabled": True}, headers=world.headers("staff_super"))
    assert res.status_code == 422


def test_support_staff_cannot_change_providers(client, world):
    assert client.put("/v1/platform/ai-providers/openai", json={"api_key": KEY}, headers=world.headers("staff_support")).status_code == 403


def test_businesses_only_see_switched_on_providers_without_keys(client, world):
    h = world.headers("agent_a")
    assert client.get("/v1/ai-models/available", headers=h).json() == []
    client.put("/v1/platform/ai-providers/openai", json={"api_key": KEY, "enabled": True}, headers=world.headers("staff_super"))
    available = client.get("/v1/ai-models/available", headers=h).json()
    assert {m["model_id"] for m in available} == {"gpt-5.4-mini", "gpt-5.5"}
    assert KEY not in json.dumps(available)
    client.patch("/v1/platform/ai-providers/openai/models/gpt-5.5", json={"enabled": False}, headers=world.headers("staff_super"))
    assert {m["model_id"] for m in client.get("/v1/ai-models/available", headers=h).json()} == {"gpt-5.4-mini"}


def test_exactly_one_default_and_it_cannot_be_switched_off(client, world):
    h = world.headers("staff_super")
    assert client.patch("/v1/platform/ai-providers/openai/models/gpt-5.4-mini", json={"enabled": False}, headers=h).status_code == 422
    assert client.patch("/v1/platform/ai-providers/anthropic/models/claude-sonnet-5-5", json={"is_default": True}, headers=h).status_code == 200
    defaults = [(m["vendor"], m["model_id"]) for m in world.rows("platform_ai_models") if m["is_default"]]
    assert defaults == [("anthropic", "claude-sonnet-5-5")]
    assert client.patch("/v1/platform/ai-providers/openai/models/gpt-5.4-mini", json={"enabled": False}, headers=h).status_code == 200


def test_custom_models_can_be_added_once(client, world):
    h = world.headers("staff_finance")
    ok = client.post("/v1/platform/ai-providers/openai/models", json={"model_id": "gpt-next", "tier": "preview"}, headers=h)
    assert ok.status_code == 201 and ok.json()["is_custom"] is True and ok.json()["label"] == "gpt-next"
    assert client.post("/v1/platform/ai-providers/openai/models", json={"model_id": "gpt-next"}, headers=h).status_code == 409


def test_every_platform_change_is_audited_without_secrets(client, world):
    client.put("/v1/platform/ai-providers/openai", json={"api_key": KEY, "enabled": True}, headers=world.headers("staff_super"))
    log = client.get("/v1/platform/audit", headers=world.headers("staff_support")).json()
    assert log[0]["action"] == "ai_provider.update" and log[0]["scope"] == "platform"
    assert KEY not in json.dumps(log) and "ciphertext" not in json.dumps(log)
    assert client.get("/v1/platform/audit", headers=world.headers("admin_a")).status_code == 403

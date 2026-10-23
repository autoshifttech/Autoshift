import httpx
import respx

from app.models import ConnectionStatus, MemberRole, WhatsAppAccount
from tests.conftest import APP_ID, GRAPH, PHONE_ID, WABA_ID, headers, make_member

BUSINESS_TOKEN = "EAAG-business-token"
SIGNUP = {"code": "auth-code", "waba_id": WABA_ID, "phone_number_id": PHONE_ID}
PHONE = {
    "id": PHONE_ID,
    "display_phone_number": "+1 555-010-0199",
    "verified_name": "Acme Store",
    "quality_rating": "GREEN",
    "code_verification_status": "VERIFIED",
    "name_status": "APPROVED",
    "status": "CONNECTED",
}


def mock_meta(graph: respx.MockRouter, *, waba_targets=(WABA_ID,), register_ok=True):
    routes = {
        "exchange": graph.get(f"{GRAPH}/oauth/access_token").respond(
            json={"access_token": BUSINESS_TOKEN, "token_type": "bearer"}
        ),
        "debug": graph.get(f"{GRAPH}/debug_token").respond(
            json={
                "data": {
                    "app_id": APP_ID,
                    "is_valid": True,
                    "scopes": ["whatsapp_business_management", "whatsapp_business_messaging"],
                    "granular_scopes": [
                        {"scope": "whatsapp_business_management", "target_ids": list(waba_targets)},
                        {"scope": "whatsapp_business_messaging", "target_ids": list(waba_targets)},
                    ],
                }
            }
        ),
        "numbers": graph.get(f"{GRAPH}/{WABA_ID}/phone_numbers").respond(json={"data": [PHONE]}),
        "subscribe": graph.post(f"{GRAPH}/{WABA_ID}/subscribed_apps").respond(
            json={"success": True}
        ),
        "unsubscribe": graph.delete(f"{GRAPH}/{WABA_ID}/subscribed_apps").respond(
            json={"success": True}
        ),
        "phone": graph.get(f"{GRAPH}/{PHONE_ID}").respond(json=PHONE),
    }
    if register_ok:
        routes["register"] = graph.post(f"{GRAPH}/{PHONE_ID}/register").respond(
            json={"success": True}
        )
    else:
        routes["register"] = graph.post(f"{GRAPH}/{PHONE_ID}/register").respond(
            400,
            json={"error": {"message": "Invalid PIN", "code": 133005, "fbtrace_id": "trace"}},
        )
    return routes


def stored(repo) -> WhatsAppAccount:
    [account] = repo.accounts.values()
    return account


def test_signup_connects_and_stores_encrypted_token(client, repo, graph):
    tenant, user = make_member(repo)
    routes = mock_meta(graph)

    response = client.post(
        "/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(user, tenant.id)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["connection_status"] == "connected"
    assert body["display_phone_number"] == "+1 555-010-0199"
    assert body["webhooks_subscribed"] and body["phone_registered"]
    assert "token" not in response.text.lower().replace("token_", "")
    assert BUSINESS_TOKEN not in response.text

    account = stored(repo)
    assert account.tenant_id == tenant.id
    assert account.token_ciphertext and BUSINESS_TOKEN not in account.token_ciphertext
    assert routes["exchange"].calls.last.request.url.params["code"] == "auth-code"
    assert routes["subscribe"].calls.last.request.headers["authorization"] == (
        f"Bearer {BUSINESS_TOKEN}"
    )
    register_body = routes["register"].calls.last.request.content
    assert b'"messaging_product":"whatsapp"' in register_body.replace(b" ", b"")


def test_signup_rejects_waba_not_granted_to_token(client, repo, graph):
    tenant, user = make_member(repo)
    routes = mock_meta(graph, waba_targets=("999",))

    response = client.post(
        "/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(user, tenant.id)
    )

    assert response.status_code == 403
    assert response.json()["detail"]["step"] == "verify"
    assert repo.accounts == {}
    assert not routes["subscribe"].called


def test_registration_failure_then_retry_resumes(client, repo, graph):
    tenant, user = make_member(repo)
    routes = mock_meta(graph, register_ok=False)

    first = client.post(
        "/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(user, tenant.id)
    )
    assert first.status_code == 200
    assert first.json()["connection_status"] == "registration_failed"
    assert first.json()["last_error"]["message"] == "Invalid PIN"

    routes["register"].mock(return_value=httpx.Response(200, json={"success": True}))
    retry = client.post("/api/whatsapp/account/retry", headers=headers(user, tenant.id))

    assert retry.json()["connection_status"] == "connected"
    assert routes["subscribe"].call_count == 1  # already done; not repeated
    assert routes["register"].call_count == 2


def test_coexistence_skips_registration(client, repo, graph):
    tenant, user = make_member(repo)
    routes = mock_meta(graph)

    response = client.post(
        "/api/whatsapp/embedded-signup",
        json={**SIGNUP, "onboarding_type": "coexistence"},
        headers=headers(user, tenant.id),
    )

    assert response.json()["connection_status"] == "connected"
    assert not routes["register"].called


def test_exchange_failure_returns_502(client, repo, graph):
    tenant, user = make_member(repo)
    graph.get(f"{GRAPH}/oauth/access_token").respond(
        400, json={"error": {"message": "This authorization code has expired.", "code": 100}}
    )

    response = client.post(
        "/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(user, tenant.id)
    )

    assert response.status_code == 502
    assert response.json()["detail"]["step"] == "exchange"
    assert "expired" in response.json()["detail"]["message"]


def test_waba_connected_to_other_tenant_conflicts(client, repo, graph):
    other, _ = make_member(repo, name="Other")
    repo.accounts[other.id] = WhatsAppAccount(
        tenant_id=other.id, waba_id=WABA_ID, phone_number_id=PHONE_ID
    )
    tenant, user = make_member(repo)
    mock_meta(graph)

    response = client.post(
        "/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(user, tenant.id)
    )

    assert response.status_code == 409


def test_permissions(client, repo, graph):
    tenant, agent = make_member(repo, MemberRole.AGENT)
    outsider_tenant, outsider = make_member(repo, name="Elsewhere")
    mock_meta(graph)

    assert client.post("/api/whatsapp/embedded-signup", json=SIGNUP).status_code == 401
    assert (
        client.post(
            "/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(agent, tenant.id)
        ).status_code
        == 403
    )
    assert (
        client.get("/api/whatsapp/account", headers=headers(outsider, tenant.id)).status_code == 403
    )
    assert client.get("/api/whatsapp/account", headers=headers(agent, tenant.id)).json() == {
        "account": None
    }
    assert outsider_tenant.id != tenant.id


def test_invalid_jwt_is_rejected(client, repo):
    tenant, _ = make_member(repo)
    response = client.get(
        "/api/whatsapp/account",
        headers={"Authorization": "Bearer not-a-jwt", "X-Tenant-Id": str(tenant.id)},
    )
    assert response.status_code == 401


def test_disconnect_unsubscribes_and_forgets_token(client, repo, graph):
    tenant, user = make_member(repo)
    routes = mock_meta(graph)
    client.post("/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(user, tenant.id))

    response = client.delete("/api/whatsapp/account", headers=headers(user, tenant.id))

    assert response.json()["connection_status"] == ConnectionStatus.DISCONNECTED
    assert routes["unsubscribe"].called
    assert stored(repo).token_ciphertext is None


def test_refresh_updates_number_status(client, repo, graph):
    tenant, user = make_member(repo)
    routes = mock_meta(graph)
    client.post("/api/whatsapp/embedded-signup", json=SIGNUP, headers=headers(user, tenant.id))
    routes["phone"].mock(
        return_value=httpx.Response(200, json={**PHONE, "quality_rating": "YELLOW"})
    )

    response = client.post("/api/whatsapp/account/refresh", headers=headers(user, tenant.id))

    assert response.json()["quality_rating"] == "YELLOW"


def test_signup_input_validation(client, repo):
    tenant, user = make_member(repo)
    response = client.post(
        "/api/whatsapp/embedded-signup",
        json={**SIGNUP, "waba_id": "../../me"},
        headers=headers(user, tenant.id),
    )
    assert response.status_code == 422

import json

from app.security import decrypt

RZP = {"kind": "razorpay", "razorpay": {"key_id": "rzp_test_AbCdEf123456", "key_secret": "supersecret123", "webhook_secret": "hook-secret-1"}}
SA = {"type": "service_account", "client_email": "bot@proj.iam.gserviceaccount.com", "private_key": "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"}


def test_razorpay_connection_hides_the_secret(client, world, settings):
    res = client.post("/v1/connections", json=RZP, headers=world.headers("admin_a"))
    assert res.status_code == 201
    body = res.json()
    assert body["detail"] == "rzp_test••••3456" and body["mode"] == "test"
    assert "supersecret123" not in json.dumps(body)

    stored = world.rows("flow_connection_secrets")[0]
    assert stored["connection_id"] == body["id"]
    assert "supersecret123" not in stored["ciphertext"]
    assert json.loads(decrypt(stored["ciphertext"], settings))["key_secret"] == "supersecret123"

    listed = client.get("/v1/connections", headers=world.headers("viewer_a")).json()
    assert len(listed) == 1 and "ciphertext" not in json.dumps(listed)


def test_google_connection_uses_the_service_account_email(client, world):
    res = client.post("/v1/connections", json={"kind": "google", "google": {"service_account_json": json.dumps(SA)}}, headers=world.headers("owner_a"))
    assert res.status_code == 201
    assert res.json()["detail"] == "bot@proj.iam.gserviceaccount.com"
    assert res.json()["name"] == "bot@proj.iam.gserviceaccount.com"


def test_bad_secrets_are_rejected(client, world):
    h = world.headers("admin_a")
    assert client.post("/v1/connections", json={"kind": "razorpay", "razorpay": {"key_id": "nope", "key_secret": "supersecret123"}}, headers=h).status_code == 422
    assert client.post("/v1/connections", json={"kind": "google", "google": {"service_account_json": "not json"}}, headers=h).status_code == 422
    assert client.post("/v1/connections", json={"kind": "google", "google": {"service_account_json": json.dumps({"type": "user"})}}, headers=h).status_code == 422
    assert client.post("/v1/connections", json={"kind": "razorpay"}, headers=h).status_code == 422
    assert client.post("/v1/connections", json={"kind": "cashfree"}, headers=h).status_code == 422


def test_only_admins_manage_connections(client, world):
    for who in ("agent_a", "viewer_a"):
        assert client.post("/v1/connections", json=RZP, headers=world.headers(who)).status_code == 403


def test_a_connection_without_its_secret_is_rolled_back(client, world):
    world.fail_on.add("flow_connection_secrets")
    try:
        client.post("/v1/connections", json=RZP, headers=world.headers("admin_a"))
    except RuntimeError:
        pass
    assert world.rows("flow_connections") == []


def test_connections_are_private_to_their_business(client, world):
    made = client.post("/v1/connections", json=RZP, headers=world.headers("admin_a")).json()
    hb = world.headers("admin_b")
    assert client.get("/v1/connections", headers=hb).json() == []
    assert client.delete(f"/v1/connections/{made['id']}", headers=hb).status_code == 404
    assert client.delete(f"/v1/connections/{made['id']}", headers=world.headers("admin_a")).status_code == 204
    assert any(a["action"] == "connection.delete" for a in world.rows("audit_log"))

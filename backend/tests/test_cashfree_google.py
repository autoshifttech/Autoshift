import base64
import hashlib
import hmac
import json
from urllib.parse import parse_qs, urlparse

import pytest

from app import cashfree, google_api
from app.config import get_settings
from app.deps import get_web_bridge
from app.security import decrypt, encrypt

SECRET = "internal-shared-secret-123"
CF_SECRET = "cfsk_ma_test_abcdef123456"


class Bridge:
    def __init__(self):
        self.calls = []

    async def call(self, action, account_id, user_id, role, **fields):
        self.calls.append((action, account_id, fields))
        return {"ok": True}


# ------------------------------------------------------------ Cashfree

def test_cashfree_connection_hides_the_secret(client, world, settings):
    res = client.post("/v1/connections", json={"kind": "cashfree", "cashfree": {"app_id": "TEST1234567890abcdef", "secret_key": CF_SECRET}}, headers=world.headers("admin_a"))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["kind"] == "cashfree" and body["mode"] == "test" and CF_SECRET not in json.dumps(body)
    stored = json.loads(decrypt(world.rows("flow_connection_secrets")[0]["ciphertext"], settings))
    assert stored == {"app_id": "TEST1234567890abcdef", "secret_key": CF_SECRET}
    assert client.post("/v1/connections", json={"kind": "cashfree", "cashfree": {"app_id": "x", "secret_key": "short"}}, headers=world.headers("admin_a")).status_code == 422


def test_cashfree_helpers():
    assert cashfree.mode_for("TEST123", "abc") == "test" and cashfree.mode_for("12345", "cfsk_ma_prod_x") == "live"
    assert cashfree.customer_phone("91 98765 43210") == "9876543210" and cashfree.customer_phone("") == "9999999999"
    raw, ts = b'{"a":1}', "1700000000"
    sig = base64.b64encode(hmac.new(b"k", ts.encode() + raw, hashlib.sha256).digest()).decode()
    assert cashfree.verify_webhook_signature(raw, ts, sig, "k") and not cashfree.verify_webhook_signature(raw, ts, sig, "other")


@pytest.fixture
def cf(client, world, settings, monkeypatch):
    s = settings.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    bridge = Bridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    state = {"calls": [], "status": "ACTIVE", "paid": 0}

    async def fake_post(app_id, secret, mode, path, body):
        state["calls"].append((app_id, mode, path, body))
        return {"link_id": body["link_id"], "link_url": "https://payments.cashfree.com/links/abc", "link_status": "ACTIVE"}

    async def fake_get(app_id, secret, mode, path):
        state["calls"].append((app_id, mode, path, None))
        return {"link_id": path.rsplit("/", 1)[-1], "link_status": state["status"], "link_amount_paid": state["paid"], "cf_link_id": 77}

    monkeypatch.setattr(cashfree, "cf_post", fake_post)
    monkeypatch.setattr(cashfree, "cf_get", fake_get)
    conn = {"id": "5a9b2c1e-1111-4222-8333-944455556666", "account_id": world.acct_a, "kind": "cashfree", "name": "Shop", "detail": "x", "mode": "test", "created_at": "2026-01-01T00:00:00Z"}
    world.rows("flow_connections").append(conn)
    world.rows("flow_connection_secrets").append({"connection_id": conn["id"], "ciphertext": encrypt(json.dumps({"app_id": "TEST1234567890", "secret_key": CF_SECRET}), s)})
    for a in world.rows("accounts"):
        if a["id"] == world.acct_a:
            a["owner_user_id"] = world.users["owner_a"]
    return {"h": {"X-AutoShift-Internal": SECRET}, "conn": conn, "bridge": bridge, "state": state}


def test_cashfree_link_and_paid_webhook(client, world, cf):
    res = client.post("/v1/internal/payment-link", json={"account_id": world.acct_a, "amount": "1,498", "description": "2 × T-shirt", "conversation_id": "conv_1", "customer_phone": "919876543210"}, headers=cf["h"])
    assert res.status_code == 201, res.text
    out = res.json()
    assert out["short_url"] == "https://payments.cashfree.com/links/abc" and out["amount_paise"] == 149800
    _, mode, path, body = cf["state"]["calls"][0]
    assert mode == "test" and path == "/links" and body["link_amount"] == 1498 and body["customer_details"]["customer_phone"] == "9876543210"
    link_id = body["link_id"]

    # Webhook with a bad signature is refused.
    raw = json.dumps({"type": "PAYMENT_LINK_EVENT", "data": {"link_id": link_id, "link_status": "PAID"}}).encode()
    url = f"/v1/webhooks/cashfree/c/{cf['conn']['id']}"
    assert client.post(url, content=raw, headers={"x-webhook-signature": "nope", "x-webhook-timestamp": "1"}).status_code == 400

    # A signed webhook makes us ask Cashfree; it says paid, so the payment is recorded and the customer told.
    cf["state"].update(status="PAID", paid=1498)
    ts = "1700000000"
    sig = base64.b64encode(hmac.new(CF_SECRET.encode(), ts.encode() + raw, hashlib.sha256).digest()).decode()
    res = client.post(url, content=raw, headers={"x-webhook-signature": sig, "x-webhook-timestamp": ts})
    assert res.status_code == 200 and res.json()["status"] == "paid"
    row = next(r for r in world.rows("payment_links") if r["id"] == out["id"])
    assert row["status"] == "paid" and row.get("notified_at")
    assert cf["bridge"].calls[0][0] == "payment_paid"


def test_cashfree_wrong_amount_is_not_marked_paid(client, world, cf):
    out = client.post("/v1/internal/payment-link", json={"account_id": world.acct_a, "amount": "500"}, headers=cf["h"]).json()
    link_id = cf["state"]["calls"][0][3]["link_id"]
    cf["state"].update(status="PAID", paid=5)
    raw = json.dumps({"data": {"link_id": link_id}}).encode()
    ts = "1700000001"
    sig = base64.b64encode(hmac.new(CF_SECRET.encode(), ts.encode() + raw, hashlib.sha256).digest()).decode()
    res = client.post(f"/v1/webhooks/cashfree/c/{cf['conn']['id']}", content=raw, headers={"x-webhook-signature": sig, "x-webhook-timestamp": ts})
    assert res.status_code == 500
    row = next(r for r in world.rows("payment_links") if r["id"] == out["id"])
    assert row["status"] == "created" and not cf["bridge"].calls


# ------------------------------------------------------------ Google

@pytest.fixture
def g(client, settings):
    s = settings.model_copy(update={"google_oauth_client_id": "cid.apps.googleusercontent.com", "google_oauth_client_secret": "gsecret", "public_api_url": "https://api.example.com", "site_url": "https://app.example.com"})
    client.app.dependency_overrides[get_settings] = lambda: s
    return s


def test_google_not_set_up_says_so(client, world):
    assert client.get("/v1/connections/google/available", headers=world.headers("owner_a")).json() == {"oauth": False}
    assert client.post("/v1/connections/google/start", headers=world.headers("owner_a")).status_code == 409


def test_google_connect_round_trip(client, world, g, monkeypatch, settings):
    assert client.get("/v1/connections/google/available", headers=world.headers("agent_a")).json() == {"oauth": True}
    assert client.post("/v1/connections/google/start", headers=world.headers("agent_a")).status_code == 403
    url = client.post("/v1/connections/google/start", headers=world.headers("owner_a")).json()["url"]
    q = parse_qs(urlparse(url).query)
    assert q["redirect_uri"] == ["https://api.example.com/v1/connections/google/callback"] and q["access_type"] == ["offline"]
    assert "https://www.googleapis.com/auth/spreadsheets" in q["scope"][0]

    async def fake_form(u, data):
        assert data["code"] == "the-code"
        return {"access_token": "at", "refresh_token": "rt", "expires_in": 3600, "scope": " ".join(google_api.SCOPES)}

    async def fake_call(method, u, token, body=None):
        return {"email": "shop@gmail.com"}

    monkeypatch.setattr(google_api, "_post_form", fake_form)
    monkeypatch.setattr(google_api, "_call", fake_call)
    res = client.get("/v1/connections/google/callback", params={"code": "the-code", "state": q["state"][0]}, follow_redirects=False)
    assert res.status_code == 303 and res.headers["location"].endswith("/flows/connections?google=connected")
    conn = world.rows("flow_connections")[-1]
    assert conn["kind"] == "google" and conn["detail"] == "shop@gmail.com" and conn["account_id"] == world.acct_a
    secret = json.loads(decrypt(world.rows("flow_connection_secrets")[-1]["ciphertext"], g))
    assert secret == {"type": "oauth", "refresh_token": "rt", "email": "shop@gmail.com"}

    # A tampered or foreign state never saves anything.
    before = len(world.rows("flow_connections"))
    res = client.get("/v1/connections/google/callback", params={"code": "x", "state": "forged"}, follow_redirects=False)
    assert "google=error" in res.headers["location"] and len(world.rows("flow_connections")) == before
    res = client.get("/v1/connections/google/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert "google=cancelled" in res.headers["location"]


def test_google_actions_run_through_the_internal_api(client, world, g, monkeypatch):
    s = g.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    conn = {"id": "6a9b2c1e-1111-4222-8333-944455556666", "account_id": world.acct_a, "kind": "google", "name": "G", "detail": "shop@gmail.com", "mode": None, "created_at": "2026-01-01T00:00:00Z"}
    world.rows("flow_connections").append(conn)
    world.rows("flow_connection_secrets").append({"connection_id": conn["id"], "ciphertext": encrypt(json.dumps({"type": "oauth", "refresh_token": "rt"}), s)})
    google_api._cache.clear()
    sent = []

    async def fake_form(u, data):
        assert data["grant_type"] == "refresh_token"
        return {"access_token": "at", "expires_in": 3600}

    async def fake_call(method, u, token, body=None):
        sent.append((method, u, body))
        if "calendar" in u:
            return {"id": "ev1", "htmlLink": "https://calendar.google.com/event?eid=1"}
        return {"updates": {"updatedRange": "Sheet1!A2:C2"}}

    monkeypatch.setattr(google_api, "_post_form", fake_form)
    monkeypatch.setattr(google_api, "_call", fake_call)
    h = {"X-AutoShift-Internal": SECRET}
    res = client.post("/v1/internal/google-action", json={"account_id": world.acct_a, "service": "google_sheets_append", "params": {
        "spreadsheet": "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit#gid=0", "sheet": "Leads", "values": "Asha\n919876543210\n\n"}}, headers=h)
    assert res.status_code == 200, res.text
    method, u, body = sent[0]
    assert "/spreadsheets/1AbCdEfGhIjKlMn/values/" in u and "%27Leads%27" in u and body == {"values": [["Asha", "919876543210"]]}

    res = client.post("/v1/internal/google-action", json={"account_id": world.acct_a, "service": "google_calendar_event", "params": {
        "calendar": "primary", "title": "Visit: Asha", "start": "20/11/2026 3:30 PM", "minutes": "45"}}, headers=h)
    assert res.status_code == 200 and res.json()["link"].startswith("https://calendar.google.com")
    ev = sent[1][2]
    assert ev["start"]["dateTime"] == "2026-11-20T15:30:00+05:30" and ev["end"]["dateTime"] == "2026-11-20T16:15:00+05:30"

    bad = client.post("/v1/internal/google-action", json={"account_id": world.acct_a, "service": "google_calendar_event", "params": {"start": "someday"}}, headers=h)
    assert bad.status_code == 422
    assert client.post("/v1/internal/google-action", json={"account_id": world.acct_b, "service": "google_sheets_append"}, headers=h).status_code == 409


def test_service_account_token_is_signed(monkeypatch, settings):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    seen = {}

    async def fake_form(u, data):
        seen.update(data)
        return {"access_token": "sa-at", "expires_in": 3600}

    monkeypatch.setattr(google_api, "_post_form", fake_form)
    google_api._cache.clear()
    import asyncio
    tok = asyncio.run(google_api.access_token(settings, "c1", {"type": "service_account", "client_email": "bot@p.iam.gserviceaccount.com", "private_key": pem}))
    assert tok == "sa-at" and seen["grant_type"].endswith("jwt-bearer") and seen["assertion"].count(".") == 2

import time

import jwt

from app.security import AuthError, decrypt, encrypt, mask, verify_token

from .conftest import ENC_KEY, JWT_SECRET


def test_health_needs_no_login(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_no_token_is_401(client):
    assert client.get("/v1/me").status_code == 401


def test_garbage_and_wrong_secret_tokens_are_401(client, world):
    assert client.get("/v1/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/v1/me", headers=world.headers("owner_a", secret="another-secret-another-secret-12345")).status_code == 401


def test_expired_and_wrong_audience_tokens_are_401(client, world):
    assert client.get("/v1/me", headers=world.headers("owner_a", expires_in=-10)).status_code == 401
    assert client.get("/v1/me", headers=world.headers("owner_a", audience="anon")).status_code == 401


def test_me_returns_account_and_role(client, world):
    body = client.get("/v1/me", headers=world.headers("agent_a")).json()
    assert body["account_id"] == world.acct_a
    assert body["role"] == "agent"
    assert body["platform_admin"] is None


def test_me_shows_platform_role_for_staff_with_a_workspace(client, world):
    world.store["profiles"].append({"id": "p-extra", "user_id": world.users["staff_super"], "account_id": world.acct_a, "account_role": "owner"})
    world.store["profiles"].remove(next(p for p in world.store["profiles"] if p["user_id"] == world.users["staff_super"] and "account_id" not in p))
    assert client.get("/v1/me", headers=world.headers("staff_super")).json()["platform_admin"] == "super_admin"


def test_login_without_a_workspace_is_403(client, world):
    assert client.get("/v1/me", headers=world.headers("loner")).status_code == 403


def test_verify_token_rejects_missing_subject(settings):
    token = jwt.encode({"aud": "authenticated", "exp": int(time.time()) + 60}, JWT_SECRET, algorithm="HS256")
    try:
        verify_token(token, settings)
        raise AssertionError("should have failed")
    except AuthError:
        pass


def test_secret_box_round_trip_and_tamper_detection(settings):
    sealed = encrypt("sk-live-abc123", settings)
    assert "sk-live" not in sealed and sealed.startswith("py1:")
    assert decrypt(sealed, settings) == "sk-live-abc123"
    assert encrypt("x", settings) != encrypt("x", settings)  # fresh nonce each time
    tampered = sealed[:-4] + ("AAAA" if not sealed.endswith("AAAA") else "BBBB")
    try:
        decrypt(tampered, settings)
        raise AssertionError("tampering went unnoticed")
    except Exception as exc:  # noqa: BLE001
        assert not isinstance(exc, AssertionError)


def test_encryption_needs_a_proper_key():
    from app.config import Settings

    try:
        encrypt("x", Settings(encryption_key="short"))
        raise AssertionError("short key accepted")
    except RuntimeError:
        pass
    assert ENC_KEY  # the fixture key is valid


def test_mask_hides_the_middle():
    assert mask("rzp_test_AbCdEf123456") == "rzp_test••••3456"
    assert mask("abc") == "abc••••"

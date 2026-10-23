from app.models import ConnectionStatus, WhatsAppAccount
from tests.conftest import PHONE_ID, WABA_ID, headers, make_member, signed


def seed_account(repo):
    tenant, user = make_member(repo)
    account = WhatsAppAccount(
        tenant_id=tenant.id,
        waba_id=WABA_ID,
        phone_number_id=PHONE_ID,
        connection_status=ConnectionStatus.CONNECTED,
        webhooks_subscribed=True,
        token_ciphertext="ciphertext",
    )
    repo.accounts[account.id] = account
    return tenant, user, account


def messages_payload(waba_id=WABA_ID):
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": waba_id,
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550100199",
                                "phone_number_id": PHONE_ID,
                            },
                            "contacts": [{"profile": {"name": "Priya"}, "wa_id": "919876543210"}],
                            "messages": [
                                {
                                    "from": "919876543210",
                                    "id": "wamid.HBgM1",
                                    "timestamp": "1761235200",
                                    "type": "text",
                                    "text": {"body": "Is the blue kurta in stock?"},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def test_verification_handshake(client):
    ok = client.get(
        "/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42"},
    )
    assert ok.status_code == 200
    assert ok.text == "42"

    bad = client.get(
        "/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42"},
    )
    assert bad.status_code == 403


def test_rejects_bad_signature(client, repo):
    seed_account(repo)
    body, hdrs = signed(messages_payload())
    hdrs["X-Hub-Signature-256"] = "sha256=" + "0" * 64

    assert client.post("/webhooks/whatsapp", content=body, headers=hdrs).status_code == 401
    assert client.post("/webhooks/whatsapp", content=body).status_code == 401
    assert repo.messages == {}


def test_messages_are_matched_to_tenant_and_deduplicated(client, repo):
    tenant, user, _ = seed_account(repo)
    body, hdrs = signed(messages_payload())

    assert client.post("/webhooks/whatsapp", content=body, headers=hdrs).status_code == 200
    assert client.post("/webhooks/whatsapp", content=body, headers=hdrs).status_code == 200

    assert len(repo.messages) == 1
    message = repo.messages["wamid.HBgM1"]
    assert message.tenant_id == tenant.id
    assert message.contact_name == "Priya"
    assert message.text == "Is the blue kurta in stock?"
    assert len(repo.webhook_events) == 2
    assert all(e["processed_at"] and e["error"] is None for e in repo.webhook_events.values())

    [account] = repo.accounts.values()
    assert account.last_webhook_at is not None

    listed = client.get("/api/whatsapp/messages", headers=headers(user, tenant.id)).json()
    assert listed[0]["wamid"] == "wamid.HBgM1"


def test_status_events(client, repo):
    tenant, user, _ = seed_account(repo)
    client.post(
        "/webhooks/whatsapp",
        content=signed(messages_payload())[0],
        headers=signed(messages_payload())[1],
    )
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": WABA_ID,
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "metadata": {"phone_number_id": PHONE_ID},
                            "statuses": [
                                {
                                    "id": "wamid.HBgM1",
                                    "status": "delivered",
                                    "timestamp": "1761235300",
                                    "recipient_id": "919876543210",
                                },
                                {
                                    "id": "wamid.HBgM1",
                                    "status": "read",
                                    "timestamp": "1761235400",
                                    "recipient_id": "919876543210",
                                },
                            ],
                        },
                    }
                ],
            }
        ],
    }
    body, hdrs = signed(payload)
    client.post("/webhooks/whatsapp", content=body, headers=hdrs)

    assert {s for (_, s) in repo.statuses} == {"delivered", "read"}
    listed = client.get("/api/whatsapp/messages", headers=headers(user, tenant.id)).json()
    assert listed[0]["latest_status"] == "read"


def test_unknown_waba_is_recorded_without_tenant(client, repo):
    seed_account(repo)
    body, hdrs = signed(messages_payload(waba_id="555"))

    assert client.post("/webhooks/whatsapp", content=body, headers=hdrs).status_code == 200
    [event] = repo.webhook_events.values()
    assert event["tenant_id"] is None
    assert repo.messages == {}


def test_partner_removed_disconnects(client, repo):
    seed_account(repo)
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": WABA_ID,
                "changes": [{"field": "account_update", "value": {"event": "PARTNER_REMOVED"}}],
            }
        ],
    }
    body, hdrs = signed(payload)
    client.post("/webhooks/whatsapp", content=body, headers=hdrs)

    [account] = repo.accounts.values()
    assert account.connection_status is ConnectionStatus.DISCONNECTED
    assert account.token_ciphertext is None


def test_account_restriction(client, repo):
    seed_account(repo)
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": WABA_ID,
                "changes": [
                    {
                        "field": "account_update",
                        "value": {
                            "event": "ACCOUNT_RESTRICTION",
                            "restriction_info": [
                                {"restriction_type": "RESTRICTED_ADD_PHONE_NUMBER"}
                            ],
                        },
                    }
                ],
            }
        ],
    }
    body, hdrs = signed(payload)
    client.post("/webhooks/whatsapp", content=body, headers=hdrs)

    [account] = repo.accounts.values()
    assert account.connection_status is ConnectionStatus.RESTRICTED
    assert account.last_error["event"] == "ACCOUNT_RESTRICTION"

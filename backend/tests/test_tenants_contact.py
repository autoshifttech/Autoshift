from uuid import uuid4

from tests.conftest import headers


def test_create_and_list_tenants(client):
    user = uuid4()
    created = client.post("/api/tenants", json={"name": " Acme "}, headers=headers(user))
    assert created.status_code == 201
    assert created.json()["name"] == "Acme"
    assert created.json()["role"] == "owner"

    listed = client.get("/api/tenants", headers=headers(user)).json()
    assert [t["id"] for t in listed] == [created.json()["id"]]
    assert client.get("/api/tenants", headers=headers(uuid4())).json() == []


def test_contact_request_is_stored(client, repo):
    response = client.post(
        "/api/contact",
        json={
            "name": "Priya",
            "email": "priya@example.com",
            "topic": "sales",
            "message": "We would like a demo for our team.",
        },
    )
    assert response.status_code == 202
    assert repo.contact_requests[0].email == "priya@example.com"


def test_contact_validation_and_honeypot(client, repo):
    invalid = client.post(
        "/api/contact",
        json={"name": "", "email": "nope", "topic": "other", "message": "short"},
    )
    assert invalid.status_code == 422

    spam = client.post(
        "/api/contact",
        json={
            "name": "Bot",
            "email": "bot@example.com",
            "topic": "support",
            "message": "Buy cheap followers now!!!",
            "website": "http://spam.example",
        },
    )
    assert spam.status_code == 202
    assert repo.contact_requests == []


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}

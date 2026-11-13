import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.deps import get_web_bridge


class FakeBridge:
    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []

    async def call(self, action, account_id, user_id, role, **fields):
        self.calls.append((action, account_id, fields))
        if action == "send":
            return {"message_id": "m1", "whatsapp_message_id": "wamid.1", "conversation_id": fields.get("conversation_id") or "c-new"}
        if action == "broadcast_create":
            return {"broadcast_id": "b-new", "status": "sending", "accepted": len(fields["recipients"])}
        return {"ok": True}


@pytest.fixture
def bridge(client):
    b = FakeBridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: b
    return b


def iso(delta=timedelta()):
    return (datetime.now(timezone.utc) + delta).isoformat()


def seed_chat(world, acct=None, phone="+919876543210", name="Asha", inbound_ago=timedelta(hours=1), texts=("Hi",)):
    acct = acct or world.acct_a
    contact = {"id": str(uuid.uuid4()), "account_id": acct, "phone": phone, "phone_normalized": phone.strip("+"), "name": name, "email": None, "company": None, "created_at": iso()}
    conv = {"id": str(uuid.uuid4()), "account_id": acct, "contact_id": contact["id"], "status": "open", "unread_count": 2, "last_message_text": texts[-1], "last_message_at": iso(), "last_inbound_at": iso(-inbound_ago) if inbound_ago is not None else None, "created_at": iso(), "first_inbound_at": iso(-timedelta(hours=2)), "last_reply_at": iso(-timedelta(hours=1, minutes=50))}
    world.store.setdefault("contacts", []).append(contact)
    world.store.setdefault("conversations", []).append(conv)
    for i, t in enumerate(texts):
        world.store.setdefault("messages", []).append({"id": str(uuid.uuid4()), "conversation_id": conv["id"], "sender_type": "customer", "content_type": "text", "content_text": t, "status": "delivered", "created_at": iso(timedelta(seconds=i - 100))})
    return contact, conv


def seed_template(world, name="order_update", status="APPROVED", header_type=None, acct=None):
    world.store.setdefault("message_templates", []).append({"id": str(uuid.uuid4()), "account_id": acct or world.acct_a, "name": name, "language": "en_US", "category": "Utility", "status": status, "header_type": header_type, "header_media_url": None, "body_text": "Hi {{1}}", "updated_at": iso()})


def test_whatsapp_status_hides_tokens(client, world):
    world.store["whatsapp_config"] = [{"id": "w", "account_id": world.acct_a, "status": "connected", "phone_number_id": "1", "waba_id": "2", "access_token": "SECRET"}]
    res = client.get("/v1/ws/whatsapp", headers=world.headers("viewer_a")).json()
    assert res["connected"] is True and "SECRET" not in str(res)
    assert client.get("/v1/ws/whatsapp", headers=world.headers("admin_b")).json()["connected"] is False


def test_conversations_list_get_and_update(client, world):
    contact, conv = seed_chat(world)
    seed_chat(world, acct=world.acct_b, phone="+911111111111")
    rows = client.get("/v1/ws/conversations", headers=world.headers("viewer_a")).json()
    assert [r["id"] for r in rows] == [conv["id"]] and rows[0]["contact"]["name"] == "Asha"
    one = client.get(f"/v1/ws/conversations/{conv['id']}", headers=world.headers("viewer_a")).json()
    assert one["can_send_free_text"] is True and one["messages"][0]["text"] == "Hi"
    assert client.get(f"/v1/ws/conversations/{conv['id']}", headers=world.headers("admin_b")).status_code == 404
    assert client.patch(f"/v1/ws/conversations/{conv['id']}", json={"status": "closed"}, headers=world.headers("viewer_a")).status_code == 403
    res = client.patch(f"/v1/ws/conversations/{conv['id']}", json={"status": "closed", "mark_read": True, "assigned_to": world.users["agent_a"]}, headers=world.headers("agent_a"))
    assert res.status_code == 200
    stored = next(c for c in world.store["conversations"] if c["id"] == conv["id"])
    assert stored["status"] == "closed" and stored["unread_count"] == 0 and stored["assigned_agent_id"] == world.users["agent_a"]
    assert client.patch(f"/v1/ws/conversations/{conv['id']}", json={"assigned_to": world.users["admin_b"]}, headers=world.headers("agent_a")).status_code == 422
    assert any(a["action"] == "conversation.update" for a in world.store["audit_log"])


def test_send_text_inside_window_goes_through_bridge(client, world, bridge):
    _, conv = seed_chat(world)
    res = client.post("/v1/ws/messages/send", json={"conversation_id": conv["id"], "text": "Your order is ready"}, headers=world.headers("agent_a"))
    assert res.status_code == 201, res.text
    action, acct, fields = bridge.calls[0]
    assert action == "send" and acct == world.acct_a and fields["type"] == "text"
    assert any(a["action"] == "message.send" for a in world.store["audit_log"])


def test_send_refuses_viewer_opted_out_blocked_and_closed_window(client, world, bridge):
    _, conv = seed_chat(world)
    assert client.post("/v1/ws/messages/send", json={"conversation_id": conv["id"], "text": "x"}, headers=world.headers("viewer_a")).status_code == 403
    _, stale = seed_chat(world, phone="+912222222222", inbound_ago=timedelta(days=3))
    res = client.post("/v1/ws/messages/send", json={"conversation_id": stale["id"], "text": "x"}, headers=world.headers("agent_a"))
    assert res.status_code == 409 and "24-hour" in res.json()["detail"]
    _, stopped = seed_chat(world, phone="+913333333333", texts=("Hi", "STOP"))
    seed_template(world)
    res = client.post("/v1/ws/messages/send", json={"conversation_id": stopped["id"], "template": {"name": "order_update", "body_params": ["A"]}}, headers=world.headers("agent_a"))
    assert res.status_code == 409 and "opted out" in res.json()["detail"]
    _, restarted = seed_chat(world, phone="+914444444444", texts=("STOP", "START"))
    assert client.post("/v1/ws/messages/send", json={"conversation_id": restarted["id"], "text": "welcome back"}, headers=world.headers("agent_a")).status_code == 201
    blocked, bconv = seed_chat(world, phone="+915555555555")
    assert client.post("/v1/ws/blocklist", json={"contact_id": blocked["id"]}, headers=world.headers("agent_a")).status_code == 403
    assert client.post("/v1/ws/blocklist", json={"contact_id": blocked["id"]}, headers=world.headers("admin_a")).status_code == 200
    res = client.post("/v1/ws/messages/send", json={"conversation_id": bconv["id"], "text": "x"}, headers=world.headers("agent_a"))
    assert res.status_code == 409 and "blocklist" in res.json()["detail"]
    assert [c[0] for c in bridge.calls] == ["send"]  # only the restarted contact got a message


def test_template_checks_and_header_media(client, world, bridge):
    seed_template(world, "promo_img", header_type="image")
    seed_template(world, "pending_one", status="PENDING")
    base = {"to": "+916666666666"}
    assert client.post("/v1/ws/messages/send", json={**base, "template": {"name": "missing"}}, headers=world.headers("agent_a")).status_code == 404
    assert client.post("/v1/ws/messages/send", json={**base, "template": {"name": "pending_one"}}, headers=world.headers("agent_a")).status_code == 409
    assert client.post("/v1/ws/messages/send", json={**base, "template": {"name": "promo_img"}}, headers=world.headers("agent_a")).status_code == 422
    assert client.post("/v1/ws/messages/send", json={**base, "template": {"name": "promo_img", "header_media_url": "http://x/a.png"}}, headers=world.headers("agent_a")).status_code == 422
    check = client.post("/v1/ws/messages/check", json={**base, "template": {"name": "promo_img", "header_media_url": "https://x/a.png"}}, headers=world.headers("agent_a")).json()
    assert check["can_send"] is True and check["to"]["new_contact"] is True and not bridge.calls
    res = client.post("/v1/ws/messages/send", json={**base, "template": {"name": "promo_img", "header_media_url": "https://x/a.png", "body_params": ["Asha"]}}, headers=world.headers("agent_a"))
    assert res.status_code == 201
    fields = bridge.calls[0][2]
    assert fields["template"]["params"] == {"body": ["Asha"], "headerMediaUrl": "https://x/a.png"}


def test_template_create_and_sync_need_admin(client, world, bridge):
    body = {"name": "order_ready", "category": "Utility", "body_text": "Hi {{1}}, ready", "body_samples": ["Asha"]}
    assert client.post("/v1/ws/templates", json=body, headers=world.headers("agent_a")).status_code == 403
    assert client.post("/v1/ws/templates", json={**body, "name": "Bad Name"}, headers=world.headers("admin_a")).status_code == 422
    assert client.post("/v1/ws/templates", json=body, headers=world.headers("admin_a")).status_code == 201
    assert client.post("/v1/ws/templates/sync", headers=world.headers("admin_a")).status_code == 200
    assert [c[0] for c in bridge.calls] == ["templates_submit", "templates_sync"]
    assert bridge.calls[0][2]["template"]["sample_values"] == {"body": ["Asha"]}


def test_contacts_crud_and_tags(client, world):
    res = client.post("/v1/ws/contacts", json={"phone": "+91 98765-00000", "name": "Ravi", "tags": ["VIP"]}, headers=world.headers("agent_a"))
    assert res.status_code == 201 and res.json()["tags"] == ["VIP"]
    cid = res.json()["id"]
    assert client.post("/v1/ws/contacts", json={"phone": "+919876500000"}, headers=world.headers("agent_a")).status_code == 409
    assert client.post("/v1/ws/contacts", json={"phone": "+919876500000"}, headers=world.headers("viewer_a")).status_code == 403
    assert [c["id"] for c in client.get("/v1/ws/contacts?q=rav", headers=world.headers("viewer_a")).json()] == [cid]
    assert [c["id"] for c in client.get("/v1/ws/contacts?q=98765", headers=world.headers("viewer_a")).json()] == [cid]
    assert client.get("/v1/ws/contacts?q=rav", headers=world.headers("admin_b")).json() == []
    upd = client.patch(f"/v1/ws/contacts/{cid}", json={"email": "r@x.in", "add_tags": ["Paid"], "remove_tags": ["VIP"]}, headers=world.headers("agent_a")).json()
    assert upd["email"] == "r@x.in" and upd["tags"] == ["Paid"]
    assert [c["id"] for c in client.get("/v1/ws/contacts?tag=paid", headers=world.headers("viewer_a")).json()] == [cid]
    segs = {s["tag"]: s["people"] for s in client.get("/v1/ws/segments", headers=world.headers("viewer_a")).json()}
    assert segs == {"VIP": 0, "Paid": 1}
    assert client.delete(f"/v1/ws/contacts/{cid}", headers=world.headers("agent_a")).status_code == 403
    assert client.delete(f"/v1/ws/contacts/{cid}", headers=world.headers("admin_b")).status_code == 404
    assert client.delete(f"/v1/ws/contacts/{cid}", headers=world.headers("admin_a")).status_code == 204
    assert not any(c["id"] == cid for c in world.store["contacts"])


def test_optouts_list(client, world):
    stopped, _ = seed_chat(world, phone="+917777777777", texts=("Hi", "stop"))
    seed_chat(world, phone="+918888888888", texts=("STOP", "start"))
    seed_chat(world, acct=world.acct_b, phone="+919999999999", texts=("STOP",))
    rows = client.get("/v1/ws/optouts", headers=world.headers("viewer_a")).json()
    assert [r["id"] for r in rows] == [stopped["id"]] and rows[0]["opted_out"] is True


def test_leads_list_and_stage_change(client, world):
    contact, _ = seed_chat(world)
    world.store["pipelines"] = [{"id": "p1", "account_id": world.acct_a, "name": "Sales"}]
    world.store["pipeline_stages"] = [{"id": "s1", "pipeline_id": "p1", "name": "New", "position": 0}, {"id": "s2", "pipeline_id": "p1", "name": "Qualified", "position": 1}]
    world.store["deals"] = [{"id": "d1", "account_id": world.acct_a, "pipeline_id": "p1", "stage_id": "s1", "contact_id": contact["id"], "title": "Saree order", "status": "open", "value": 5000, "updated_at": iso(), "created_at": iso()}]
    rows = client.get("/v1/ws/leads", headers=world.headers("viewer_a")).json()
    assert rows[0]["stage"] == "New" and rows[0]["contact"]["name"] == "Asha"
    res = client.patch("/v1/ws/leads/d1", json={"stage": "nope"}, headers=world.headers("agent_a"))
    assert res.status_code == 422 and "Qualified" in res.json()["detail"]
    assert client.patch("/v1/ws/leads/d1", json={"stage": "qualified", "status": "won"}, headers=world.headers("agent_a")).status_code == 200
    assert world.store["deals"][0]["stage_id"] == "s2" and world.store["deals"][0]["closed_at"]
    assert client.patch("/v1/ws/leads/d1", json={"status": "lost"}, headers=world.headers("admin_b")).status_code == 404
    ins = client.get("/v1/ws/insights?days=7", headers=world.headers("viewer_a")).json()
    assert ins["leads"]["won"] == 1 and ins["new_conversations"] == 1 and ins["median_first_reply_minutes"] == 10.0


def test_broadcast_skips_opted_out_and_cancel(client, world, bridge):
    seed_template(world)
    a, _ = seed_chat(world, phone="+910000000001")
    b, _ = seed_chat(world, phone="+910000000002", texts=("STOP",))
    client.patch(f"/v1/ws/contacts/{a['id']}", json={"add_tags": ["Diwali"]}, headers=world.headers("agent_a"))
    client.patch(f"/v1/ws/contacts/{b['id']}", json={"add_tags": ["Diwali"]}, headers=world.headers("agent_a"))
    body = {"template_name": "order_update", "tag": "Diwali", "params": ["friend"]}
    check = client.post("/v1/ws/broadcasts/check", json=body, headers=world.headers("agent_a")).json()
    assert check["will_send_to"] == 1 and check["skipped_opted_out_or_blocked"] == 1 and not bridge.calls
    res = client.post("/v1/ws/broadcasts", json=body, headers=world.headers("agent_a"))
    assert res.status_code == 202 and bridge.calls[0][2]["recipients"] == [{"to": "+910000000001", "params": ["friend"]}]
    assert client.post("/v1/ws/broadcasts", json=body, headers=world.headers("viewer_a")).status_code == 403
    world.store["broadcasts"] = [{"id": "bx", "account_id": world.acct_a, "status": "scheduled", "name": "x"}, {"id": "by", "account_id": world.acct_a, "status": "sent", "name": "y"}]
    world.store["broadcast_recipients"] = [{"id": "r1", "broadcast_id": "bx", "status": "pending"}]
    assert client.post("/v1/ws/broadcasts/by/cancel", headers=world.headers("agent_a")).status_code == 409
    assert client.post("/v1/ws/broadcasts/bx/cancel", headers=world.headers("admin_b")).status_code == 404
    assert client.post("/v1/ws/broadcasts/bx/cancel", headers=world.headers("agent_a")).status_code == 200
    assert world.store["broadcast_recipients"][0]["error_message"] == "Cancelled"
    got = client.get("/v1/ws/broadcasts/bx", headers=world.headers("viewer_a")).json()
    assert got["recipients_by_status"] == {"failed": 1}


def test_automation_and_flow_toggles(client, world):
    world.store["automations"] = [{"id": "a1", "account_id": world.acct_a, "name": "Welcome", "is_active": False, "updated_at": iso()}]
    world.store["flows"] = [{"id": "f1", "account_id": world.acct_a, "name": "Menu", "status": "draft", "entry_node_id": None, "updated_at": iso()}, {"id": "f2", "account_id": world.acct_a, "name": "Book", "status": "draft", "entry_node_id": "n1", "updated_at": iso()}]
    assert client.patch("/v1/ws/automations/a1", json={"active": True}, headers=world.headers("agent_a")).status_code == 403
    assert client.patch("/v1/ws/automations/a1", json={"active": True}, headers=world.headers("admin_b")).status_code == 404
    assert client.patch("/v1/ws/automations/a1", json={"active": True}, headers=world.headers("admin_a")).status_code == 200
    assert world.store["automations"][0]["is_active"] is True
    assert client.patch("/v1/ws/flows/f1", json={"active": True}, headers=world.headers("admin_a")).status_code == 409
    assert client.patch("/v1/ws/flows/f2", json={"active": True}, headers=world.headers("admin_a")).json()["status"] == "active"
    assert len(client.get("/v1/ws/flows", headers=world.headers("viewer_a")).json()) == 2


def test_knowledge_add_and_list(client, world, bridge):
    world.store["ai_knowledge_documents"] = [{"id": "k1", "account_id": world.acct_a, "title": "Hours", "content": "9 to 6", "updated_at": iso()}]
    assert client.get("/v1/ws/knowledge", headers=world.headers("viewer_a")).json()[0]["title"] == "Hours"
    assert client.get("/v1/ws/knowledge", headers=world.headers("admin_b")).json() == []
    assert client.post("/v1/ws/knowledge", json={"title": "Returns", "content": "7 days"}, headers=world.headers("agent_a")).status_code == 403
    assert client.post("/v1/ws/knowledge", json={"title": "Returns", "content": "7 days"}, headers=world.headers("admin_a")).status_code == 201
    assert bridge.calls[0][0] == "knowledge_add"


def test_broadcast_delete(client, world):
    world.store["broadcasts"] = [{"id": "b1", "account_id": world.acct_a, "status": "sent", "name": "x"}, {"id": "b2", "account_id": world.acct_a, "status": "sending", "name": "y"}]
    world.store["broadcast_recipients"] = [{"id": "r1", "broadcast_id": "b1", "status": "sent"}]
    assert client.delete("/v1/ws/broadcasts/b1", headers=world.headers("agent_a")).status_code == 403
    assert client.delete("/v1/ws/broadcasts/b1", headers=world.headers("admin_b")).status_code == 404
    assert client.delete("/v1/ws/broadcasts/b2", headers=world.headers("admin_a")).status_code == 409
    assert client.delete("/v1/ws/broadcasts/b1", headers=world.headers("admin_a")).status_code == 204
    assert [b["id"] for b in world.store["broadcasts"]] == ["b2"] and world.store["broadcast_recipients"] == []
    assert any(a["action"] == "broadcast.delete" for a in world.store["audit_log"])

import uuid

from .test_workspace_ops import bridge, iso, seed_chat  # noqa: F401  (bridge is a fixture)


def test_alerts_search_and_notifications(client, world):
    _, conv = seed_chat(world, texts=("Do you deliver to Pune?", "STOP"))
    h = world.headers("viewer_a")
    alerts = client.get("/v1/ws/usage-alerts", headers=h).json()
    whats = {a["what"] for a in alerts["alerts"]}
    assert {"wallet_low", "whatsapp_not_connected", "unread_chats"} <= whats
    found = client.get("/v1/ws/messages/search?q=pune", headers=h).json()
    assert found["_note"] and len(found["results"]) == 1 and found["results"][0]["contact"]["name"] == "Asha"
    seed_chat(world, acct=world.acct_b, phone="+911111111111", texts=("Pune too",))
    assert len(client.get("/v1/ws/messages/search?q=pune", headers=h).json()["results"]) == 1
    world.store["notifications"] = [{"id": "n1", "account_id": world.acct_a, "user_id": world.users["viewer_a"], "type": "conversation_assigned", "title": "Chat assigned", "read_at": None, "created_at": iso()}, {"id": "n2", "account_id": world.acct_a, "user_id": world.users["agent_a"], "type": "conversation_assigned", "title": "Not yours", "read_at": None, "created_at": iso()}]
    assert [n["id"] for n in client.get("/v1/ws/notifications?unread_only=true", headers=h).json()] == ["n1"]


def test_import_export_notes_and_opt_in(client, world):
    seed_chat(world, phone="+919000000001")
    agent, admin = world.headers("agent_a"), world.headers("admin_a")
    body = {"contacts": [{"phone": "+91 90000 00001", "name": "Old"}, {"phone": "+919000000002", "name": "New", "tags": ["VIP"]}, {"phone": "12"}], "tag_all": "Expo"}
    dry = client.post("/v1/ws/contacts/import", json={**body, "dry_run": True}, headers=agent).json()
    assert dry["new"] == 1 and dry["already_there"] == 1 and dry["invalid_count"] == 1
    assert client.post("/v1/ws/contacts/import", json=body, headers=world.headers("viewer_a")).status_code == 403
    assert client.post("/v1/ws/contacts/import", json=body, headers=agent).json()["done"]
    assert client.get("/v1/ws/contacts/export", headers=agent).status_code == 403
    out = client.get("/v1/ws/contacts/export?tag=Expo", headers=admin).json()
    assert out["rows"] == 1 and "New" in out["csv"] and "VIP;Expo" in out["csv"]
    new = next(c for c in world.store["contacts"] if c.get("name") == "New")
    client.post(f"/v1/ws/contacts/{new['id']}/notes", json={"text": "Wants a quote"}, headers=agent)
    assert client.get(f"/v1/ws/contacts/{new['id']}/notes", headers=world.headers("viewer_a")).json()[0]["text"] == "Wants a quote"
    assert client.get(f"/v1/ws/contacts/{new['id']}/notes", headers=world.headers("admin_b")).status_code == 404
    res = client.post(f"/v1/ws/contacts/{new['id']}/opt-in", json={"source": "website", "proof": "Ticked the box on the form"}, headers=agent).json()
    assert res["ok"] and res["still_opted_out"] is False
    stopped, _ = seed_chat(world, phone="+919000000003", texts=("STOP",))
    assert client.post(f"/v1/ws/contacts/{stopped['id']}/opt-in", json={"proof": "Said yes on the phone"}, headers=agent).json()["still_opted_out"] is True


def test_tags_pipelines_and_leads(client, world):
    agent, admin = world.headers("agent_a"), world.headers("admin_a")
    made = client.post("/v1/ws/tags", json={"name": "Diwali"}, headers=agent).json()
    assert client.post("/v1/ws/tags", json={"name": "diwali"}, headers=agent).status_code == 409
    assert client.patch(f"/v1/ws/tags/{made['id']}", json={"name": "Diwali 2026", "color": "#1E4C41"}, headers=admin).json()["name"] == "Diwali 2026"
    blocked = client.post("/v1/ws/tags", json={"name": "Blocked"}, headers=agent).json()
    assert client.delete(f"/v1/ws/tags/{blocked['id']}", headers=admin).status_code == 409
    assert client.delete(f"/v1/ws/tags/{made['id']}", headers=admin).status_code == 204
    assert client.post("/v1/ws/leads", json={"title": "x", "phone": "+919000000009"}, headers=agent).status_code == 409
    world.store["pipelines"] = [{"id": "p1", "account_id": world.acct_a, "name": "Sales", "created_at": iso()}]
    world.store["pipeline_stages"] = [{"id": "s2", "pipeline_id": "p1", "name": "Quoted", "position": 1}, {"id": "s1", "pipeline_id": "p1", "name": "New", "position": 0}]
    lead = client.post("/v1/ws/leads", json={"title": "Wedding order", "phone": "+919000000009", "name": "Ravi", "value": 5000}, headers=agent).json()
    assert lead["stage"] == "New" and lead["contact"]["name"] == "Ravi"
    assert client.post("/v1/ws/leads", json={"title": "x", "phone": "+919000000009", "stage": "Nope"}, headers=agent).status_code == 422
    pipes = client.get("/v1/ws/pipelines", headers=world.headers("viewer_a")).json()
    assert [s["name"] for s in pipes[0]["stages"]] == ["New", "Quoted"] and pipes[0]["stages"][0]["open_leads"] == 1


def test_history_quick_replies_knowledge_profile_activity_hooks(client, world, bridge):
    v, admin = world.headers("viewer_a"), world.headers("admin_a")
    world.store["automations"] = [{"id": "a1", "account_id": world.acct_a, "name": "Welcome"}]
    world.store["automation_logs"] = [{"id": "l1", "account_id": world.acct_a, "automation_id": "a1", "trigger_event": "new_message", "status": "failed", "error_message": "No template", "steps_executed": [], "created_at": iso()}]
    world.store["flows"] = [{"id": "f1", "account_id": world.acct_a, "name": "Menu"}]
    world.store["flow_runs"] = [{"id": "r1", "account_id": world.acct_a, "flow_id": "f1", "status": "handed_off", "started_at": iso()}]
    assert client.get("/v1/ws/automations/logs?status=failed", headers=v).json()[0]["automation"] == "Welcome"
    assert client.get("/v1/ws/flows/runs", headers=v).json()[0]["flow"] == "Menu"
    assert client.post("/v1/ws/quick-replies", json={"title": "Hours", "text": "9 to 6"}, headers=world.headers("agent_a")).status_code == 403
    qr = client.post("/v1/ws/quick-replies", json={"title": "Hours", "text": "9 to 6"}, headers=admin).json()
    client.patch(f"/v1/ws/quick-replies/{qr['id']}", json={"title": "Hours", "text": "9 to 7"}, headers=admin)
    assert client.get("/v1/ws/quick-replies", headers=v).json()[0]["text"] == "9 to 7"
    world.store["ai_knowledge_documents"] = [{"id": "d1", "account_id": world.acct_a, "title": "FAQ", "content": "..."}]
    client.patch("/v1/ws/knowledge/d1", json={"content": "New text"}, headers=admin)
    client.delete("/v1/ws/knowledge/d1", headers=admin)
    assert client.delete("/v1/ws/knowledge/zz", headers=admin).status_code == 404
    client.get("/v1/ws/whatsapp/profile", headers=v)
    assert client.patch("/v1/ws/whatsapp/profile", json={"websites": ["ftp://x"]}, headers=admin).status_code == 422
    client.patch("/v1/ws/whatsapp/profile", json={"about": "Fresh cakes daily"}, headers=admin)
    assert [c[0] for c in bridge.calls] == ["knowledge_update", "knowledge_delete", "whatsapp_profile_get", "whatsapp_profile_update"]
    for row in world.store["audit_log"]:
        row["created_at"] = iso()
    act = client.get("/v1/ws/team/activity", headers=admin).json()
    assert any(e["action"] == "quick_reply.update" for e in act["events"]) and act["by_person"]
    assert client.get("/v1/ws/team/activity", headers=world.headers("agent_a")).status_code == 403
    world.store["webhook_subscriptions"] = [{"id": "h1", "account_id": world.acct_a, "url": "https://example.com/h", "events": ["*"], "enabled": True, "label": ""}]
    assert client.patch("/v1/hooks/h1", json={"enabled": False}, headers=admin).json()["enabled"] is False
    assert client.patch("/v1/hooks/h1", json={"events": ["nope"]}, headers=admin).status_code == 422
    assert client.patch("/v1/hooks/h1", json={"enabled": True}, headers=world.headers("admin_b")).status_code == 404

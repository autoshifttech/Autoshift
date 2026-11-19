from app import wa_templates
from app.deps import get_web_bridge


class Bridge:
    def __init__(self):
        self.calls = []

    async def call(self, action, account_id, user_id, role, **fields):
        self.calls.append((action, fields))
        return {"ok": True}


def test_template_bodies_follow_meta_rules():
    for kind in wa_templates.KINDS:
        for lang, body in wa_templates.BODIES[kind].items():
            assert not body.startswith("{{") and not body.rstrip(".").endswith("}}"), (kind, lang)
            assert [i for i in ("{{1}}", "{{2}}", "{{3}}") if i in body] == ["{{1}}", "{{2}}", "{{3}}"]
    assert wa_templates.clean_param("a\nb\t\tc     d") == "a b c d" and wa_templates.clean_param("") == "-"


def test_one_click_submit_and_status(client, world):
    bridge = Bridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    assert client.get("/v1/system-templates", headers=world.headers("agent_a")).json()["order"]["status"] == "NONE"
    assert client.post("/v1/system-templates/order", json={"language": "pt"}, headers=world.headers("agent_a")).status_code == 403
    client.post("/v1/system-templates/order", json={"language": "pt"}, headers=world.headers("admin_a"))
    action, fields = bridge.calls[-1]
    assert action == "templates_submit" and fields["template"]["name"] == "autoshift_order_update"
    assert fields["template"]["language"] == "pt_BR" and fields["template"]["category"] == "Utility" and len(fields["template"]["sample_values"]["body"]) == 3
    world.rows("message_templates").append({"account_id": world.acct_a, "name": "autoshift_order_update", "language": "pt_BR", "status": "PENDING"})
    out = client.post("/v1/system-templates/order", json={"language": "pt"}, headers=world.headers("admin_a")).json()
    assert out["order"]["status"] == "PENDING" and len(bridge.calls) == 1  # not submitted twice
    client.post("/v1/system-templates/refresh", headers=world.headers("admin_a"))
    assert bridge.calls[-1][0] == "templates_sync"

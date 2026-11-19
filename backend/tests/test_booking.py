import json
from datetime import datetime, timedelta, timezone

import pytest

from app import booking, wallet
from app.config import get_settings
from app.deps import get_web_bridge
from app.routers.appointments import send_reminders
from app.security import encrypt

SECRET = "internal-shared-secret-123"
IST = booking.zone("Asia/Kolkata")
EVERY_DAY = {d: [["09:00", "18:00"]] for d in booking.DAYS}


def tomorrow_at(h: int, m: int = 0) -> datetime:
    d = (datetime.now(timezone.utc).astimezone(IST) + timedelta(days=1)).date()
    return datetime(d.year, d.month, d.day, h, m, tzinfo=IST)


class Bridge:
    def __init__(self):
        self.calls = []

    async def call(self, action, account_id, user_id, role, **fields):
        self.calls.append((action, fields))
        return {"ok": True}


def test_free_slots_respect_hours_bookings_and_notice():
    s = booking.settings_from({"hours": {d: [["09:00", "11:00"]] for d in booking.DAYS}, "slot_minutes": 30, "min_notice_minutes": 0})
    now = tomorrow_at(0).astimezone(timezone.utc)
    taken = [{"status": "booked", "starts_at": tomorrow_at(9, 30).isoformat(), "ends_at": tomorrow_at(10).isoformat()}]
    day = [x for x in booking.free_slots(s, taken, now, 30, days=1)]
    assert [f"{x:%H:%M}" for x in day] == ["09:00", "10:00", "10:30"]
    assert [f"{x:%H:%M}" for x in booking.free_slots(s, taken, now, 60, days=1)] == ["10:00"]  # an hour needs both halves free
    two = booking.settings_from({**s, "per_slot": 2})
    assert "09:30" in [f"{x:%H:%M}" for x in booking.free_slots(two, taken, now, 30, days=1)]


def test_when_text_in_each_language():
    dt = datetime(2026, 11, 24, 10, 30, tzinfo=IST)
    assert booking.when_text(dt, "en") == "Tue 24 Nov at 10:30 AM"
    assert booking.when_text(dt, "pt") == "ter 24 nov às 10:30"
    assert "11월 24일" in booking.when_text(dt, "ko")


@pytest.fixture
async def clinic(client, world, settings, llm):
    s = settings.model_copy(update={"internal_secret": SECRET})
    client.app.dependency_overrides[get_settings] = lambda: s
    bridge = Bridge()
    client.app.dependency_overrides[get_web_bridge] = lambda: bridge
    for a in world.rows("accounts"):
        if a["id"] == world.acct_a:
            a["owner_user_id"] = world.users["owner_a"]
    world.rows("pipelines").append({"id": "pl_b", "account_id": world.acct_a, "name": "Bookings"})
    world.rows("pipeline_stages").extend([{"id": "st_req", "pipeline_id": "pl_b", "name": "Requested"}, {"id": "st_conf", "pipeline_id": "pl_b", "name": "Confirmed"}, {"id": "st_vis", "pipeline_id": "pl_b", "name": "Visited"}])
    body = {"services": [{"name": "Consultation", "minutes": 30, "price": 500}, {"name": "Full check-up", "minutes": 60, "price": 1500}], "hours": EVERY_DAY, "min_notice_minutes": 60}
    assert client.put("/v1/appointments/settings", json=body, headers=world.headers("admin_a")).status_code == 200
    p = next(p for p in world.rows("platform_ai_providers") if p["vendor"] == "openai")
    p.update(enabled=True, key_ciphertext=encrypt("sk-1234", s), key_tail="1234")
    await wallet.apply(world.service, world.acct_a, 5000, "topup", "t", "fund-clinic")
    aid = client.post("/v1/assistants", json={"name": "Clinic", "provider": "openai", "model_id": "gpt-5.5", "enabled": True, "booking": {"enabled": True}}, headers=world.headers("admin_a")).json()["id"]
    return {"aid": aid, "bridge": bridge, "llm": llm}


def ask(client, world, clinic, ref, message="yes"):
    body = {"account_id": world.acct_a, "assistant_id": clinic["aid"], "message": message, "ref": ref, "conversation_id": "conv_1", "contact_id": "contact_1", "customer_phone": "+91 98765 43210"}
    return client.post("/v1/internal/ai-reply", json=body, headers={"X-AutoShift-Internal": SECRET}).json()


def book_line(start: datetime, service="Consultation", name="Asha Rao"):
    return "Done!\n[BOOK]" + json.dumps({"service": service, "start": f"{start:%Y-%m-%d %H:%M}", "name": name, "note": ""})


async def test_the_assistant_sees_services_and_free_times(client, world, clinic):
    clinic["llm"].answer = "Which day suits you?"
    out = ask(client, world, clinic, "wamid.b0", "I want an appointment")
    system = clinic["llm"].calls[-1]["system"]
    assert out["status"] == "reply" and "[BOOK]" in system and "Consultation (30 min, ₹500" in system and "Free start times" in system


async def test_the_ai_books_a_free_slot_and_refuses_a_taken_one(client, world, clinic):
    start = tomorrow_at(10, 30)
    clinic["llm"].answer = book_line(start)
    out = ask(client, world, clinic, "wamid.b1")
    assert out["appointment"]["number"] == 1 and "✅ Booked: Consultation" in out["text"] and "[BOOK]" not in out["text"]
    appt = world.rows("appointments")[0]
    assert appt["customer_name"] == "Asha Rao" and appt["price_paise"] == 50000 and appt["customer_phone"] == "+919876543210"
    assert next(d for d in world.rows("deals") if d["id"] == appt["lead_id"])["stage_id"] == "st_conf"
    clinic["llm"].answer = book_line(start, name="Ravi")
    again = ask(client, world, clinic, "wamid.b2")
    assert again["appointment"] is None and "isn't available any more" in again["text"] and "Free times:" in again["text"]
    clinic["llm"].answer = book_line(tomorrow_at(20))  # after closing time
    assert ask(client, world, clinic, "wamid.b3")["appointment"] is None
    clinic["llm"].answer = book_line(tomorrow_at(11), service="Massage")
    assert "service, time and name" in ask(client, world, clinic, "wamid.b4")["text"]


async def test_staff_add_cancel_and_complete(client, world, clinic):
    h = world.headers("agent_a")
    r = client.post("/v1/appointments", json={"service": "Full check-up", "start": f"{tomorrow_at(14):%Y-%m-%d %H:%M}", "name": "Walk-in", "phone": "98765"}, headers=h)
    assert r.status_code == 201 and r.json()["source"] == "manual" and r.json()["minutes"] == 60
    assert client.post("/v1/appointments", json={"service": "Consultation", "start": f"{tomorrow_at(14, 30):%Y-%m-%d %H:%M}", "name": "X"}, headers=h).status_code == 409
    slots = client.get("/v1/appointments/slots?service=Consultation&days=2", headers=h).json()
    assert f"{tomorrow_at(14):%Y-%m-%d %H:%M}" not in slots and f"{tomorrow_at(15):%Y-%m-%d %H:%M}" in slots
    clinic["llm"].answer = book_line(tomorrow_at(10))
    ask(client, world, clinic, "wamid.b5")
    ai_appt = next(a for a in world.rows("appointments") if a["source"] == "ai")
    world.rows("messages").append({"id": "m1", "conversation_id": "conv_1", "sender_type": "customer", "content_text": "hi", "created_at": datetime.now(timezone.utc).isoformat()})
    out = client.patch(f"/v1/appointments/{ai_appt['id']}", json={"action": "cancelled"}, headers=h).json()
    assert out["notified"] is True and "has been cancelled" in clinic["bridge"].calls[-1][1]["text"]
    assert client.patch(f"/v1/appointments/{ai_appt['id']}", json={"action": "completed"}, headers=h).status_code == 409
    listed = client.get("/v1/appointments", headers=h).json()
    assert [a["status"] for a in listed] == ["cancelled", "booked"]


async def test_reminders_go_a_day_before_as_text_or_template(client, world, clinic):
    soon = datetime.now(timezone.utc) + timedelta(hours=20)
    base = {"account_id": world.acct_a, "service": "Consultation", "minutes": 30, "status": "booked", "customer_name": "Asha", "conversation_id": "conv_1", "reminded_at": None}
    world.rows("appointments").extend([
        {**base, "id": "a1", "number": 1, "starts_at": soon.isoformat(), "ends_at": (soon + timedelta(minutes=30)).isoformat()},
        {**base, "id": "a2", "number": 2, "starts_at": (soon + timedelta(days=3)).isoformat(), "ends_at": (soon + timedelta(days=3, minutes=30)).isoformat()},
    ])
    # window closed and no template: not sent, the reason is kept
    assert await send_reminders(world.service, clinic["bridge"]) == 0
    a1 = next(a for a in world.rows("appointments") if a["id"] == "a1")
    assert a1["reminded_at"] and "no reminder template is chosen" in a1["reminder_error"]
    assert next(a for a in world.rows("appointments") if a["id"] == "a2")["reminded_at"] is None
    # with the approved template it goes out
    a1["reminded_at"] = None
    world.rows("message_templates").append({"account_id": world.acct_a, "name": "autoshift_appointment_reminder", "language": "en", "status": "APPROVED"})
    assert await send_reminders(world.service, clinic["bridge"]) == 1
    action, fields = clinic["bridge"].calls[-1]
    assert fields["type"] == "template" and fields["template"]["params"][:2] == ["Asha", "Consultation"]


async def test_switched_off_appointments_block_the_api_and_the_ai(client, world, clinic):
    next(a for a in world.rows("accounts") if a["id"] == world.acct_a)["pages"] = ["leads"]
    assert client.get("/v1/appointments", headers=world.headers("agent_a")).status_code == 403
    clinic["llm"].answer = book_line(tomorrow_at(10))
    out = ask(client, world, clinic, "wamid.b6")
    assert out.get("appointment") is None and not world.rows("appointments")



async def test_reminders_use_the_business_own_template(client, world, clinic):
    soon = datetime.now(timezone.utc) + timedelta(hours=20)
    world.rows("appointments").append({"account_id": world.acct_a, "id": "r1", "number": 7, "service": "Consultation", "minutes": 30, "status": "booked", "customer_name": "Asha",
                                       "conversation_id": "conv_1", "reminded_at": None, "starts_at": soon.isoformat(), "ends_at": (soon + timedelta(minutes=30)).isoformat()})
    h = world.headers("owner_a")
    current = client.get("/v1/appointments/settings", headers=h).json()
    tpl = {"name": "visit_reminder", "language": "en_US", "vars": ["customer_name", "service", "date", "time"]}
    assert client.put("/v1/appointments/settings", json={**current, "reminder_template": {**tpl, "vars": ["nope"]}}, headers=h).status_code == 422
    saved = client.put("/v1/appointments/settings", json={**current, "reminder_template": tpl}, headers=h)
    assert saved.status_code == 200 and saved.json()["reminder_template"]["name"] == "visit_reminder"
    world.rows("message_templates").append({"account_id": world.acct_a, "name": "visit_reminder", "language": "en_US", "status": "Approved"})
    assert await send_reminders(world.service, clinic["bridge"]) == 1
    _, fields = clinic["bridge"].calls[-1]
    assert fields["template"]["name"] == "visit_reminder" and fields["template"]["params"][:2] == ["Asha", "Consultation"]
    date, time = fields["template"]["params"][2:]
    assert " " in date and (time.endswith("AM") or time.endswith("PM"))

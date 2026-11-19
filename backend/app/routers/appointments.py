"""Appointments page: bookings (AI or by hand), their status, and the business's booking settings."""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .. import audit, booking, events, wa_templates
from ..deps import AdminMember, AgentMember, Bridge, Member, ServiceDb

router = APIRouter(prefix="/v1/appointments", tags=["appointments"])


class Service(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    minutes: int = Field(30, ge=5, le=480)
    price: float = Field(0, ge=0, le=1_000_000)


class ReminderTemplate(BaseModel):
    """The business's own approved WhatsApp template for reminders after the 24-hour window."""
    name: str = Field(min_length=1, max_length=512, pattern=r"^[a-z0-9_]+$")
    language: str = Field("en", min_length=2, max_length=10)
    # vars[0] fills {{1}}, vars[1] fills {{2}} …
    vars: list[Literal["customer_name", "service", "when", "date", "time", "number"]] = Field(default_factory=list, max_length=10)


class SettingsBody(BaseModel):
    services: list[Service] = Field(default_factory=list, max_length=50)
    hours: dict[str, list[list[str]]] = Field(default_factory=dict)
    timezone: str = Field("Asia/Kolkata", max_length=60)
    slot_minutes: int = Field(30, ge=5, le=240)
    per_slot: int = Field(1, ge=1, le=50)
    days_ahead: int = Field(14, ge=1, le=60)
    min_notice_minutes: int = Field(60, ge=0, le=10080)
    reminders: bool = True
    language: Literal["en", "pt", "es", "ko"] = "en"
    reminder_template: ReminderTemplate | None = None


class ManualBooking(BaseModel):
    service: str = Field(min_length=1, max_length=80)
    start: str = Field(min_length=16, max_length=19, description="YYYY-MM-DD HH:MM in the business's time zone")
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field("", max_length=32)
    note: str = Field("", max_length=300)


class AppointmentAction(BaseModel):
    action: Literal["completed", "no_show", "cancelled"]
    notify: bool = True


def _check_hours(hours: dict[str, list[list[str]]]) -> dict[str, list[list[str]]]:
    out: dict[str, list[list[str]]] = {}
    for day, windows in hours.items():
        if day not in booking.DAYS:
            raise HTTPException(422, f"Unknown day: {day}")
        clean = []
        for w in windows[:4]:
            try:
                a, b = booking._minutes(w[0]), booking._minutes(w[1])
            except (ValueError, IndexError, TypeError) as exc:
                raise HTTPException(422, f"Times must look like 09:00 ({day})") from exc
            if not 0 <= a < b <= 24 * 60:
                raise HTTPException(422, f"Closing time must be after opening time ({day})")
            clean.append([w[0][:5], w[1][:5]])
        out[day] = clean
    return {d: out.get(d, []) for d in booking.DAYS}


@router.get("/settings")
async def get_settings(ctx: Member, sdb: ServiceDb):
    return await booking.load_settings(sdb, ctx.account_id)


@router.put("/settings")
async def put_settings(body: SettingsBody, ctx: AdminMember, sdb: ServiceDb):
    booking.zone(body.timezone)  # falls back safely; the value is kept as given
    names = [s.name.strip().lower() for s in body.services]
    if len(set(names)) != len(names):
        raise HTTPException(422, "Two services have the same name")
    row = {**body.model_dump(), "hours": _check_hours(body.hours), "account_id": ctx.account_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    await sdb.upsert("booking_settings", row, on_conflict="account_id")
    await audit.record(sdb, scope="account", action="booking.settings", actor_id=ctx.user.id, account_id=ctx.account_id, target="booking_settings", details={"services": len(body.services)})
    return await booking.load_settings(sdb, ctx.account_id)


@router.get("/slots")
async def slots(ctx: Member, sdb: ServiceDb, service: str = Query(..., max_length=80), days: int = Query(14, ge=1, le=60)):
    """Free start times for a service (local time), for booking by hand."""
    settings = await booking.load_settings(sdb, ctx.account_id)
    svc = booking.service_by_name(settings, service)
    if not svc:
        raise HTTPException(404, "Unknown service")
    now = datetime.now(timezone.utc)
    from datetime import timedelta

    busy = await booking.booked_between(sdb, ctx.account_id, now, now + timedelta(days=days + 1))
    free = booking.free_slots(settings, busy, now, int(svc.get("minutes") or settings["slot_minutes"]), days=days)
    return [s.strftime("%Y-%m-%d %H:%M") for s in free]


@router.get("")
async def list_appointments(ctx: Member, sdb: ServiceDb, start: str | None = Query(None, max_length=40), end: str | None = Query(None, max_length=40),
                            status: str | None = Query(None, max_length=20), limit: int = Query(200, ge=1, le=500)):
    filters: dict = {"account_id": ctx.account_id}
    if start:
        filters["starts_at"] = ("gte", start)
    if status:
        if status not in booking.STATUSES:
            raise HTTPException(422, "Unknown status")
        filters["status"] = status
    rows = await sdb.select("appointments", filters, order="starts_at.asc", limit=limit)
    return [r for r in rows if not end or str(r["starts_at"]) < end]


@router.post("", status_code=201)
async def add_appointment(body: ManualBooking, ctx: AgentMember, sdb: ServiceDb):
    """A booking taken by phone or at the desk. The time must be free; opening hours are not enforced."""
    settings = await booking.load_settings(sdb, ctx.account_id)
    svc = booking.service_by_name(settings, body.service)
    start = booking.parse_start(body.start, settings)
    if not svc:
        raise HTTPException(422, "Pick one of the services in the booking settings")
    if not start:
        raise HTTPException(422, "The time must look like 2026-11-24 10:30")
    try:
        appt = await booking.create(sdb, settings, account_id=ctx.account_id, service=svc, start=start, name=body.name, phone=body.phone, note=body.note, source="manual", check_hours=False)
    except booking.BookingProblem as exc:
        raise HTTPException(409, "That time is already fully booked") from exc
    return appt


async def _appointment(sdb, account_id: str, appointment_id: str) -> dict:
    rows = await sdb.select("appointments", {"id": appointment_id, "account_id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Appointment not found")
    return rows[0]


@router.patch("/{appointment_id}")
async def update_appointment(appointment_id: str, body: AppointmentAction, ctx: AgentMember, sdb: ServiceDb, bridge: Bridge):
    appt = await _appointment(sdb, ctx.account_id, appointment_id)
    if appt["status"] != "booked":
        raise HTTPException(409, f"This appointment is already {appt['status'].replace('_', ' ')}")
    rows = await sdb.update("appointments", {"id": appointment_id, "account_id": ctx.account_id}, {"status": body.action, "updated_at": datetime.now(timezone.utc).isoformat()})
    appt = rows[0] if rows else {**appt, "status": body.action}
    if body.action == "completed":
        await booking.move_lead(sdb, ctx.account_id, appt.get("lead_id"), booking.VISITED_STAGES)
    notified, reason = False, None
    if body.action == "cancelled" and body.notify and appt.get("conversation_id"):
        settings = await booking.load_settings(sdb, ctx.account_id)
        lang = settings["language"]
        text = booking.words(lang)["cancelled"].format(service=appt["service"], when=booking.when_text(booking.local(appt, settings), lang))
        if await wa_templates.window_open(sdb, appt["conversation_id"]):
            try:
                await bridge.call("send", ctx.account_id, ctx.user.id, ctx.role, conversation_id=appt["conversation_id"], type="text", text=text)
                notified = True
            except Exception as exc:  # noqa: BLE001
                reason = f"WhatsApp did not send it: {getattr(exc, 'detail', exc)}"
        else:
            reason = "The customer's 24-hour WhatsApp window is closed, so they weren't messaged. Call them or message them from the Inbox with a template."
    await audit.record(sdb, scope="account", action=f"appointment.{body.action}", actor_id=ctx.user.id, account_id=ctx.account_id, target=appointment_id, details={"number": appt["number"]})
    await events.emit(sdb, ctx.account_id, "appointment.updated", {**booking.public(appt), "change": body.action})
    return {"appointment": appt, "notified": notified, "not_notified_reason": reason}


# ------------------------------------------------------------------ reminders (worker)
async def send_reminders(sdb, bridge, now: datetime | None = None) -> int:
    """About a day before: text inside the 24-hour window, else the approved reminder template."""
    from datetime import timedelta

    now = now or datetime.now(timezone.utc)
    due = await sdb.select("appointments", {"status": "booked", "reminded_at": ("is", "null"), "starts_at": ("lte", (now + timedelta(hours=24)).isoformat())}, order="starts_at.asc", limit=200)
    sent = 0
    for appt in due:
        starts = datetime.fromisoformat(str(appt["starts_at"]).replace("Z", "+00:00"))
        if starts < now + timedelta(hours=2) or not appt.get("conversation_id"):
            await sdb.update("appointments", {"id": appt["id"]}, {"reminded_at": now.isoformat(), "reminder_error": "Too close to the time, or no WhatsApp chat"})
            continue
        settings = await booking.load_settings(sdb, appt["account_id"])
        if not settings["reminders"]:
            await sdb.update("appointments", {"id": appt["id"]}, {"reminded_at": now.isoformat(), "reminder_error": "Reminders are off"})
            continue
        accounts = await sdb.select("accounts", {"id": appt["account_id"]}, limit=1)
        owner = accounts[0].get("owner_user_id") if accounts else None
        lang = settings["language"]
        when = booking.when_text(booking.local(appt, settings), lang)
        text = {"en": f"⏰ Reminder: your {appt['service']} appointment is on {when}. Reply here if you need to change it.",
                "pt": f"⏰ Lembrete: seu horário de {appt['service']} é em {when}. Responda aqui se precisar alterar.",
                "es": f"⏰ Recordatorio: tu cita de {appt['service']} es el {when}. Responde aquí si necesitas cambiarla.",
                "ko": f"⏰ 알림: {when} {appt['service']} 예약이 있습니다. 변경이 필요하면 여기에 답장해 주세요."}.get(lang)
        ok, reason = False, "No owner to send as"
        if owner:
            ok, reason, _ = await wa_templates.deliver(sdb, bridge, account_id=appt["account_id"], user_id=owner, role="owner", conversation_id=appt["conversation_id"],
                                                       text=text, kind="reminder", params=[appt.get("customer_name") or "there", appt["service"], when], language=lang,
                                                       custom=booking.chosen_reminder(appt, settings))
        await sdb.update("appointments", {"id": appt["id"]}, {"reminded_at": now.isoformat(), "reminder_error": None if ok else (reason or "Not sent")[:300]})
        sent += ok
    return sent

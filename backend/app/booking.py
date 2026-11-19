"""Appointments: services, opening hours, free slots, and bookings the AI makes in the chat.

The assistant sees the services and the free slots of the next days, helps the customer pick one,
asks their name and, once they confirm, ends its reply with one machine line:

    [BOOK]{"service":"Consultation","start":"2026-11-24 10:30","name":"Asha Rao","note":""}

AutoShift (not the AI) checks the slot is still free, saves the appointment, adds it to the
Bookings pipeline and confirms it to the customer. A reminder goes out the day before.
"""

import json
import logging
import re
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Any

from . import audit, events
from .db import Db, DbError

log = logging.getLogger("autoshift.booking")

BOOK_MARK = re.compile(r"\[BOOK\]\s*(\{.*\})\s*(?:\[/BOOK\])?", re.S)
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
FIRST_NUMBER = 1
PROMPT_DAYS = 7
PROMPT_SLOTS_PER_DAY = 16
STATUSES = ("booked", "completed", "no_show", "cancelled")
# The stage a new booking lands in on the Leads page, and where a visit moves it.
BOOKED_STAGES = {"confirmed", "booked", "confirmado", "confirmada", "agendado", "reservado", "확정", "예약 확정"}
VISITED_STAGES = {"visited", "completed", "atendido", "visitado", "completado", "방문 완료", "완료"}

DEFAULTS: dict[str, Any] = {
    "services": [], "hours": {d: ([["09:00", "18:00"]] if d != "sun" else []) for d in DAYS},
    "timezone": "Asia/Kolkata", "slot_minutes": 30, "per_slot": 1, "days_ahead": 14,
    "min_notice_minutes": 60, "reminders": True, "language": "en",
}

TEXT: dict[str, dict[str, str]] = {
    "en": {"booked": "✅ Booked: {service} on {when}. We'll send you a reminder the day before. Reply here if you need to change it.",
           "taken": "Sorry, {when} isn't available any more.", "free": "Free times: {slots}.", "none": "There are no free times in the next days; a person from our team will help you.",
           "bad": "I couldn't book that yet: the service, time and name are needed. Please check and confirm again.",
           "cancelled": "Your {service} appointment on {when} has been cancelled. Reply here to book a new time.", "at": "at"},
    "pt": {"booked": "✅ Agendado: {service} em {when}. Enviaremos um lembrete na véspera. Responda aqui se precisar alterar.",
           "taken": "Desculpe, {when} não está mais disponível.", "free": "Horários livres: {slots}.", "none": "Não há horários livres nos próximos dias; uma pessoa da nossa equipe vai ajudar você.",
           "bad": "Ainda não consegui agendar: preciso do serviço, do horário e do nome. Verifique e confirme novamente.",
           "cancelled": "Seu horário de {service} em {when} foi cancelado. Responda aqui para marcar outro.", "at": "às"},
    "es": {"booked": "✅ Reservado: {service} el {when}. Te enviaremos un recordatorio el día anterior. Responde aquí si necesitas cambiarlo.",
           "taken": "Lo siento, {when} ya no está disponible.", "free": "Horarios libres: {slots}.", "none": "No hay horarios libres en los próximos días; una persona de nuestro equipo te ayudará.",
           "bad": "Aún no pude reservar: necesito el servicio, la hora y el nombre. Revísalo y confírmalo de nuevo.",
           "cancelled": "Tu cita de {service} el {when} fue cancelada. Responde aquí para reservar otra hora.", "at": "a las"},
    "ko": {"booked": "✅ 예약 완료: {when} {service}. 하루 전에 알림을 보내 드립니다. 변경이 필요하면 여기에 답장해 주세요.",
           "taken": "죄송합니다. {when}은(는) 이제 예약할 수 없습니다.", "free": "예약 가능 시간: {slots}.", "none": "앞으로 며칠간 예약 가능한 시간이 없습니다. 담당자가 도와드리겠습니다.",
           "bad": "아직 예약하지 못했습니다: 서비스, 시간, 이름이 필요합니다. 확인 후 다시 확정해 주세요.",
           "cancelled": "{when} {service} 예약이 취소되었습니다. 새로 예약하려면 여기에 답장해 주세요.", "at": ""},
}
WEEKDAY = {"en": ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"), "pt": ("seg", "ter", "qua", "qui", "sex", "sáb", "dom"),
           "es": ("lun", "mar", "mié", "jue", "vie", "sáb", "dom"), "ko": ("월", "화", "수", "목", "금", "토", "일")}
MONTH = {"en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
         "pt": ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"),
         "es": ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic")}


class BookingProblem(Exception):
    def __init__(self, key: str, **values):
        super().__init__(key)
        self.key, self.values = key, values


def zone(name: str | None) -> tzinfo:
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name or "Asia/Kolkata")
    except Exception:  # noqa: BLE001 - no tz database: India's offset, which never changes
        return timezone(timedelta(hours=5, minutes=30))


def settings_from(row: dict | None) -> dict:
    out = {**DEFAULTS, **{k: v for k, v in (row or {}).items() if k in DEFAULTS and v is not None}}
    out["services"] = [s for s in out["services"] if isinstance(s, dict) and str(s.get("name", "")).strip()]
    return out


async def load_settings(sdb: Db, account_id: str) -> dict:
    rows = await sdb.select("booking_settings", {"account_id": account_id}, limit=1)
    return settings_from(rows[0] if rows else None)


def words(lang: str) -> dict[str, str]:
    return TEXT.get(lang, TEXT["en"])


def when_text(dt: datetime, lang: str) -> str:
    """'Mon 24 Nov at 10:30 AM' in the business's language (the time is already local)."""
    lang = lang if lang in TEXT else "en"
    if lang == "ko":
        return f"{dt.month}월 {dt.day}일 ({WEEKDAY['ko'][dt.weekday()]}) {'오전' if dt.hour < 12 else '오후'} {dt.hour % 12 or 12}:{dt.minute:02d}"
    day = f"{WEEKDAY[lang][dt.weekday()]} {dt.day} {MONTH[lang][dt.month - 1]}"
    clock = f"{dt.hour % 12 or 12}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}" if lang == "en" else f"{dt.hour:02d}:{dt.minute:02d}"
    return f"{day} {words(lang)['at']} {clock}"


def _minutes(hhmm: str) -> int:
    h, m = str(hhmm).split(":")[:2]
    return int(h) * 60 + int(m)


def service_by_name(settings: dict, name: str) -> dict | None:
    key = re.sub(r"\s+", " ", str(name or "")).strip().lower()
    return next((s for s in settings["services"] if str(s["name"]).strip().lower() == key), None)


def free_slots(settings: dict, booked: list[dict], now: datetime, minutes: int, days: int | None = None) -> list[datetime]:
    """Local start times that fit inside opening hours, after the minimum notice, with room left."""
    tz = zone(settings["timezone"])
    step = max(5, int(settings["slot_minutes"] or 30))
    per_slot = max(1, int(settings["per_slot"] or 1))
    earliest = now.astimezone(tz) + timedelta(minutes=int(settings["min_notice_minutes"] or 0))
    busy = [(datetime.fromisoformat(str(b["starts_at"]).replace("Z", "+00:00")), datetime.fromisoformat(str(b["ends_at"]).replace("Z", "+00:00")))
            for b in booked if b.get("status") == "booked"]
    out: list[datetime] = []
    start_day = now.astimezone(tz).date()
    for offset in range(min(int(days or settings["days_ahead"] or 14), 60)):
        day = start_day + timedelta(days=offset)
        for window in settings["hours"].get(DAYS[day.weekday()], []) or []:
            try:
                open_m, close_m = _minutes(window[0]), _minutes(window[1])
            except (ValueError, IndexError, TypeError):
                continue
            t = open_m
            while t + minutes <= close_m:
                start = datetime(day.year, day.month, day.day, t // 60, t % 60, tzinfo=tz)
                end = start + timedelta(minutes=minutes)
                if start >= earliest and sum(1 for s, e in busy if s < end and start < e) < per_slot:
                    out.append(start)
                t += step
    return out


def instructions(settings: dict, slots: list[datetime], lang: str) -> str:
    services = "; ".join(f"{s['name']} ({int(s.get('minutes') or settings['slot_minutes'])} min" + (f", ₹{s['price']}" if s.get("price") else "") + ")" for s in settings["services"])
    by_day: dict[str, list[str]] = {}
    for s in slots:
        key = f"{WEEKDAY['en'][s.weekday()]} {s.year}-{s.month:02d}-{s.day:02d}"
        if len(by_day) >= PROMPT_DAYS and key not in by_day:
            break
        if len(by_day.setdefault(key, [])) < PROMPT_SLOTS_PER_DAY:
            by_day[key].append(f"{s.hour:02d}:{s.minute:02d}")
    free = "\n".join(f"- {d}: {', '.join(times)}" for d, times in by_day.items()) or "- none in the next days"
    return "\n".join([
        "You also book appointments in this chat. Services: " + (services or "ask what they need") + ".",
        "Free start times (local time, for the shortest service; a longer service needs the following times free too):",
        free,
        "Steps: ask which service and which day/time suits them, offer only free times from the list above, ask their full name,",
        "read the booking back and ask them to confirm. Only after they clearly confirm, end your reply with one line in exactly this form:",
        '[BOOK]{"service":"<service name from the list>","start":"YYYY-MM-DD HH:MM","name":"Full name","note":""}',
        "Never invent a time or a service. Never write the confirmation yourself in detail: AutoShift adds it. If no time suits them, say a person from the team will help.",
        "If they ask about an appointment they already have, answer from their appointments listed below.",
    ])


def describe_appointments(rows: list[dict], settings: dict) -> str:
    if not rows:
        return "This customer has no upcoming appointments."
    tz = zone(settings["timezone"])
    lines = [f"- #{r['number']} {r['service']} on {when_text(datetime.fromisoformat(str(r['starts_at']).replace('Z', '+00:00')).astimezone(tz), 'en')} ({r['status']})" for r in rows]
    return "This customer's appointments:\n" + "\n".join(lines)


async def upcoming_for(sdb: Db, account_id: str, contact_id: str | None, now: datetime | None = None) -> list[dict]:
    if not contact_id:
        return []
    since = ((now or datetime.now(timezone.utc)) - timedelta(hours=2)).isoformat()
    return await sdb.select("appointments", {"account_id": account_id, "contact_id": contact_id, "starts_at": ("gte", since)}, order="starts_at.asc", limit=5)


def booking_on(assistant: dict) -> bool:
    return bool((assistant.get("booking") or {}).get("enabled"))


def extract(text: str) -> tuple[str, dict | None]:
    m = BOOK_MARK.search(text or "")
    if not m:
        return text, None
    clean = (text[: m.start()] + text[m.end():]).strip()
    try:
        data = json.loads(m.group(1))
    except ValueError:
        data = None
    return clean, data if isinstance(data, dict) else {"_bad": True}


async def booked_between(sdb: Db, account_id: str, start: datetime, end: datetime) -> list[dict]:
    # Stored in UTC: compare in UTC so the database and the times agree whatever the business's zone.
    utc = lambda d: d.astimezone(timezone.utc).isoformat()
    return await sdb.select("appointments", {"account_id": account_id, "status": "booked", "starts_at": ("lt", utc(end)), "ends_at": ("gt", utc(start))})


def parse_start(value: str, settings: dict) -> datetime | None:
    raw = str(value or "").strip().replace("T", " ")
    try:
        naive = datetime.strptime(raw[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    return naive.replace(tzinfo=zone(settings["timezone"]))


async def _next_number(sdb: Db, account_id: str) -> int:
    last = await sdb.select("appointments", {"account_id": account_id}, order="number.desc", limit=1)
    return int(last[0]["number"]) + 1 if last else FIRST_NUMBER


async def move_lead(sdb: Db, account_id: str, lead_id: str | None, names: set[str]) -> None:
    if not lead_id:
        return
    try:
        deals = await sdb.select("deals", {"id": lead_id, "account_id": account_id}, limit=1)
        if not deals:
            return
        stages = await sdb.select("pipeline_stages", {"pipeline_id": deals[0]["pipeline_id"]})
        stage = next((s for s in stages if str(s.get("name", "")).strip().lower() in names), None)
        if stage:
            await sdb.update("deals", {"id": lead_id, "account_id": account_id}, {"stage_id": stage["id"]})
    except Exception as exc:  # noqa: BLE001 - the booking matters more than the lead card
        log.warning("could not move booking lead %s: %s", lead_id, exc)


async def _new_lead(sdb: Db, account_id: str, contact_id: str | None, conversation_id: str | None, title: str, price_paise: int) -> str | None:
    if not contact_id:
        return None
    try:
        pipelines = await sdb.select("pipelines", {"account_id": account_id})
        if not pipelines:
            return None
        stages = await sdb.select("pipeline_stages", {"pipeline_id": ("in", [p["id"] for p in pipelines])})
        stage = next((s for s in stages if str(s.get("name", "")).strip().lower() in BOOKED_STAGES), None)
        accounts = await sdb.select("accounts", {"id": account_id}, limit=1)
        owner = accounts[0].get("owner_user_id") if accounts else None
        if not stage or not owner:
            return None
        deal = await sdb.insert("deals", {"account_id": account_id, "user_id": owner, "pipeline_id": stage["pipeline_id"], "stage_id": stage["id"],
                                          "contact_id": contact_id, "conversation_id": conversation_id, "title": title, "value": price_paise / 100, "currency": "INR"})
        return deal["id"]
    except Exception as exc:  # noqa: BLE001
        log.warning("could not add booking lead for %s: %s", account_id, exc)
        return None


async def create(sdb: Db, settings: dict, *, account_id: str, service: dict, start: datetime, name: str, phone: str = "", note: str = "",
                 source: str = "ai", assistant_id: str | None = None, conversation_id: str | None = None, contact_id: str | None = None,
                 now: datetime | None = None, check_hours: bool = True) -> dict:
    """Save a booking if the time is free (inside opening hours for AI bookings). Raises BookingProblem."""
    minutes = int(service.get("minutes") or settings["slot_minutes"] or 30)
    end = start + timedelta(minutes=minutes)
    if check_hours:
        day_slots = free_slots(settings, await booked_between(sdb, account_id, start - timedelta(days=1), end + timedelta(days=1)), now or datetime.now(timezone.utc), minutes, days=int(settings["days_ahead"]))
        if start not in day_slots:
            raise BookingProblem("taken", when=start)
    elif len(await booked_between(sdb, account_id, start, end)) >= max(1, int(settings["per_slot"] or 1)):
        raise BookingProblem("taken", when=start)
    number = await _next_number(sdb, account_id)
    price_paise = int(round(float(service.get("price") or 0) * 100))
    lead_id = await _new_lead(sdb, account_id, contact_id, conversation_id, f"Appointment #{number}: {service['name']}", price_paise)
    row = {
        "account_id": account_id, "assistant_id": assistant_id, "conversation_id": conversation_id, "contact_id": contact_id, "lead_id": lead_id,
        "service": str(service["name"])[:120], "minutes": minutes, "price_paise": price_paise,
        "starts_at": start.astimezone(timezone.utc).isoformat(), "ends_at": end.astimezone(timezone.utc).isoformat(),
        "customer_name": name.strip()[:120], "customer_phone": re.sub(r"[^\d+]", "", phone or "")[:20], "note": (note or "").strip()[:300],
        "status": "booked", "source": source,
    }
    appt = None
    for attempt in range(3):
        try:
            appt = await sdb.insert("appointments", {**row, "number": number + attempt})
            break
        except DbError as exc:
            if attempt == 2 or exc.status not in (400, 409):
                raise
    assert appt is not None
    await audit.record(sdb, scope="account", action="appointment.create", actor_id=None, account_id=account_id, target=appt["id"], details={"number": appt["number"], "service": row["service"], "source": source})
    await events.emit(sdb, account_id, "appointment.created", public(appt))
    return appt


async def place(sdb: Db, *, assistant: dict, req: dict, conversation_id: str | None, contact_id: str | None, customer_phone: str | None, now: datetime | None = None) -> tuple[str, dict | None]:
    """The AI's confirmed booking. Returns (text to add to the reply, the appointment or None)."""
    account_id = assistant["account_id"]
    settings = await load_settings(sdb, account_id)
    lang = settings["language"]
    w = words(lang)
    service = service_by_name(settings, req.get("service", "")) if not req.get("_bad") else None
    start = parse_start(req.get("start", ""), settings) if service else None
    name = str(req.get("name") or "").strip()
    if not service or not start or not name:
        return w["bad"], None
    try:
        appt = await create(sdb, settings, account_id=account_id, service=service, start=start, name=name, phone=customer_phone or "", note=str(req.get("note") or ""),
                            assistant_id=assistant.get("id"), conversation_id=conversation_id, contact_id=contact_id, now=now)
    except BookingProblem:
        minutes = int(service.get("minutes") or settings["slot_minutes"])
        others = free_slots(settings, await booked_between(sdb, account_id, start - timedelta(days=1), start + timedelta(days=8)), now or datetime.now(timezone.utc), minutes, days=8)
        near = sorted(others, key=lambda s: abs((s - start).total_seconds()))[:4]
        return (w["taken"].format(when=when_text(start, lang)) + " " + (w["free"].format(slots=", ".join(when_text(s, lang) for s in sorted(near))) if near else w["none"])), None
    return w["booked"].format(service=appt["service"], when=when_text(start, lang)), appt


def public(appt: dict) -> dict:
    keys = ("id", "number", "service", "minutes", "price_paise", "starts_at", "ends_at", "customer_name", "customer_phone", "note", "status", "source", "contact_id", "conversation_id", "lead_id", "created_at")
    return {k: appt.get(k) for k in keys}


def local(appt: dict, settings: dict) -> datetime:
    return datetime.fromisoformat(str(appt["starts_at"]).replace("Z", "+00:00")).astimezone(zone(settings["timezone"]))

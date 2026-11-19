"""AutoShift's own WhatsApp templates, so updates still reach customers after the 24-hour window.

WhatsApp allows free text only within 24 hours of the customer's last message; after that a business
may send only an approved template. AutoShift submits two small utility templates to the business's
WhatsApp account when the business asks (one click), and uses them only when the window is closed:

  autoshift_order_update        "Hi {{1}}, here is an update on your order #{{2}}: {{3}}. …"
  autoshift_appointment_reminder "Hi {{1}}, a reminder of your {{2}} appointment on {{3}}. …"

Meta reviews them (usually minutes). Utility messages cost a small per-message fee billed by Meta.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from .db import Db
from .web_bridge import BridgeError

log = logging.getLogger("autoshift.wa_templates")

WINDOW = timedelta(hours=24)
KINDS = ("order", "reminder")
NAMES = {"order": "autoshift_order_update", "reminder": "autoshift_appointment_reminder"}
META_LANG = {"en": "en", "pt": "pt_BR", "es": "es", "ko": "ko"}

BODIES: dict[str, dict[str, str]] = {
    "order": {
        "en": "Hi {{1}}, here is an update on your order #{{2}}: {{3}}. Reply to this message if you have any questions.",
        "pt": "Olá {{1}}, aqui está uma atualização do seu pedido nº {{2}}: {{3}}. Responda a esta mensagem se tiver alguma dúvida.",
        "es": "Hola {{1}}, aquí tienes una actualización de tu pedido n.º {{2}}: {{3}}. Responde a este mensaje si tienes alguna pregunta.",
        "ko": "안녕하세요 {{1}}님, 주문 #{{2}} 안내입니다: {{3}}. 궁금한 점이 있으면 이 메시지에 답장해 주세요.",
    },
    "reminder": {
        "en": "Hi {{1}}, this is a reminder of your {{2}} appointment on {{3}}. Reply to this message if you need to change it.",
        "pt": "Olá {{1}}, lembrete do seu horário de {{2}} em {{3}}. Responda a esta mensagem se precisar alterar.",
        "es": "Hola {{1}}, te recordamos tu cita de {{2}} el {{3}}. Responde a este mensaje si necesitas cambiarla.",
        "ko": "안녕하세요 {{1}}님, 예약하신 {{2}} 일정({{3}})을 알려 드립니다. 변경이 필요하면 이 메시지에 답장해 주세요.",
    },
}
SAMPLES = {
    "order": ["Asha", "1001", "it has been shipped, track it at https://track.example.com/AB123"],
    "reminder": ["Asha", "consultation", "Mon 24 Nov at 10:30 AM"],
}


def lang_of(language: str | None) -> str:
    return language if language in META_LANG else "en"


def clean_param(value: Any) -> str:
    """Template values can't hold new lines, tabs or more than four spaces in a row."""
    text = " ".join(str(value or "").split())
    return (text or "-")[:900]


async def status(sdb: Db, account_id: str) -> dict[str, dict]:
    """The state of each AutoShift template for this business (any language)."""
    out: dict[str, dict] = {}
    for kind in KINDS:
        rows = await sdb.select("message_templates", {"account_id": account_id, "name": NAMES[kind]})
        best = next((r for r in rows if str(r.get("status", "")).upper() == "APPROVED"), rows[0] if rows else None)
        out[kind] = {
            "name": NAMES[kind],
            "status": str(best.get("status", "")).upper() if best else "NONE",
            "language": best.get("language") if best else None,
            "rejection_reason": best.get("rejection_reason") if best else None,
        }
    return out


async def approved(sdb: Db, account_id: str, kind: str, language: str) -> dict | None:
    """An approved template of this kind: the business's language first, else any approved one."""
    rows = [r for r in await sdb.select("message_templates", {"account_id": account_id, "name": NAMES[kind]}) if str(r.get("status", "")).upper() == "APPROVED"]
    want = META_LANG[lang_of(language)]
    return next((r for r in rows if r.get("language") == want), rows[0] if rows else None)


def template_body(kind: str, language: str) -> dict:
    lang = lang_of(language)
    return {
        "name": NAMES[kind], "category": "Utility", "language": META_LANG[lang],
        "body_text": BODIES[kind][lang], "sample_values": {"body": SAMPLES[kind]}, "buttons": [],
    }


async def window_open(sdb: Db, conversation_id: str, now: datetime | None = None) -> bool:
    last = await sdb.select("messages", {"conversation_id": conversation_id, "sender_type": "customer"}, order="created_at.desc", limit=1)
    if not last or not last[0].get("created_at"):
        return False
    at = datetime.fromisoformat(str(last[0]["created_at"]).replace("Z", "+00:00"))
    return (now or datetime.now(timezone.utc)) - at < WINDOW


async def deliver(sdb: Db, bridge, *, account_id: str, user_id: str, role: str, conversation_id: str, text: str,
                  kind: str, params: list[str], language: str) -> tuple[bool, str | None, str | None]:
    """Send `text` while the 24-hour window is open, else the approved template. (sent, reason, via)."""
    if await window_open(sdb, conversation_id):
        try:
            await bridge.call("send", account_id, user_id, role, conversation_id=conversation_id, type="text", text=text)
            return True, None, "text"
        except BridgeError as exc:
            log.info("free text refused for %s, trying the template: %s", conversation_id, exc.detail)
    tpl = await approved(sdb, account_id, kind, language)
    if not tpl:
        return False, "The customer's 24-hour WhatsApp window is closed and the update template isn't approved yet. Create it on the assistant's Shop tab.", None
    try:
        await bridge.call("send", account_id, user_id, role, conversation_id=conversation_id, type="template",
                          template={"name": tpl["name"], "language": tpl.get("language") or "en", "params": [clean_param(p) for p in params]})
        return True, None, "template"
    except BridgeError as exc:
        return False, f"WhatsApp did not send the template: {exc.detail}", None

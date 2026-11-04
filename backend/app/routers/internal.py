"""Calls from AutoShift's own web app (which runs WhatsApp sending, the inbox and flows).

Protected by a shared secret (INTERNAL_SECRET), never by a user login: these act for any business,
so they must never be reachable from a browser. With no secret set, they are switched off.
"""

import hmac
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException

from .. import ai_runner, audit, events, platform_settings, wallet
from ..config import Settings, get_settings
from ..deps import ServiceDb, get_llm
from ..schemas import InternalAiReply, InternalCanSend, InternalCharge, InternalEvent

router = APIRouter(prefix="/v1/internal", tags=["internal"], include_in_schema=False)
LOW_BALANCE_PAISE = 20000  # ₹200: tell the business (and their automations) the wallet is running low


def internal_only(settings: Annotated[Settings, Depends(get_settings)], x_autoshift_internal: Annotated[str | None, Header()] = None) -> None:
    if not settings.internal_secret:
        raise HTTPException(503, "The internal API is not configured")
    if not x_autoshift_internal or not hmac.compare_digest(x_autoshift_internal, settings.internal_secret):
        raise HTTPException(401, "Not allowed")


Internal = Annotated[None, Depends(internal_only)]


async def _account(sdb, account_id: str) -> dict:
    rows = await sdb.select("accounts", {"id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Unknown business")
    return rows[0]


@router.post("/can-send")
async def can_send(body: InternalCanSend, _: Internal, sdb: ServiceDb):
    """Before a send: is the business active and is there money for it?"""
    acct = await _account(sdb, body.account_id)
    need = wallet.RATES_PAISE[f"charge_{body.category}"] * body.units
    if body.category in platform_settings.MESSAGE_CATEGORIES and not await platform_settings.wallet_pays_meta_fees(sdb):
        need = 0  # Meta bills the business directly for messages
    have = await wallet.balance(sdb, body.account_id)
    if acct.get("status") == "suspended":
        return {"ok": False, "reason": "suspended", "balance_paise": have, "needed_paise": need}
    return {"ok": have >= need, "reason": None if have >= need else "insufficient_funds", "balance_paise": have, "needed_paise": need}


@router.post("/charge")
async def charge(body: InternalCharge, _: Internal, sdb: ServiceDb):
    """Charge a message Meta billed (or an AI reply). Safe to repeat: one charge per idempotency key."""
    await _account(sdb, body.account_id)
    if body.category in platform_settings.MESSAGE_CATEGORIES and not await platform_settings.wallet_pays_meta_fees(sdb):
        # Meta bills the business's own card for messages; charging the wallet too would bill them twice.
        return {"charged_paise": 0, "balance_paise": await wallet.balance(sdb, body.account_id), "applied": False, "billed_by": "meta"}
    try:
        done = await wallet.charge(sdb, body.account_id, f"charge_{body.category}", body.units, body.ref, body.idempotency_key)
    except wallet.InsufficientFunds:
        # Meta already delivered it; record that it went unpaid so staff can see and follow up.
        await audit.record(sdb, scope="account", action="wallet.unpaid_charge", actor_id=None, account_id=body.account_id, target=body.ref, details={"category": body.category, "units": body.units})
        raise HTTPException(402, "Not enough money in the wallet")
    if done is None:  # free (service conversations)
        return {"charged_paise": 0, "balance_paise": await wallet.balance(sdb, body.account_id), "applied": False}
    if done.applied and done.balance_paise < LOW_BALANCE_PAISE <= done.balance_paise + wallet.RATES_PAISE[f"charge_{body.category}"] * body.units:
        await events.emit(sdb, body.account_id, "wallet.low", {"balance_paise": done.balance_paise})  # once, when it crosses the line
    return {"charged_paise": wallet.RATES_PAISE[f"charge_{body.category}"] * body.units if done.applied else 0, "balance_paise": done.balance_paise, "applied": done.applied}


@router.post("/ai-reply")
async def ai_reply(body: InternalAiReply, _: Internal, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)], llm: Annotated[object, Depends(get_llm)]):
    """One assistant reply for a live chat: platform keys, plan limit, wallet charge, hand-off rules."""
    acct = await _account(sdb, body.account_id)
    if acct.get("status") == "suspended":
        return {"status": "off", "text": "", "reason": "The business is suspended", "balance_paise": None}
    rows = await sdb.select("assistants", {"id": body.assistant_id, "account_id": body.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Assistant not found")
    history = [{"role": h.get("role"), "content": str(h.get("content", ""))[:4000]} for h in body.history if h.get("role") in ("user", "assistant")]
    out = await ai_runner.reply(sdb, llm, settings, rows[0], history, body.message, ref=f"live:{body.ref}")
    if out.status == "handoff":
        await events.emit(sdb, body.account_id, "conversation.handoff", {"assistant_id": body.assistant_id, "reason": out.reason, "ref": body.ref})
    return asdict(out)


@router.post("/events", status_code=202)
async def event(body: InternalEvent, _: Internal, sdb: ServiceDb):
    """Events the web app saw (a message arrived, a lead was created ...) for this business's webhooks and n8n."""
    if body.type not in events.EVENT_TYPES:
        raise HTTPException(422, "Unknown event type")
    await _account(sdb, body.account_id)
    return {"queued": await events.emit(sdb, body.account_id, body.type, body.data)}

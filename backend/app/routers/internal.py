"""Calls from AutoShift's own web app (which runs WhatsApp sending, the inbox and flows).

Protected by a shared secret (INTERNAL_SECRET), never by a user login: these act for any business,
so they must never be reachable from a browser. With no secret set, they are switched off.
"""

import asyncio
import hmac
import logging
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException

from .. import ai_runner, audit, booking, events, google_api, pages, platform_settings, shop_orders, shop_payments, wallet
from ..config import Settings, get_settings
from ..deps import Bridge, ServiceDb, get_llm
from ..schemas import InternalAiReply, InternalCanSend, InternalCharge, InternalAiDraft, InternalEvent, InternalGoogleAction, InternalPaymentLink

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
    need = (await wallet.rates(sdb))[f"charge_{body.category}"] * body.units
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
    unit = (await wallet.rates(sdb))[f"charge_{body.category}"]
    if done.applied and done.balance_paise < LOW_BALANCE_PAISE <= done.balance_paise + unit * body.units:
        await events.emit(sdb, body.account_id, "wallet.low", {"balance_paise": done.balance_paise})  # once, when it crosses the line
    return {"charged_paise": unit * body.units if done.applied else 0, "balance_paise": done.balance_paise, "applied": done.applied}


@router.post("/ai-reply")
async def ai_reply(body: InternalAiReply, _: Internal, sdb: ServiceDb, bridge: Bridge, settings: Annotated[Settings, Depends(get_settings)], llm: Annotated[object, Depends(get_llm)]):
    """One assistant reply for a live chat: platform keys, plan limit, wallet charge, hand-off rules."""
    acct = await _account(sdb, body.account_id)
    if acct.get("status") == "suspended":
        return {"status": "off", "text": "", "reason": "The business is suspended", "balance_paise": None}
    rows = await sdb.select("assistants", {"id": body.assistant_id, "account_id": body.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Assistant not found")
    history = [{"role": h.get("role"), "content": str(h.get("content", ""))[:4000]} for h in body.history if h.get("role") in ("user", "assistant")]
    if booking.booking_on(rows[0]) and "appointments" not in pages.enabled(acct):
        rows[0] = {**rows[0], "booking": {"enabled": False}}  # Appointments is switched off: no booking
    if shop_orders.shop_on(rows[0]) and "orders" not in pages.enabled(acct):
        rows[0] = {**rows[0], "shop": {**(rows[0].get("shop") or {}), "enabled": False}}  # Orders is switched off: no order taking
    if shop_orders.shop_on(rows[0]) and body.contact_id:
        # "I paid": ask Razorpay about this customer's open links first, so the answer is the real status.
        try:
            await asyncio.wait_for(shop_payments.reconcile_pending(sdb, settings, bridge, account_id=body.account_id, contact_id=body.contact_id, limit=3), timeout=8)
        except Exception as exc:  # noqa: BLE001 - never block the reply on this
            logging.getLogger("autoshift.shop").warning("payment check before reply failed: %s", exc)
    out = await ai_runner.reply(sdb, llm, settings, rows[0], history, body.message, ref=f"live:{body.ref}", recent_ai_replies=body.recent_ai_replies, contact_id=body.contact_id)
    if out.status == "handoff":
        await events.emit(sdb, body.account_id, "conversation.handoff", {"assistant_id": body.assistant_id, "reason": out.reason, "ref": body.ref})
    result = asdict(out)
    if out.status == "handoff" and shop_orders.shop_on(rows[0]):
        # A shop customer is never left in silence: tell them a person will reply.
        result["text"] = shop_orders.words(rows[0].get("shop") or {})["handoff"]
    if out.status == "reply" and out.booking is not None:
        added, appt = await booking.place(sdb, assistant=rows[0], req=out.booking, conversation_id=body.conversation_id, contact_id=body.contact_id, customer_phone=body.customer_phone)
        result["text"] = "\n\n".join(t for t in (result["text"], added) if t)
        result["appointment"] = {"id": appt["id"], "number": appt["number"]} if appt else None
    if out.status == "reply" and out.order is not None:
        # The customer confirmed an order: AutoShift prices it from the product list and adds the summary and payment link.
        cat = await sdb.select("product_catalog", {"account_id": body.account_id}, limit=1)
        products = (cat[0].get("products") or []) if cat else []
        added, order = await shop_orders.place(sdb, settings, assistant=rows[0], products=products, req=out.order, conversation_id=body.conversation_id, contact_id=body.contact_id, customer_phone=body.customer_phone)
        result["text"] = "\n\n".join(t for t in (result["text"], added) if t)
        result["order"] = {"id": order["id"], "number": order["number"]} if order else None
        # The payment link as a "Pay ₹…" button: the web app sends it after the summary, and drops the
        # link line from the summary only when the button really went out (the line stays as fallback).
        result["pay_button"] = shop_orders.pay_button(rows[0].get("shop") or {}, order) if order else None
    return result


@router.post("/ai-draft")
async def ai_draft(body: InternalAiDraft, _: Internal, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)], llm: Annotated[object, Depends(get_llm)]):
    """The inbox's ✨ button: the assistant's suggested reply for a person to edit and send. Same model,
    knowledge and product list as the live replies; charged like one AI reply; nothing is sent or placed."""
    import uuid

    acct = await _account(sdb, body.account_id)
    if acct.get("status") == "suspended":
        return {"status": "off", "text": "", "reason": "The business is suspended", "balance_paise": None}
    rows = await sdb.select("assistants", {"id": body.assistant_id, "account_id": body.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Assistant not found")
    history = [{"role": h.get("role"), "content": str(h.get("content", ""))[:4000]} for h in body.history if h.get("role") in ("user", "assistant")]
    assistant = rows[0]
    if booking.booking_on(assistant) and "appointments" not in pages.enabled(acct):
        assistant = {**assistant, "booking": {"enabled": False}}
    if shop_orders.shop_on(assistant) and "orders" not in pages.enabled(acct):
        assistant = {**assistant, "shop": {**(assistant.get("shop") or {}), "enabled": False}}
    out = await ai_runner.reply(sdb, llm, settings, assistant, history, body.message, ref=f"draft:{uuid.uuid4()}", contact_id=body.contact_id, draft=True)
    result = asdict(out)
    result.pop("order", None)
    result.pop("booking", None)
    result.pop("buttons", None)
    return result


@router.post("/events", status_code=202)
async def event(body: InternalEvent, _: Internal, sdb: ServiceDb):
    """Events the web app saw (a message arrived, a lead was created ...) for this business's webhooks and n8n."""
    if body.type not in events.EVENT_TYPES:
        raise HTTPException(422, "Unknown event type")
    await _account(sdb, body.account_id)
    return {"queued": await events.emit(sdb, body.account_id, body.type, body.data)}


@router.post("/payment-link", status_code=201)
async def payment_link(body: InternalPaymentLink, _: Internal, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    """A flow's payment-link step: a Razorpay link (and optional UPI QR) on the business's own account."""
    await _account(sdb, body.account_id)
    try:
        return await shop_payments.create_link(sdb, settings, **body.model_dump())
    except shop_payments.PaymentLinkError as exc:
        raise HTTPException(exc.status, exc.message) from exc


@router.post("/google-action")
async def google_action(body: InternalGoogleAction, _: Internal, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    """A flow's Google step: add a row to a sheet, or an event to a calendar, with the business's own Google account."""
    import json

    from ..security import decrypt

    await _account(sdb, body.account_id)
    filters = {"account_id": body.account_id, "kind": "google"}
    if body.connection_id:
        filters["id"] = body.connection_id
    rows = await sdb.select("flow_connections", filters, order="created_at.desc", limit=1)
    if not rows:
        raise HTTPException(409, "Connect a Google account first (Flows → Connections)")
    secrets = await sdb.select("flow_connection_secrets", {"connection_id": rows[0]["id"]}, limit=1)
    if not secrets:
        raise HTTPException(409, "The Google connection has no key; add it again")
    p = body.params
    try:
        token = await google_api.access_token(settings, rows[0]["id"], json.loads(decrypt(secrets[0]["ciphertext"], settings)))
        if body.service == "google_sheets_append":
            return await google_api.sheets_append(token, p.get("spreadsheet", ""), p.get("sheet", ""), p.get("values", ""))
        return await google_api.calendar_event(token, p.get("calendar", ""), p.get("title", ""), p.get("start", ""), p.get("minutes", "30"),
                                               p.get("timezone") or "Asia/Kolkata", p.get("description", ""))
    except google_api.GoogleError as exc:
        status = exc.status if exc.status in (409, 422) else 502
        raise HTTPException(status, f"Google: {exc.message}") from exc

import logging
"""Orders the AI shop assistant took on WhatsApp (Orders page).

The team moves an order on (packed, shipped with a tracking link, delivered, cancelled) or sends a
fresh payment link, and the customer is told on WhatsApp in the shop's language. Customers who are
blocked or who sent STOP are never messaged.
"""

import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import audit, events, shop_orders, shop_payments, wa_templates
from ..config import Settings, get_settings
from ..deps import AgentMember, Bridge, Member, ServiceDb
from .workspace_ops import BLOCKED_TAG, OPT_IN_WORDS, OPT_OUT_WORDS

router = APIRouter(prefix="/v1/orders", tags=["orders"])


class OrderAction(BaseModel):
    action: Literal["packed", "shipped", "delivered", "cancelled", "resend_link", "check_payment"]
    tracking: str | None = Field(None, max_length=500)
    notify: bool = True


async def _order(sdb, account_id: str, order_id: str) -> dict:
    rows = await sdb.select("shop_orders", {"id": order_id, "account_id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Order not found")
    return rows[0]


@router.get("")
async def list_orders(
    ctx: Member, sdb: ServiceDb,
    status: str | None = Query(None, max_length=20), payment: str | None = Query(None, max_length=20),
    number: int | None = Query(None, ge=1), limit: int = Query(100, ge=1, le=200),
):
    filters: dict = {"account_id": ctx.account_id}
    if number is not None:
        filters["number"] = str(number)  # a website finds an order by the number the customer was given
    if status:
        if status not in shop_orders.STATUSES:
            raise HTTPException(422, "Unknown status")
        filters["status"] = status
    if payment:
        if payment not in shop_orders.PAYMENT_STATUSES:
            raise HTTPException(422, "Unknown payment status")
        filters["payment_status"] = payment
    return await sdb.select("shop_orders", filters, order="created_at.desc", limit=limit)


@router.get("/{order_id}")
async def get_order(order_id: uuid.UUID, ctx: Member, sdb: ServiceDb):
    return await _order(sdb, ctx.account_id, str(order_id))


async def _may_message(sdb, account_id: str, order: dict) -> str | None:
    """None when the customer can be messaged, else why not."""
    if not order.get("conversation_id"):
        return "This order has no WhatsApp chat"
    if order.get("contact_id"):
        links = await sdb.select("contact_tags", {"contact_id": order["contact_id"]})
        if links:
            tags = await sdb.select("tags", {"id": ("in", [l["tag_id"] for l in links])})
            if any(str(t.get("name", "")).lower() == BLOCKED_TAG.lower() for t in tags):
                return "This customer is blocked"
    last = await sdb.select("messages", {"conversation_id": order["conversation_id"], "sender_type": "customer"}, order="created_at.desc", limit=20)
    for m in last:
        word = (m.get("content_text") or "").strip().upper().rstrip(".!")
        if word in OPT_IN_WORDS:
            break
        if word in OPT_OUT_WORDS:
            return "This customer asked not to be messaged (STOP)"
    return None


async def _shop_of(sdb, order: dict) -> dict:
    if order.get("assistant_id"):
        rows = await sdb.select("assistants", {"id": order["assistant_id"]}, limit=1)
        if rows:
            return rows[0].get("shop") or {}
    return {}


@router.patch("/{order_id}")
async def update_order(order_id: uuid.UUID, body: OrderAction, ctx: AgentMember, sdb: ServiceDb, bridge: Bridge, settings: Annotated[Settings, Depends(get_settings)]):
    order_id = str(order_id)  # a malformed id is refused (422) before it reaches the database
    order = await _order(sdb, ctx.account_id, order_id)
    try:
        patch = shop_orders.next_state(order, body.action)
    except shop_orders.ActionRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    now = datetime.now(timezone.utc).isoformat()

    if body.action == "check_payment":
        # Ask Razorpay; a confirmed payment is recorded and the customer is told by the usual payment message.
        links = await sdb.select("payment_links", {"id": order["payment_link_id"], "account_id": ctx.account_id}, limit=1)
        result = await shop_payments.reconcile(sdb, settings, bridge, links[0]) if links else "error"
        order = await _order(sdb, ctx.account_id, order_id)
        return {"order": order, "payment": result, "notified": result == "paid", "not_notified_reason": None}
    if body.action == "resend_link":
        try:
            order = await shop_orders.attach_link(sdb, settings, order)
        except shop_payments.PaymentLinkError as exc:
            raise HTTPException(exc.status, exc.message) from exc
    else:
        if body.action == "shipped" and body.tracking is not None:
            patch["tracking"] = body.tracking.strip()
        if body.action == "cancelled" and order["payment_status"] in ("awaiting", "expired") and order.get("payment_link_id"):
            # Close the unpaid link so the customer can't pay for a cancelled order.
            links = await sdb.select("payment_links", {"id": order["payment_link_id"]}, limit=1)
            if links and links[0].get("razorpay_link_id") and links[0]["status"] == "created":
                try:
                    _, keys = await shop_payments.connection_keys(sdb, settings, ctx.account_id, links[0].get("connection_id"))
                    await shop_payments.rzp_post(keys["key_id"], keys["key_secret"], f"/payment_links/{links[0]['razorpay_link_id']}/cancel", {})
                    await sdb.update("payment_links", {"id": links[0]["id"]}, {"status": "cancelled"})
                except Exception:  # noqa: BLE001 - the order is still cancelled here; Razorpay expires the link in 24 hours
                    pass
        patch["updated_at"] = now
        rows = await sdb.update("shop_orders", {"id": order_id, "account_id": ctx.account_id}, patch)
        order = rows[0] if rows else {**order, **patch}
        if body.action in ("shipped", "delivered", "cancelled"):
            await shop_orders.move_lead(sdb, ctx.account_id, order.get("lead_id"), body.action)

    notified, reason, via = False, None, None
    if body.notify:
        reason = await _may_message(sdb, ctx.account_id, order)
        pay = None
        if reason is None and body.action == "resend_link" and await wa_templates.window_open(sdb, order["conversation_id"]):
            pay = shop_orders.pay_button(await _shop_of(sdb, order), order)
        if pay:
            # The new link as a "Pay ₹…" button; the plain link below if WhatsApp refuses it.
            try:
                await bridge.call("send_pay_button", ctx.account_id, ctx.user.id, ctx.role, conversation_id=order["conversation_id"],
                                  text=f"🧾 #{order['number']}\n{pay['text']}", button=pay["label"], url=pay["url"])
                notified, via = True, "button"
            except Exception as exc:  # noqa: BLE001
                logging.getLogger("autoshift.orders").warning("pay button refused for order %s: %s", order_id, exc)
        if reason is None and not notified:
            shop = await _shop_of(sdb, order)
            # Free text inside WhatsApp's 24-hour window, else the approved order-update template.
            notified, reason, via = await wa_templates.deliver(
                sdb, bridge, account_id=ctx.account_id, user_id=ctx.user.id, role=ctx.role, conversation_id=order["conversation_id"],
                text=shop_orders.update_text(shop, order, body.action), kind="order",
                params=[order.get("customer_name") or "there", str(order["number"]), shop_orders.update_phrase(shop, order, body.action)],
                language=str(shop.get("language") or "en"), custom=shop_orders.chosen_template(shop, order, body.action),
            )

    await audit.record(sdb, scope="account", action=f"shop_order.{body.action}", actor_id=ctx.user.id, account_id=ctx.account_id, target=order_id, details={"number": order["number"], "notified": notified})
    await events.emit(sdb, ctx.account_id, "order.updated", {**shop_orders.public(order), "change": body.action})
    return {"order": order, "notified": notified, "not_notified_reason": reason, "sent_as": via}

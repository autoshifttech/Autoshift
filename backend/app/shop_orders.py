"""Orders the AI shop assistant takes on WhatsApp.

The assistant chats with the customer, helps them choose from the product list (Files page), asks
for the delivery name and address and the payment choice, reads the order back, and when the
customer confirms it ends its reply with one machine line:

    [ORDER]{"items":[{"code":"P001","qty":2}],"name":"…","address":"…","pay":"online","note":""}

AutoShift (not the AI) then prices it from the product list, adds the delivery charge, saves the
order, makes a Razorpay payment link on the business's own account (or confirms cash on delivery)
and adds a clear summary to the reply. The AI can never set a price, a discount or a link.
"""

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from . import audit, events, shop_payments
from .db import Db, DbError

log = logging.getLogger("autoshift.shop_orders")

ORDER_MARK = re.compile(r"\[ORDER\]\s*(\{.*\})\s*(?:\[/ORDER\])?", re.S)
MAX_LINES = 20
MAX_QTY = 99
FIRST_NUMBER = 1001
DUPLICATE_MINUTES = 15
# The stage a new order lands in on the Leads page (the "New order" stage in each app language).
NEW_ORDER_STAGES = {"new order", "new orders", "novo pedido", "nuevo pedido", "새 주문", "신규 주문"}
# Later stages an order's lead moves to, by stage name in each app language.
STAGE_NAMES = {
    "cod": {"cash on delivery", "cod", "pagamento na entrega", "pago contra entrega", "contra entrega", "착불", "착불 결제"},
    "shipped": {"shipped", "enviado", "enviada", "발송", "발송 완료", "배송 중"},
    "delivered": {"delivered", "entregue", "entregado", "entregada", "배송 완료"},
    "cancelled": {"cancelled", "canceled", "cancelado", "cancelada", "취소", "취소됨"},
}
# Product-list columns that hold stock; a 0 there means "out of stock".
STOCK_KEYS = {"stock", "in stock", "qty", "quantity", "available", "stock qty", "inventory", "estoque", "existencias", "재고"}

PAYMENT_STATUSES = ("awaiting", "paid", "cod", "expired", "refunded")
STATUSES = ("new", "packed", "shipped", "delivered", "cancelled")

# What AutoShift itself writes to the customer, in the shop's language.
TEXT: dict[str, dict[str, str]] = {
    "en": {
        "order": "🧾 Order #{n}", "delivery": "Delivery", "free": "Free", "total": "Total", "deliver_to": "Deliver to",
        "pay_link": "💳 Pay securely here (UPI, cards, net banking): {url}\nThe link works for 24 hours.",
        "cod": "💵 Cash on delivery: please keep ₹{total} ready.",
        "link_failed": "We couldn't make the payment link just now. Our team will send it to you shortly.",
        "problem": "I couldn't place the order yet: {reason} Please check and confirm again.",
        "unknown_product": "{code} is not in our product list.", "out_of_stock": "{name} is out of stock.",
        "no_items": "no products were chosen.", "no_address": "the delivery name and full address are missing.",
        "min_order": "the minimum order is ₹{min}.", "cod_max": "cash on delivery is available up to ₹{max}.",
        "pay_option": "that payment option isn't available.", "bad_order": "the order details were incomplete.",
        "packed": "📦 Your order #{n} is packed and will be on its way soon.",
        "shipped": "🚚 Your order #{n} has been shipped.", "tracking": "Track it here: {t}",
        "delivered": "✅ Your order #{n} has been delivered. Thank you for shopping with us!",
        "cancelled": "Your order #{n} has been cancelled.", "cancelled_paid": "We'll contact you about your refund.",
        "new_link": "💳 Here is a new payment link for order #{n} (₹{total}): {url}\nThe link works for 24 hours.",
    },
    "pt": {
        "order": "🧾 Pedido nº {n}", "delivery": "Entrega", "free": "Grátis", "total": "Total", "deliver_to": "Entregar para",
        "pay_link": "💳 Pague com segurança aqui (UPI, cartões, internet banking): {url}\nO link vale por 24 horas.",
        "cod": "💵 Pagamento na entrega: tenha ₹{total} em mãos.",
        "link_failed": "Não conseguimos gerar o link de pagamento agora. Nossa equipe vai enviá-lo em breve.",
        "problem": "Ainda não consegui fazer o pedido: {reason} Verifique e confirme novamente.",
        "unknown_product": "{code} não está na nossa lista de produtos.", "out_of_stock": "{name} está esgotado.",
        "no_items": "nenhum produto foi escolhido.", "no_address": "faltam o nome e o endereço completo de entrega.",
        "min_order": "o pedido mínimo é ₹{min}.", "cod_max": "o pagamento na entrega vale até ₹{max}.",
        "pay_option": "essa forma de pagamento não está disponível.", "bad_order": "os dados do pedido estavam incompletos.",
        "packed": "📦 Seu pedido nº {n} foi embalado e logo será enviado.",
        "shipped": "🚚 Seu pedido nº {n} foi enviado.", "tracking": "Acompanhe aqui: {t}",
        "delivered": "✅ Seu pedido nº {n} foi entregue. Obrigado pela compra!",
        "cancelled": "Seu pedido nº {n} foi cancelado.", "cancelled_paid": "Vamos entrar em contato sobre o reembolso.",
        "new_link": "💳 Aqui está um novo link de pagamento do pedido nº {n} (₹{total}): {url}\nO link vale por 24 horas.",
    },
    "es": {
        "order": "🧾 Pedido n.º {n}", "delivery": "Envío", "free": "Gratis", "total": "Total", "deliver_to": "Entregar a",
        "pay_link": "💳 Paga de forma segura aquí (UPI, tarjetas, banca en línea): {url}\nEl enlace vale 24 horas.",
        "cod": "💵 Pago contra entrega: ten listos ₹{total}.",
        "link_failed": "No pudimos crear el enlace de pago ahora. Nuestro equipo te lo enviará pronto.",
        "problem": "Aún no pude hacer el pedido: {reason} Revísalo y confírmalo de nuevo.",
        "unknown_product": "{code} no está en nuestra lista de productos.", "out_of_stock": "{name} está agotado.",
        "no_items": "no se eligió ningún producto.", "no_address": "faltan el nombre y la dirección completa de entrega.",
        "min_order": "el pedido mínimo es ₹{min}.", "cod_max": "el pago contra entrega está disponible hasta ₹{max}.",
        "pay_option": "esa forma de pago no está disponible.", "bad_order": "los datos del pedido estaban incompletos.",
        "packed": "📦 Tu pedido n.º {n} está empacado y saldrá pronto.",
        "shipped": "🚚 Tu pedido n.º {n} fue enviado.", "tracking": "Síguelo aquí: {t}",
        "delivered": "✅ Tu pedido n.º {n} fue entregado. ¡Gracias por tu compra!",
        "cancelled": "Tu pedido n.º {n} fue cancelado.", "cancelled_paid": "Te contactaremos por el reembolso.",
        "new_link": "💳 Aquí tienes un nuevo enlace de pago del pedido n.º {n} (₹{total}): {url}\nEl enlace vale 24 horas.",
    },
    "ko": {
        "order": "🧾 주문 #{n}", "delivery": "배송비", "free": "무료", "total": "합계", "deliver_to": "배송지",
        "pay_link": "💳 여기에서 안전하게 결제하세요 (UPI, 카드, 인터넷 뱅킹): {url}\n링크는 24시간 동안 유효합니다.",
        "cod": "💵 착불 결제: ₹{total}을(를) 준비해 주세요.",
        "link_failed": "지금은 결제 링크를 만들 수 없습니다. 곧 담당자가 보내 드리겠습니다.",
        "problem": "아직 주문을 접수하지 못했습니다: {reason} 확인 후 다시 확정해 주세요.",
        "unknown_product": "{code}은(는) 상품 목록에 없습니다.", "out_of_stock": "{name}은(는) 품절입니다.",
        "no_items": "선택한 상품이 없습니다.", "no_address": "받는 분 이름과 전체 주소가 없습니다.",
        "min_order": "최소 주문 금액은 ₹{min}입니다.", "cod_max": "착불 결제는 ₹{max}까지 가능합니다.",
        "pay_option": "해당 결제 방법은 사용할 수 없습니다.", "bad_order": "주문 정보가 불완전합니다.",
        "packed": "📦 주문 #{n}의 포장이 끝났으며 곧 발송됩니다.",
        "shipped": "🚚 주문 #{n}이(가) 발송되었습니다.", "tracking": "배송 조회: {t}",
        "delivered": "✅ 주문 #{n}이(가) 배송 완료되었습니다. 구매해 주셔서 감사합니다!",
        "cancelled": "주문 #{n}이(가) 취소되었습니다.", "cancelled_paid": "환불에 대해 연락드리겠습니다.",
        "new_link": "💳 주문 #{n}의 새 결제 링크입니다 (₹{total}): {url}\n링크는 24시간 동안 유효합니다.",
    },
}


class OrderProblem(Exception):
    def __init__(self, key: str, **values):
        super().__init__(key)
        self.key, self.values = key, values


def words(shop: dict) -> dict[str, str]:
    return TEXT.get(str(shop.get("language") or "en"), TEXT["en"])


def paise(rupees: float | int | str) -> int:
    try:
        return max(0, int(round(float(rupees) * 100)))
    except (TypeError, ValueError):
        return 0


def rs(p: int) -> str:
    return shop_payments.rupees(p)


def shop_on(assistant: dict) -> bool:
    return bool((assistant.get("shop") or {}).get("enabled"))


# ------------------------------------------------------------------ what the AI is told
def instructions(shop: dict) -> str:
    """The checkout steps for the assistant's system prompt."""
    fee, free_above, min_order, cod_max = (paise(shop.get(k, 0)) for k in ("delivery_fee", "free_above", "min_order", "cod_max"))
    if not fee:
        delivery = "delivery is free"
    elif free_above:
        delivery = f"delivery costs ₹{rs(fee)}, free for orders of ₹{rs(free_above)} or more"
    else:
        delivery = f"delivery costs ₹{rs(fee)}"
    options = []
    if shop.get("online", True):
        options.append('online payment through a secure Razorpay link (UPI, cards, net banking) — "pay":"online"')
    if shop.get("cod", True):
        options.append('cash on delivery' + (f" (only for orders up to ₹{rs(cod_max)})" if cod_max else "") + ' — "pay":"cod"')
    if not options:
        options.append('online payment — "pay":"online"')
    lines = [
        "You also take orders in this chat. Follow these steps:",
        "1. Help the customer choose products from the product list and the quantity of each.",
        f"2. Tell them the price of each item and the total; {delivery}." + (f" The minimum order is ₹{rs(min_order)}." if min_order else ""),
        "   For a product with sizes or colours, ask which size or colour for each item (they can differ per item).",
        "3. Ask for their full name and full delivery address with PIN code.",
        "4. Ask how they want to pay: " + "; or ".join(options) + ".",
        "5. Read the whole order back (items, quantities, total, name, address, payment) and ask them to confirm.",
        "6. Only after they clearly confirm, end your reply with one line in exactly this form, and nothing after it:",
        '[ORDER]{"items":[{"code":"P001","qty":2,"option":"M"},{"code":"P007","qty":1,"option":"Black"}],"name":"Full name","address":"Full address with PIN code","pay":"online","note":""}',
        'Put the chosen size or colour in "option" ("" when the product has none). One item per code and option.',
        "Use only codes from the product list. Never change a price, never give a discount, never write a payment link "
        "yourself: AutoShift adds the order summary and the payment link to your reply. Keep your own text short when you place the order.",
        "If they ask about an order they already placed, answer from their orders listed below; for anything else about it, say a person from the team will help.",
    ]
    if shop.get("delivery_note"):
        lines.append(f"Delivery information to share when asked: {shop['delivery_note']}")
    return "\n".join(lines)


def describe_orders(orders: list[dict]) -> str:
    out = []
    for o in orders:
        items = ", ".join(f"{i['qty']} × {item_label(i)}" for i in o.get("items") or [])
        line = f"- Order #{o['number']} ({str(o.get('created_at', ''))[:10]}): {items}; total ₹{rs(int(o['total_paise']))}; payment: {o['payment_status']}; status: {o['status']}"
        if o.get("tracking"):
            line += f"; tracking: {o['tracking']}"
        if o.get("payment_status") == "awaiting" and o.get("payment_url"):
            line += f"; payment link: {o['payment_url']}"
        out.append(line)
    return "This customer's recent orders:\n" + "\n".join(out) if out else "This customer has no earlier orders."


async def recent_orders(sdb: Db, account_id: str, contact_id: str | None, limit: int = 3) -> list[dict]:
    if not contact_id:
        return []
    return await sdb.select("shop_orders", {"account_id": account_id, "contact_id": contact_id}, order="created_at.desc", limit=limit)


# ------------------------------------------------------------------ reading the AI's order line
def extract(text: str) -> tuple[str, dict | None]:
    """(reply without the order line, the order request or None)."""
    m = ORDER_MARK.search(text or "")
    if not m:
        return text, None
    clean = (text[: m.start()] + text[m.end():]).strip()
    try:
        data = json.loads(m.group(1))
    except ValueError:
        data = None
    return clean, data if isinstance(data, dict) else {"_bad": True}


def _norm(code: str) -> str:
    return re.sub(r"\s+", "", str(code or "").lower())


def _stock(product: dict) -> int | None:
    for k, v in (product.get("details") or {}).items():
        if str(k).strip().lower() in STOCK_KEYS:
            digits = re.sub(r"[^\d]", "", str(v))
            if digits:
                return int(digits)
            if str(v).strip().lower() in ("no", "out of stock", "sold out", "não", "agotado", "품절"):
                return 0
    return None


def price(products: list[dict], shop: dict, req: dict) -> dict:
    """Price the order from the product list. Raises OrderProblem with what is wrong."""
    if req.get("_bad"):
        raise OrderProblem("bad_order")
    by_code = {_norm(p["code"]): p for p in products}
    lines: dict[str, dict] = {}
    raw_items = req.get("items") if isinstance(req.get("items"), list) else []
    for item in raw_items[:MAX_LINES]:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "").strip()
        product = by_code.get(_norm(code))
        if not product:
            raise OrderProblem("unknown_product", code=code[:20] or "?")
        try:
            qty = int(float(item.get("qty") or 1))
        except (TypeError, ValueError):
            qty = 1
        qty = max(1, min(MAX_QTY, qty))
        option = re.sub(r"\s+", " ", str(item.get("option") or item.get("size") or item.get("colour") or item.get("color") or "")).strip()[:40]
        key = f"{_norm(product['code'])}|{option.lower()}"
        if key in lines:
            lines[key]["qty"] = min(MAX_QTY, lines[key]["qty"] + qty)
        else:
            lines[key] = {"code": product["code"], "name": product["name"], "option": option, "qty": qty, "price_paise": paise(product["price"])}
        stock = _stock(product)
        same_code = sum(line["qty"] for line in lines.values() if line["code"] == product["code"])
        if stock is not None and same_code > stock:
            raise OrderProblem("out_of_stock", name=product["name"])
    if not lines:
        raise OrderProblem("no_items")
    name = str(req.get("name") or "").strip()[:120]
    address = str(req.get("address") or "").strip()[:600]
    if not name or len(address) < 8:
        raise OrderProblem("no_address")

    online, cod = bool(shop.get("online", True)), bool(shop.get("cod", True))
    pay = str(req.get("pay") or "").strip().lower()
    pay = "cod" if pay in ("cod", "cash", "cash on delivery") else "online" if pay in ("online", "upi", "card", "link") else pay
    if online and not cod:
        pay = "online"
    elif cod and not online:
        pay = "cod"
    elif pay not in ("online", "cod"):
        raise OrderProblem("pay_option")

    items = [{**line, "total_paise": line["price_paise"] * line["qty"]} for line in lines.values()]
    subtotal = sum(i["total_paise"] for i in items)
    if subtotal < paise(shop.get("min_order", 0)):
        raise OrderProblem("min_order", min=rs(paise(shop.get("min_order", 0))))
    fee, free_above = paise(shop.get("delivery_fee", 0)), paise(shop.get("free_above", 0))
    delivery = 0 if (free_above and subtotal >= free_above) else fee
    total = subtotal + delivery
    cod_max = paise(shop.get("cod_max", 0))
    if pay == "cod" and cod_max and total > cod_max:
        raise OrderProblem("cod_max", max=rs(cod_max))
    if pay == "online" and total < shop_payments.MIN_PAISE:
        raise OrderProblem("bad_order")
    return {
        "items": items, "subtotal_paise": subtotal, "delivery_paise": delivery, "total_paise": total,
        "customer_name": name, "address": address, "note": str(req.get("note") or "").strip()[:300], "payment_method": pay,
    }


def problem_text(shop: dict, exc: OrderProblem) -> str:
    w = words(shop)
    return w["problem"].format(reason=w[exc.key].format(**exc.values))


def summary(shop: dict, order: dict, *, link_failed: bool = False) -> str:
    w = words(shop)
    lines = [w["order"].format(n=order.get("number", "—"))]
    for i in order["items"]:
        lines.append(f"{i['qty']} × {item_label(i)} ({i['code']}) — ₹{rs(i['total_paise'])}")
    lines.append(f"{w['delivery']} — " + (f"₹{rs(order['delivery_paise'])}" if order["delivery_paise"] else w["free"]))
    lines.append(f"*{w['total']}: ₹{rs(order['total_paise'])}*")
    lines.append(f"{w['deliver_to']}: {order['customer_name']}, {order['address']}")
    lines.append("")
    if order["payment_method"] == "cod":
        lines.append(w["cod"].format(total=rs(order["total_paise"])))
    elif order.get("payment_url"):
        lines.append(w["pay_link"].format(url=order["payment_url"]))
    elif link_failed:
        lines.append(w["link_failed"])
    return "\n".join(lines).strip()


# ------------------------------------------------------------------ placing it
def item_label(item: dict) -> str:
    return f"{item['name']} ({item['option']})" if item.get("option") else item["name"]


def _description(number: int, items: list[dict]) -> str:
    return f"Order #{number}: " + ", ".join(f"{i['qty']} × {item_label(i)}" for i in items)


async def _next_number(sdb: Db, account_id: str) -> int:
    last = await sdb.select("shop_orders", {"account_id": account_id}, order="number.desc", limit=1)
    return max(FIRST_NUMBER, int(last[0]["number"]) + 1) if last else FIRST_NUMBER


async def _new_lead(sdb: Db, account_id: str, contact_id: str | None, conversation_id: str | None, number: int, total_paise: int) -> str | None:
    """A lead in the "New order" stage of the business's order pipeline, when there is one."""
    if not contact_id:
        return None
    try:
        pipelines = await sdb.select("pipelines", {"account_id": account_id})
        if not pipelines:
            return None
        stages = await sdb.select("pipeline_stages", {"pipeline_id": ("in", [p["id"] for p in pipelines])})
        stage = next((s for s in stages if str(s.get("name", "")).strip().lower() in NEW_ORDER_STAGES), None)
        if not stage:
            return None
        accounts = await sdb.select("accounts", {"id": account_id}, limit=1)
        owner = accounts[0].get("owner_user_id") if accounts else None
        if not owner:
            return None
        deal = await sdb.insert("deals", {
            "account_id": account_id, "user_id": owner, "pipeline_id": stage["pipeline_id"], "stage_id": stage["id"],
            "contact_id": contact_id, "conversation_id": conversation_id, "title": f"Order #{number}",
            "value": total_paise / 100, "currency": "INR",
        })
        return deal["id"]
    except Exception as exc:  # the order matters more than the lead card
        log.warning("could not add the order lead for %s: %s", account_id, exc)
        return None


async def move_lead(sdb: Db, account_id: str, lead_id: str | None, key: str) -> bool:
    """Move the order's lead to the stage for this step, when the pipeline has one with that name."""
    if not lead_id or key not in STAGE_NAMES:
        return False
    try:
        deals = await sdb.select("deals", {"id": lead_id, "account_id": account_id}, limit=1)
        if not deals:
            return False
        stages = await sdb.select("pipeline_stages", {"pipeline_id": deals[0]["pipeline_id"]})
        stage = next((st for st in stages if str(st.get("name", "")).strip().lower() in STAGE_NAMES[key]), None)
        if not stage:
            return False
        await sdb.update("deals", {"id": lead_id, "account_id": account_id}, {"stage_id": stage["id"]})
        return True
    except Exception as exc:
        log.warning("could not move the order lead %s: %s", lead_id, exc)
        return False


async def attach_link(sdb: Db, settings, order: dict) -> dict:
    """Make the Razorpay link for an online order. Raises PaymentLinkError."""
    link = await shop_payments.create_link(
        sdb, settings, account_id=order["account_id"], connection_id=None, amount=str(order["total_paise"] / 100),
        description=_description(order["number"], order["items"]), contact_id=order.get("contact_id"),
        conversation_id=order.get("conversation_id"), lead_id=order.get("lead_id"),
        customer_name=order.get("customer_name"), customer_phone=order.get("customer_phone"),
    )
    patch = {"payment_link_id": link["id"], "payment_url": link["short_url"], "payment_status": "awaiting", "updated_at": _now()}
    await sdb.update("shop_orders", {"id": order["id"]}, patch)
    await sdb.update("payment_links", {"id": link["id"]}, {"order_id": order["id"]})
    return {**order, **patch}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _duplicate(sdb: Db, account_id: str, conversation_id: str | None, priced: dict) -> dict | None:
    """The same order placed in this chat a few minutes ago (the customer said "yes" twice)."""
    if not conversation_id:
        return None
    since = (datetime.now(timezone.utc) - timedelta(minutes=DUPLICATE_MINUTES)).isoformat()
    rows = await sdb.select("shop_orders", {"account_id": account_id, "conversation_id": conversation_id, "status": "new", "created_at": ("gte", since)}, order="created_at.desc", limit=5)
    key = lambda items: sorted((i["code"], str(i.get("option") or "").lower(), i["qty"]) for i in items)
    for row in rows:
        if key(row.get("items") or []) == key(priced["items"]) and row["payment_method"] == priced["payment_method"] and int(row["total_paise"]) == priced["total_paise"]:
            return row
    return None


async def place(sdb: Db, settings, *, assistant: dict, products: list[dict], req: dict, conversation_id: str | None,
                contact_id: str | None, customer_phone: str | None) -> tuple[str, dict | None]:
    """Save the order the AI confirmed. Returns (text to add to the reply, the order or None)."""
    shop = assistant.get("shop") or {}
    account_id = assistant["account_id"]
    try:
        priced = price(products, shop, req)
    except OrderProblem as exc:
        return problem_text(shop, exc), None

    same = await _duplicate(sdb, account_id, conversation_id, priced)
    if same:
        return summary(shop, same), same

    number = await _next_number(sdb, account_id)
    lead_id = await _new_lead(sdb, account_id, contact_id, conversation_id, number, priced["total_paise"])
    row = {
        "account_id": account_id, "assistant_id": assistant.get("id"), "conversation_id": conversation_id,
        "contact_id": contact_id, "lead_id": lead_id, "customer_phone": re.sub(r"[^\d+]", "", customer_phone or "")[:20],
        "payment_status": "cod" if priced["payment_method"] == "cod" else "awaiting", "status": "new", **priced,
    }
    order = None
    for attempt in range(3):  # two chats ordering at the same moment can want the same number
        try:
            order = await sdb.insert("shop_orders", {**row, "number": number + attempt})
            break
        except DbError as exc:
            if attempt == 2 or exc.status not in (409, 400):
                raise
    assert order is not None

    link_failed = False
    if order["payment_method"] == "online":
        try:
            order = await attach_link(sdb, settings, order)
        except shop_payments.PaymentLinkError as exc:
            link_failed = True
            log.warning("payment link failed for order %s: %s", order["id"], exc.message)
            await audit.record(sdb, scope="account", action="shop_order.link_failed", actor_id=None, account_id=account_id, target=order["id"], details={"reason": exc.message})

    if order["payment_method"] == "cod":
        await move_lead(sdb, account_id, order.get("lead_id"), "cod")
    await audit.record(sdb, scope="account", action="shop_order.create", actor_id=None, account_id=account_id, target=order["id"], details={"number": order["number"], "total_paise": order["total_paise"], "payment": order["payment_method"]})
    await events.emit(sdb, account_id, "order.created", public(order))
    return summary(shop, order, link_failed=link_failed), order


def public(order: dict) -> dict:
    keys = ("id", "number", "status", "payment_status", "payment_method", "items", "subtotal_paise", "delivery_paise", "total_paise",
            "customer_name", "customer_phone", "address", "note", "tracking", "payment_url", "contact_id", "conversation_id", "lead_id", "created_at", "paid_at")
    return {k: order.get(k) for k in keys}


# ------------------------------------------------------------------ updates from payments
async def payment_received(sdb: Db, order_id: str | None) -> None:
    if not order_id:
        return
    rows = await sdb.update("shop_orders", {"id": order_id}, {"payment_status": "paid", "paid_at": _now(), "updated_at": _now()})
    if rows:
        await events.emit(sdb, rows[0]["account_id"], "order.updated", {**public(rows[0]), "change": "paid"})


async def payment_expired(sdb: Db, order_id: str | None) -> None:
    if not order_id:
        return
    rows = await sdb.select("shop_orders", {"id": order_id}, limit=1)
    if rows and rows[0]["payment_status"] == "awaiting":
        await sdb.update("shop_orders", {"id": order_id}, {"payment_status": "expired", "updated_at": _now()})


# ------------------------------------------------------------------ the business moves an order on
ACTIONS = ("packed", "shipped", "delivered", "cancelled", "resend_link", "check_payment")


class ActionRefused(Exception):
    pass


def next_state(order: dict, action: str) -> dict:
    """The change an action makes, or ActionRefused with the reason."""
    status, paid = order["status"], order["payment_status"]
    settled = paid in ("paid", "cod")
    if status == "cancelled":
        raise ActionRefused("This order is cancelled")
    if action == "cancelled":
        if status == "delivered":
            raise ActionRefused("A delivered order can't be cancelled")
        return {"status": "cancelled"}
    if action == "check_payment":
        if order["payment_method"] != "online" or not order.get("payment_link_id"):
            raise ActionRefused("This order has no payment link to check")
        return {}
    if action == "resend_link":
        if order["payment_method"] != "online" or paid not in ("awaiting", "expired"):
            raise ActionRefused("Only an unpaid online order needs a new payment link")
        return {}
    if not settled:
        raise ActionRefused("Wait for the payment before moving this order on")
    order_of = {"new": 0, "packed": 1, "shipped": 2, "delivered": 3}
    if order_of[action] <= order_of[status]:
        raise ActionRefused(f"This order is already {status}")
    patch: dict = {"status": action}
    if action == "delivered" and paid == "cod":
        patch.update({"payment_status": "paid", "paid_at": _now()})  # the cash was collected at the door
    return patch


def update_text(shop: dict, order: dict, action: str) -> str:
    w = words(shop)
    n, total = order["number"], rs(int(order["total_paise"]))
    if action == "shipped":
        return w["shipped"].format(n=n) + (f"\n{w['tracking'].format(t=order['tracking'])}" if order.get("tracking") else "")
    if action == "cancelled":
        return w["cancelled"].format(n=n) + (f" {w['cancelled_paid']}" if order["payment_status"] == "paid" else "")
    if action == "check_payment":
        if order["payment_method"] != "online" or not order.get("payment_link_id"):
            raise ActionRefused("This order has no payment link to check")
        return {}
    if action == "resend_link":
        return w["new_link"].format(n=n, total=total, url=order.get("payment_url") or "")
    return w[action].format(n=n)

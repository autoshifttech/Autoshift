"""More staff tools for the MCP server: daily and growth reports, trials ending, churn risk,
business search and timeline, one business's WhatsApp, payment details and refunds, new plans,
billing settings, message failures, AI model add/remove, phone verification settings, custom
tools and API keys across the platform.

Nothing here returns a secret (tokens and key hashes are never read out) and nothing grants admin
access. Changes are recorded in the audit log.
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import audit, key_limits
from ..deps import Bridge, PlatformAdmin, ServiceDb, get_platform_admin, require_platform_role
from ..web_bridge import BridgeError
from .businesses import _views
from .platform_ops import _chunks, _conv_accounts, _names

router = APIRouter(prefix="/v1/platform", tags=["platform-more"])

AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]
Finance = Annotated[PlatformAdmin, Depends(require_platform_role("finance"))]
SuperOnly = Annotated[PlatformAdmin, Depends(require_platform_role())]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _since(days: float) -> str:
    return (_now() - timedelta(days=days)).isoformat()


def _rupees(paise: int | float) -> float:
    return round((paise or 0) / 100, 2)


# ------------------------------------------------------------------ reports
@router.get("/reports/daily")
@key_limits.cached_for_keys()
async def daily_report(_: AnyStaff, sdb: ServiceDb, hours: int = Query(24, ge=1, le=168)):
    """The last day at a glance: new businesses, money in, AI replies, failed payments and sends, support."""
    since = _since(hours / 24)
    names = await _names(sdb)
    new_accounts = [a for a in await sdb.select("accounts", {"created_at": ("gte", since)}, limit=2000)]
    paid = await sdb.select("payment_orders", {"status": "paid", "paid_at": ("gte", since)}, limit=5000)
    invoices = await sdb.select("invoices", {"issued_at": ("gte", since)}, limit=5000)
    failed_pay = await sdb.select("payment_orders", {"status": "failed", "created_at": ("gte", since)}, limit=2000)
    tickets = await sdb.select("support_tickets", {"created_at": ("gte", since)}, limit=2000)
    open_tickets = await sdb.count("support_tickets", {"status": "open"})
    return {
        "hours": hours,
        "new_businesses": [{"account_id": a["id"], "name": a["name"]} for a in new_accounts],
        "top_ups": {"count": len(paid), "rupees_before_gst": _rupees(sum(p["base_paise"] for p in paid))},
        "invoiced_rupees": _rupees(sum(int(i.get("total_paise") or 0) for i in invoices)),
        "failed_payments": [{"business": names.get(p["account_id"], ""), "rupees": _rupees(p["total_paise"])} for p in failed_pay][:20],
        "ai_replies": await sdb.count("ai_usage_log", None, since=("created_at", since)),
        "failed_messages": len(await sdb.select("messages", {"status": "failed", "created_at": ("gte", since)}, limit=5000)),
        "new_tickets": len(tickets),
        "open_tickets": open_tickets,
    }


@router.get("/reports/growth")
@key_limits.cached_for_keys()
async def growth_report(_: AnyStaff, sdb: ServiceDb, months: int = Query(6, ge=1, le=24)):
    """Per month: new businesses, trials started, paying businesses now, MRR now, and churn."""
    accounts = await sdb.select("accounts", limit=20000)
    views = await _views(sdb, accounts)
    start = (_now().replace(day=1) - timedelta(days=31 * (months - 1))).strftime("%Y-%m")
    by_month: dict[str, int] = defaultdict(int)
    for a in accounts:
        m = str(a.get("created_at") or "")[:7]
        if m >= start:
            by_month[m] += 1
    statuses = Counter(v["subscription_status"] or "none" for v in views)
    return {
        "signups_by_month": dict(sorted(by_month.items())),
        "businesses": len(accounts),
        "by_subscription_status": dict(statuses),
        "paying": statuses.get("active", 0),
        "mrr_rupees": _rupees(sum(v["mrr_paise"] for v in views)),
        "trial_to_paid_rate": round(statuses.get("active", 0) / max(1, statuses.get("active", 0) + statuses.get("expired", 0) + statuses.get("cancelled", 0)), 3),
    }


@router.get("/reports/trials-ending")
async def trials_ending(_: AnyStaff, sdb: ServiceDb, days: int = Query(7, ge=1, le=60)):
    """Businesses whose free trial ends within `days`, soonest first, with how active they are."""
    until = (_now() + timedelta(days=days)).isoformat()
    subs = [s for s in await sdb.select("subscriptions", {"status": "trialing", "trial_ends_at": ("lte", until)}) if str(s["trial_ends_at"]) >= _now().isoformat()]
    accounts = {a["id"]: a for a in await sdb.select("accounts", {"id": ("in", [s["account_id"] for s in subs])})} if subs else {}
    views = {v["id"]: v for v in await _views(sdb, list(accounts.values()))}
    out = [{"account_id": s["account_id"], "business": accounts.get(s["account_id"], {}).get("name"), "trial_ends_at": s["trial_ends_at"], "plan_id": s["plan_id"], "owner": views.get(s["account_id"], {}).get("owner"), "usage_30d": views.get(s["account_id"], {}).get("usage_30d"), "whatsapp_connected": bool(await sdb.select("whatsapp_config", {"account_id": s["account_id"]}, limit=1))} for s in subs]
    return sorted(out, key=lambda r: str(r["trial_ends_at"]))


@router.get("/reports/churn-risk")
@key_limits.cached_for_keys()
async def churn_risk(_: AnyStaff, sdb: ServiceDb, quiet_days: int = Query(14, ge=3, le=90)):
    """Paying or trial businesses showing signs of leaving: no chats lately, empty wallet, cancelling,
    past due, or WhatsApp not connected. Each with the reasons."""
    views = await _views(sdb, await sdb.select("accounts", limit=20000))
    convs = await sdb.select("conversations", {"last_message_at": ("gte", _since(quiet_days))}, limit=20000)
    active = {c["account_id"] for c in convs}
    connected = {c["account_id"] for c in await sdb.select("whatsapp_config") if c.get("status") == "connected"}
    out = []
    for v in views:
        if v["subscription_status"] not in ("active", "trialing", "past_due") or v["status"] != "active":
            continue
        reasons = []
        if v["id"] not in active:
            reasons.append(f"no chats in {quiet_days} days")
        if v["subscription_status"] == "past_due":
            reasons.append("payment past due")
        if v["cancel_at_period_end"]:
            reasons.append("cancelling at period end")
        if v["wallet_paise"] <= 0:
            reasons.append("wallet empty")
        if v["id"] not in connected:
            reasons.append("WhatsApp not connected")
        if reasons:
            out.append({"account_id": v["id"], "business": v["name"], "plan_id": v["plan_id"], "subscription_status": v["subscription_status"], "mrr_rupees": _rupees(v["mrr_paise"]), "owner": v["owner"], "reasons": reasons})
    return sorted(out, key=lambda r: (-len(r["reasons"]), -r["mrr_rupees"]))


# ------------------------------------------------------------------ businesses
@router.get("/businesses-search")
async def business_search(_: AnyStaff, sdb: ServiceDb, q: str = Query(..., min_length=2, max_length=100), limit: int = Query(20, ge=1, le=100)):
    """Find a business by its name, an owner's or member's name or email, or its WhatsApp number."""
    term = q.strip().lower()
    digits = "".join(c for c in term if c.isdigit())
    ids: list[str] = []
    for a in await sdb.select("accounts", {"name": ("ilike", f"*{term}*")}, limit=limit):
        ids.append(a["id"])
    for p in await sdb.select("profiles", limit=20000):
        if p.get("account_id") and (term in (p.get("email") or "").lower() or term in (p.get("full_name") or "").lower() or (len(digits) >= 6 and digits in (p.get("phone") or ""))):
            ids.append(p["account_id"])
    if len(digits) >= 6:
        for c in await sdb.select("whatsapp_config"):
            if digits in "".join(ch for ch in str(c.get("display_phone_number") or "") if ch.isdigit()):
                ids.append(c["account_id"])
    ids = list(dict.fromkeys(i for i in ids if i))[:limit]
    accounts = await sdb.select("accounts", {"id": ("in", ids)}) if ids else []
    return await _views(sdb, accounts)


@router.get("/businesses/{account_id}/timeline")
async def business_timeline(account_id: str, _: AnyStaff, sdb: ServiceDb, days: int = Query(30, ge=1, le=365), limit: int = Query(100, ge=1, le=300)):
    """What happened to one business, newest first: changes (audit log), payments, invoices and support requests."""
    if not await sdb.select("accounts", {"id": account_id}, limit=1):
        raise HTTPException(404, "Business not found")
    since = _since(days)
    events: list[dict] = []
    for r in await sdb.select("audit_log", {"account_id": account_id, "created_at": ("gte", since)}, order="created_at.desc", limit=limit):
        events.append({"at": r.get("created_at"), "kind": "change", "what": r.get("action"), "by": r.get("actor_id"), "target": r.get("target")})
    for p in await sdb.select("payment_orders", {"account_id": account_id, "created_at": ("gte", since)}, limit=limit):
        events.append({"at": p.get("paid_at") or p.get("created_at"), "kind": "payment", "what": f"top-up {p['status']}", "rupees": _rupees(p["total_paise"])})
    for t in await sdb.select("support_tickets", {"account_id": account_id, "created_at": ("gte", since)}, limit=limit):
        events.append({"at": t.get("created_at"), "kind": "support", "what": f"T-{t.get('number')} {t.get('subject') or ''}".strip(), "status": t.get("status")})
    events.sort(key=lambda e: str(e["at"]), reverse=True)
    return events[:limit]


@router.get("/businesses/{account_id}/whatsapp")
async def business_whatsapp(account_id: str, _: AnyStaff, sdb: ServiceDb):
    """One business's WhatsApp connection: number, status, registration errors, templates and recent failures (no tokens)."""
    if not await sdb.select("accounts", {"id": account_id}, limit=1):
        raise HTTPException(404, "Business not found")
    cfg = (await sdb.select("whatsapp_config", {"account_id": account_id}, limit=1)) or [None]
    c = cfg[0]
    templates = Counter(t.get("status") for t in await sdb.select("message_templates", {"account_id": account_id}))
    convs = [x["id"] for x in await sdb.select("conversations", {"account_id": account_id}, limit=2000)]
    failed: Counter = Counter()
    for part in _chunks(convs):
        for m in await sdb.select("messages", {"conversation_id": ("in", part), "status": "failed", "created_at": ("gte", _since(7))}, limit=2000):
            failed[m.get("error_title") or f"error {m.get('error_code')}"] += 1
    safe = ("status", "phone_number_id", "waba_id", "display_phone_number", "verified_name", "quality_rating", "connected_at", "last_registration_error")
    return {"connected": bool(c and c.get("status") == "connected"), "config": {k: c.get(k) for k in safe} if c else None, "templates": dict(templates), "failed_messages_7d": sum(failed.values()), "top_errors": [{"error": e, "count": n} for e, n in failed.most_common(5)]}


# ------------------------------------------------------------------ money
@router.get("/payments/{payment_ref}")
async def payment_get(payment_ref: str, _: Finance, sdb: ServiceDb):
    """One top-up by its Razorpay payment id, order id or our id, with the business and invoice."""
    row = None
    for col in ("razorpay_payment_id", "razorpay_order_id", "id"):
        try:
            found = await sdb.select("payment_orders", {col: payment_ref}, limit=1)
        except Exception:  # noqa: BLE001 - a non-uuid id on the uuid column
            found = []
        if found:
            row = found[0]
            break
    if not row:
        raise HTTPException(404, "Payment not found")
    names = await _names(sdb)
    invoice = await sdb.select("invoices", {"account_id": row["account_id"], "razorpay_payment_id": row.get("razorpay_payment_id")}, limit=1) if row.get("razorpay_payment_id") else []
    refunds = [r for r in await sdb.select("audit_log", {"action": "payment.refund", "account_id": row["account_id"]}, order="created_at.desc", limit=50) if r.get("target") == row.get("razorpay_payment_id")]
    return {
        "id": row["id"], "business": names.get(row["account_id"]), "account_id": row["account_id"], "status": row["status"],
        "rupees_before_gst": _rupees(row["base_paise"]), "gst_rupees": _rupees(row["gst_paise"]), "total_rupees": _rupees(row["total_paise"]),
        "razorpay_payment_id": row.get("razorpay_payment_id"), "razorpay_order_id": row.get("razorpay_order_id"),
        "created_at": row.get("created_at"), "paid_at": row.get("paid_at"),
        "invoice": {k: invoice[0].get(k) for k in ("number", "issued_at", "total_paise")} if invoice else None,
        "refunds": [{"at": r.get("created_at"), **(r.get("details") or {})} for r in refunds],
    }


@router.get("/refunds")
async def refunds_list(_: Finance, sdb: ServiceDb, days: int = Query(90, ge=1, le=730)):
    """Refunds staff started, newest first (from the audit log), with the business."""
    names = await _names(sdb)
    rows = await sdb.select("audit_log", {"action": "payment.refund", "created_at": ("gte", _since(days))}, order="created_at.desc", limit=500)
    return [{"at": r.get("created_at"), "business": names.get(r.get("account_id")), "payment_id": r.get("target"), "by": r.get("actor_id"), **{k: (r.get("details") or {}).get(k) for k in ("amount_paise", "reason", "refund_id")}} for r in rows]


class PlanCreate(BaseModel):
    id: str = Field(..., pattern=r"^[a-z][a-z0-9_-]{1,30}$", description="Short id, e.g. 'business'")
    name: str = Field(..., min_length=1, max_length=40)
    monthly_paise: int = Field(..., gt=0, le=100_000_000)
    seats: int | None = Field(None, ge=1, le=1000)
    contacts: int | None = Field(None, ge=1)
    ai_replies: int = Field(..., ge=0)
    active: bool = Field(False, description="Hidden from customers until you switch it on")


@router.post("/plans", status_code=201)
async def plan_create(body: PlanCreate, admin: SuperOnly, sdb: ServiceDb):
    if await sdb.select("plans", {"id": body.id}, limit=1):
        raise HTTPException(409, "A plan with that id already exists")
    row = await sdb.insert("plans", {**body.model_dump(), "popular": False})
    await audit.record(sdb, scope="platform", action="plan.create", actor_id=admin.user.id, target=body.id, details=body.model_dump())
    return row


@router.get("/billing-settings")
async def billing_settings(_: AnyStaff, sdb: ServiceDb):
    """Who pays Meta's fees, the per-message and AI rates, plans and API key limits, in one place."""
    from .. import wallet

    settings = {r["key"]: r.get("value") for r in await sdb.select("platform_settings") if r["key"] in ("meta_fees", "rates", "api_key_limits")}
    return {"meta_fees": settings.get("meta_fees"), "rates_paise": await wallet.rates(sdb), "api_key_limits_per_day": await key_limits.limits(sdb), "plans": await sdb.select("plans", order="monthly_paise.asc")}


# ------------------------------------------------------------------ WhatsApp and AI
@router.get("/message-failures")
async def message_failures(_: AnyStaff, sdb: ServiceDb, hours: int = Query(24, ge=1, le=168), account_id: str | None = None):
    """Failed WhatsApp sends across the platform, grouped by error and by business."""
    failed = await sdb.select("messages", {"status": "failed", "created_at": ("gte", _since(hours / 24))}, order="created_at.desc", limit=5000)
    owner = await _conv_accounts(sdb, [m["conversation_id"] for m in failed])
    if account_id:
        failed = [m for m in failed if owner.get(m["conversation_id"]) == account_id]
    names = await _names(sdb)
    by_error: Counter = Counter(m.get("error_title") or f"error {m.get('error_code')}" for m in failed)
    by_business: Counter = Counter(names.get(owner.get(m["conversation_id"]) or "", "?") for m in failed)
    return {"hours": hours, "failed": len(failed), "by_error": [{"error": e, "count": n} for e, n in by_error.most_common(15)], "by_business": [{"business": b, "count": n} for b, n in by_business.most_common(15)], "latest": [{"business": names.get(owner.get(m["conversation_id"]) or ""), "error": m.get("error_title") or m.get("error_message"), "code": m.get("error_code"), "at": m.get("created_at")} for m in failed[:10]]}


@router.delete("/ai-providers/{vendor}/models/{model_id}", status_code=204)
async def ai_model_remove(vendor: str, model_id: str, admin: SuperOnly, sdb: ServiceDb):
    rows = await sdb.select("platform_ai_models", {"vendor": vendor, "model_id": model_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Model not found")
    if rows[0].get("is_default"):
        raise HTTPException(409, "This is the default model: make another one the default first")
    in_use = [a for a in await sdb.select("assistants", {"model_id": model_id}) if a.get("provider") == vendor]
    if in_use:
        raise HTTPException(409, f"{len(in_use)} assistants use this model; switch it off instead (they fall back to the default)")
    await sdb.delete("platform_ai_models", {"vendor": vendor, "model_id": model_id})
    await audit.record(sdb, scope="platform", action="ai_model.remove", actor_id=admin.user.id, target=f"{vendor}/{model_id}")


# ------------------------------------------------------------------ phone verification
OTP_DEFAULT = {"enabled": False, "sender_account_id": None, "custom_sender": None, "admin_2fa": False, "template_name": "autoshift_otp", "language": "en_US", "required_since": None}


def _has_sender(s: dict) -> bool:
    return bool((s.get("custom_sender") or {}).get("phone_number_id") or s.get("sender_account_id"))


def _public_otp(s: dict) -> dict:
    """Settings without the encrypted token."""
    custom = s.get("custom_sender") or None
    return {**s, "custom_sender": {k: custom.get(k) for k in ("phone_number_id", "waba_id", "display_phone", "verified_name", "token_tail")} if custom else None}


async def _otp(sdb) -> dict:
    rows = await sdb.select("platform_settings", {"key": "phone_otp"}, limit=1)
    return {**OTP_DEFAULT, **(rows[0]["value"] if rows and isinstance(rows[0].get("value"), dict) else {})}


@router.get("/phone-verification")
async def phone_verification(_: AnyStaff, sdb: ServiceDb):
    """Sign-up phone verification: on/off, the sending business and template, and how many people verified."""
    s = await _otp(sdb)
    names = await _names(sdb)
    template = None
    if s["sender_account_id"] and not (s.get("custom_sender") or {}).get("phone_number_id"):
        found = await sdb.select("message_templates", {"account_id": s["sender_account_id"], "name": s["template_name"]}, limit=1)
        template = found[0].get("status") if found else "not created"
    verified = len([p for p in await sdb.select("profiles", {"phone_verified_at": ("gte", "1970-01-01")}, limit=50000)])
    return {**_public_otp(s), "sender_business": names.get(s["sender_account_id"] or ""), "template_status": template, "people_verified": verified}


class OtpPatch(BaseModel):
    enabled: bool


@router.put("/phone-verification")
async def phone_verification_set(body: OtpPatch, admin: SuperOnly, sdb: ServiceDb):
    """Switch sign-up phone verification on or off. The sending number is chosen in the admin panel."""
    s = await _otp(sdb)
    if body.enabled and not _has_sender(s):
        raise HTTPException(409, "Set up the sending WhatsApp number in the admin panel first (Alert settings → Phone verification)")
    s["enabled"] = body.enabled
    if body.enabled and not s.get("required_since"):
        s["required_since"] = _now().isoformat()
    await sdb.upsert("platform_settings", {"key": "phone_otp", "value": s, "updated_by": admin.user.id, "updated_at": _now().isoformat()}, "key")
    await audit.record(sdb, scope="platform", action="phone_otp.toggle", actor_id=admin.user.id, details={"enabled": body.enabled})
    return _public_otp(s)


@router.post("/phone-verification/template")
async def phone_verification_template(admin: SuperOnly, sdb: ServiceDb, bridge: Bridge):
    """Submit the verification-code template to Meta from the sending number (category AUTHENTICATION)."""
    s = await _otp(sdb)
    if not _has_sender(s):
        raise HTTPException(409, "Set up the sending WhatsApp number in the admin panel first")
    account = s["sender_account_id"]
    if not account:  # WhatsApp details entered directly: any business works for the bridge's lookup
        mine = await sdb.select("profiles", {"user_id": admin.user.id}, limit=1)
        account = (mine[0].get("account_id") if mine else None) or ((await sdb.select("accounts", limit=1)) or [{}])[0].get("id")
    try:
        out = await bridge.call("otp_template_create", account, admin.user.id, "owner")
    except BridgeError as exc:
        raise HTTPException(exc.status if 400 <= exc.status < 600 else 502, exc.detail) from exc
    await audit.record(sdb, scope="platform", action="phone_otp.template_create", actor_id=admin.user.id, account_id=s["sender_account_id"], details={"template": s["template_name"]})
    return out


# ------------------------------------------------------------------ API keys across the platform
@router.get("/api-keys")
async def keys_list(_: SuperOnly, sdb: ServiceDb, account_id: str | None = None, include_revoked: bool = False):
    """Every API key (business and platform) with its owner and last use. Never the key itself."""
    filters: dict[str, Any] = {"account_id": account_id} if account_id else {}
    rows = await sdb.select("mcp_keys", filters, order="created_at.desc", limit=2000)
    if not include_revoked:
        rows = [r for r in rows if not r.get("revoked_at")]
    names = await _names(sdb)
    people = {p["user_id"]: p.get("email") for p in await sdb.select("profiles", limit=50000)}
    return [{"id": r["id"], "name": r["name"], "prefix": r["prefix"], "kind": r["kind"], "scope": r["scope"], "business": names.get(r.get("account_id") or ""), "account_id": r.get("account_id"), "owner": people.get(r["user_id"]), "created_at": r.get("created_at"), "last_used_at": r.get("last_used_at"), "expires_at": r.get("expires_at"), "revoked_at": r.get("revoked_at")} for r in rows]


@router.post("/api-keys/{key_id}/revoke")
async def key_revoke(key_id: str, admin: SuperOnly, sdb: ServiceDb):
    """Switch off any API key (for example one that leaked). It can't be switched back on."""
    rows = await sdb.select("mcp_keys", {"id": key_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Key not found")
    if rows[0].get("revoked_at"):
        return {"ok": True, "already_revoked": True}
    if key_id == admin.user.key_id:
        raise HTTPException(409, "That's the key you're using now; revoke it in the admin panel instead")
    await sdb.update("mcp_keys", {"id": key_id}, {"revoked_at": _now().isoformat()})
    await audit.record(sdb, scope="platform", action="api_key.revoke", actor_id=admin.user.id, account_id=rows[0].get("account_id"), target=key_id, details={"name": rows[0]["name"], "prefix": rows[0]["prefix"]})
    return {"ok": True, "revoked": rows[0]["prefix"]}

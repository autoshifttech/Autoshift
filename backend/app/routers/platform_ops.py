"""Platform staff tools for the MCP and the admin panel: business usage, payments, revenue, costs,
plans and rates, WhatsApp health, AI usage, system status, alerts, tickets, and user logins.

Rules: nobody gets admin access here; no passwords or sign-in links are shown; nobody can sign in
as a customer; a business always keeps an owner; every change goes in the audit log. Removing a
login wipes the person's details and locks it for good, but keeps business data and money records.
"""

import hashlib
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import audit, key_limits, wallet
from ..auth_admin import AuthAdmin, AuthAdminError
from ..config import Settings, get_settings
from ..deps import PlatformAdmin, ServiceDb, get_auth_admin, get_platform_admin, require_platform_role
from .support import _messages, _ticket

router = APIRouter(prefix="/v1/platform", tags=["platform-ops"])
AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]
Manager = Annotated[PlatformAdmin, Depends(require_platform_role("support"))]
Finance = Annotated[PlatformAdmin, Depends(require_platform_role("finance"))]
SuperOnly = Annotated[PlatformAdmin, Depends(require_platform_role())]
Auth = Annotated[AuthAdmin, Depends(get_auth_admin)]

ALERT_DEFAULTS = {
    "channels": {"panel": True, "email": True, "whatsapp": False},
    "rules": {"lowWallet": True, "quality": True, "paymentFailed": True, "trialEnding": True, "marketingSpike": True, "systemDown": True},
    "lowWalletBelow": 200,
    "digest": False,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _since(days: float) -> str:
    return (_now() - timedelta(days=days)).isoformat()


def _chunks(items: list, size: int = 100):
    for i in range(0, len(items), size):
        yield items[i : i + size]


async def _names(sdb) -> dict[str, str]:
    return {a["id"]: a["name"] for a in await sdb.select("accounts")}


async def _setting(sdb, key: str, default: Any) -> Any:
    rows = await sdb.select("platform_settings", {"key": key}, limit=1)
    return rows[0]["value"] if rows else default


async def _save_setting(sdb, key: str, value: Any, user_id: str) -> None:
    await sdb.upsert("platform_settings", {"key": key, "value": value, "updated_by": user_id, "updated_at": _now().isoformat()}, "key")


async def _account(sdb, account_id: str) -> dict:
    rows = await sdb.select("accounts", {"id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Business not found")
    return rows[0]


async def _conv_accounts(sdb, conversation_ids: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in _chunks(sorted(set(conversation_ids))):
        for c in await sdb.select("conversations", {"id": ("in", part)}):
            out[c["id"]] = c["account_id"]
    return out


# ------------------------------------------------------------------ one business
@router.get("/businesses/{account_id}/usage")
async def business_usage(account_id: str, _: AnyStaff, sdb: ServiceDb, days: int = Query(30, ge=1, le=365)):
    acct = await _account(sdb, account_id)
    since = _since(days)
    ledger = await sdb.select("wallet_ledger", {"account_id": account_id, "created_at": ("gte", since)}, limit=10000)
    spend: dict[str, int] = defaultdict(int)
    for e in ledger:
        if e["kind"].startswith("charge_"):
            spend[e["kind"].removeprefix("charge_")] += -int(e["amount_paise"])
    sub = (await sdb.select("subscriptions", {"account_id": account_id}, limit=1)) or [{}]
    return {
        "business": acct["name"],
        "days": days,
        "plan": sub[0].get("plan_id"),
        "subscription": sub[0].get("status"),
        "team": await sdb.count("profiles", {"account_id": account_id}),
        "contacts": await sdb.count("contacts", {"account_id": account_id}),
        "new_contacts": await sdb.count("contacts", {"account_id": account_id}, since=("created_at", since)),
        "new_conversations": await sdb.count("conversations", {"account_id": account_id}, since=("created_at", since)),
        "ai_replies": await sdb.count("ai_usage_log", {"account_id": account_id}, since=("created_at", since)),
        "broadcasts": await sdb.count("broadcasts", {"account_id": account_id}, since=("created_at", since)),
        "wallet_paise": await wallet.balance(sdb, account_id),
        "spend_paise_by_kind": dict(spend),
        "spend_paise_total": sum(spend.values()),
    }


# ------------------------------------------------------------------ money
@router.get("/failed-payments")
async def failed_payments(_: AnyStaff, sdb: ServiceDb, days: int = Query(30, ge=1, le=365)):
    names = await _names(sdb)
    since = _since(days)
    failed = await sdb.select("payment_orders", {"status": "failed", "created_at": ("gte", since)}, order="created_at.desc", limit=500)
    stuck = await sdb.select("payment_orders", {"status": "created", "created_at": ("gte", since)}, order="created_at.desc", limit=500)
    stuck = [o for o in stuck if str(o["created_at"]) < _since(1 / 24)]  # unpaid after an hour: abandoned or failed
    events = await sdb.select("razorpay_events", {"status": "failed"}, limit=200)
    pick = ("id", "account_id", "purpose", "razorpay_order_id", "total_paise", "status", "created_at")
    return {
        "failed": [{**{k: o.get(k) for k in pick}, "business": names.get(o["account_id"], "")} for o in failed],
        "abandoned": [{**{k: o.get(k) for k in pick}, "business": names.get(o["account_id"], "")} for o in stuck],
        "failed_webhook_events": len(events),
        "past_due_subscriptions": [{"account_id": s["account_id"], "business": names.get(s["account_id"], ""), "plan": s.get("plan_id")} for s in await sdb.select("subscriptions", {"status": "past_due"})],
    }


@router.get("/revenue")
@key_limits.cached_for_keys()
async def revenue(_: Finance, sdb: ServiceDb, days: int = Query(30, ge=1, le=730), group: Literal["day", "month"] = "day"):
    """Invoiced revenue (what customers paid, before and after GST), by period and by kind."""
    invoices = await sdb.select("invoices", {"issued_at": ("gte", _since(days))}, order="issued_at.asc", limit=20000)
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"base_paise": 0, "gst_paise": 0, "count": 0})
    by_kind: dict[str, int] = defaultdict(int)
    for i in invoices:
        key = str(i["issued_at"])[: 10 if group == "day" else 7]
        b = buckets[key]
        b["base_paise"] += int(i["base_paise"])
        b["gst_paise"] += int(i["gst_paise"])
        b["count"] += 1
        by_kind[i["kind"]] += int(i["base_paise"])
    return {
        "days": days,
        "total_base_paise": sum(int(i["base_paise"]) for i in invoices),
        "total_gst_paise": sum(int(i["gst_paise"]) for i in invoices),
        "invoices": len(invoices),
        "by_kind_base_paise": dict(by_kind),
        "by_period": [{"period": k, **v} for k, v in sorted(buckets.items())],
    }


@router.get("/costs")
@key_limits.cached_for_keys()
async def costs(_: AnyStaff, sdb: ServiceDb, days: int = Query(30, ge=1, le=365)):
    """What businesses were charged (messages, AI) and the AI tokens behind it, by provider and model."""
    since = _since(days)
    ledger = [e for e in await sdb.select("wallet_ledger", {"created_at": ("gte", since)}, limit=50000) if e["kind"].startswith("charge_")]
    by_kind: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "paise": 0})
    for e in ledger:
        by_kind[e["kind"].removeprefix("charge_")]["count"] += 1
        by_kind[e["kind"].removeprefix("charge_")]["paise"] += -int(e["amount_paise"])
    tokens: dict[str, dict[str, int]] = defaultdict(lambda: {"replies": 0, "prompt_tokens": 0, "completion_tokens": 0})
    for u in await sdb.select("ai_usage_log", {"created_at": ("gte", since)}, limit=50000):
        t = tokens[f"{u.get('provider')}/{u.get('model')}"]
        t["replies"] += 1
        t["prompt_tokens"] += int(u.get("prompt_tokens") or 0)
        t["completion_tokens"] += int(u.get("completion_tokens") or 0)
    meta = await _setting(sdb, "meta_fees_billed_to", "business")
    return {"days": days, "charged_paise_by_kind": dict(by_kind), "charged_paise_total": sum(v["paise"] for v in by_kind.values()), "ai_tokens_by_model": dict(tokens), "meta_fees_billed_to": meta, "rates_paise": await wallet.rates(sdb)}


@router.get("/low-wallets")
async def low_wallets(_: AnyStaff, sdb: ServiceDb, below_paise: int = Query(20000, ge=0)):
    names = await _names(sdb)
    rows = [b for b in await sdb.select("wallet_balances") if int(b["balance_paise"]) < below_paise]
    statuses = {s["account_id"]: s["status"] for s in await sdb.select("subscriptions")}
    out = [{"account_id": b["account_id"], "business": names.get(b["account_id"], ""), "balance_paise": int(b["balance_paise"]), "subscription": statuses.get(b["account_id"])} for b in rows if b["account_id"] in names]
    return sorted(out, key=lambda r: r["balance_paise"])


# ------------------------------------------------------------------ plans and rates
@router.get("/plans")
async def all_plans(_: AnyStaff, sdb: ServiceDb):
    return await sdb.select("plans", order="monthly_paise.asc")


class PlanPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=40)
    monthly_paise: int | None = Field(None, ge=0, le=100_000_000)
    seats: int | None = Field(None, ge=1, le=1000)
    contacts: int | None = Field(None, ge=0, description="0 or less is not allowed; use unlimited=true for no limit")
    unlimited_contacts: bool | None = None
    ai_replies: int | None = Field(None, ge=0)
    active: bool | None = None
    popular: bool | None = None


@router.patch("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanPatch, admin: SuperOnly, sdb: ServiceDb):
    found = await sdb.select("plans", {"id": plan_id}, limit=1)
    if not found:
        raise HTTPException(404, "Plan not found")
    patch: dict[str, Any] = body.model_dump(exclude_none=True, exclude={"unlimited_contacts"})
    if body.unlimited_contacts:
        patch["contacts"] = None
    if not patch:
        raise HTTPException(422, "Nothing to change")
    if "monthly_paise" in patch and patch["monthly_paise"] != found[0]["monthly_paise"]:
        # Razorpay plans have a fixed price: new ones are made at the next checkout. Existing subscribers keep theirs.
        patch.update(razorpay_plan_monthly=None, razorpay_plan_yearly=None)
    if body.active is False and await sdb.count("subscriptions", {"plan_id": plan_id, "status": "active"}):
        patch["active"] = False  # hidden from new customers; current subscribers keep it
    rows = await sdb.update("plans", {"id": plan_id}, patch)
    await audit.record(sdb, scope="platform", action="plan.update", actor_id=admin.user.id, target=plan_id, details={"before": {k: found[0].get(k) for k in patch}, "after": patch})
    return rows[0]


class RatesPatch(BaseModel):
    marketing: int | None = Field(None, ge=0, le=10000)
    utility: int | None = Field(None, ge=0, le=10000)
    authentication: int | None = Field(None, ge=0, le=10000)
    service: int | None = Field(None, ge=0, le=10000)
    ai: int | None = Field(None, ge=0, le=10000)


@router.get("/rates")
async def get_rates(_: AnyStaff, sdb: ServiceDb):
    return {"rates_paise": await wallet.rates(sdb), "defaults_paise": wallet.RATES_PAISE}


@router.put("/rates")
async def update_rates(body: RatesPatch, admin: SuperOnly, sdb: ServiceDb):
    change = {f"charge_{k}": v for k, v in body.model_dump(exclude_none=True).items()}
    if not change:
        raise HTTPException(422, "Nothing to change")
    before = await wallet.rates(sdb)
    current = await _setting(sdb, "rates_paise", {})
    await _save_setting(sdb, "rates_paise", {**(current if isinstance(current, dict) else {}), **change}, admin.user.id)
    await audit.record(sdb, scope="platform", action="rates.update", actor_id=admin.user.id, details={"before": {k: before[k] for k in change}, "after": change})
    return {"rates_paise": await wallet.rates(sdb)}


# ------------------------------------------------------------------ WhatsApp and AI
async def _wa_rows(sdb, hours: int = 24) -> list[dict]:
    names = await _names(sdb)
    configs = {c["account_id"]: c for c in await sdb.select("whatsapp_config") if c.get("account_id")}
    failed = await sdb.select("messages", {"status": "failed", "created_at": ("gte", _since(hours / 24))}, order="created_at.desc", limit=5000)
    owner = await _conv_accounts(sdb, [m["conversation_id"] for m in failed])
    fails: dict[str, Counter] = defaultdict(Counter)
    for m in failed:
        acct = owner.get(m["conversation_id"])
        if acct:
            fails[acct][m.get("error_title") or f"error {m.get('error_code')}"] += 1
    rejected = Counter(t["account_id"] for t in await sdb.select("message_templates", {"status": "REJECTED"}) if t.get("account_id"))
    out = []
    for acct_id, name in names.items():
        c = configs.get(acct_id)
        f = fails.get(acct_id, Counter())
        out.append({
            "account_id": acct_id,
            "business": name,
            "status": c.get("status") if c else "not_connected",
            "phone_number_id": c.get("phone_number_id") if c else None,
            "connected_at": c.get("connected_at") if c else None,
            "registration_error": c.get("last_registration_error") if c else None,
            f"failed_messages_{hours}h": sum(f.values()),
            "top_errors": [{"error": e, "count": n} for e, n in f.most_common(3)],
            "rejected_templates": rejected.get(acct_id, 0),
        })
    return out


@router.get("/whatsapp-health")
@key_limits.cached_for_keys()
async def whatsapp_health(_: AnyStaff, sdb: ServiceDb, hours: int = Query(24, ge=1, le=168)):
    rows = await _wa_rows(sdb, hours)
    return {"connected": sum(1 for r in rows if r["status"] == "connected"), "not_connected": sum(1 for r in rows if r["status"] != "connected"), "businesses": rows}


@router.get("/whatsapp-issues")
async def whatsapp_issues(_: AnyStaff, sdb: ServiceDb, hours: int = Query(24, ge=1, le=168)):
    """Only businesses with a problem: a broken connection, a registration error, failed sends or rejected templates."""
    key = f"failed_messages_{hours}h"
    return [r for r in await _wa_rows(sdb, hours) if (r["status"] not in ("connected", "not_connected")) or r["registration_error"] or r[key] or r["rejected_templates"]]


@router.get("/ai-usage")
@key_limits.cached_for_keys()
async def ai_usage(_: AnyStaff, sdb: ServiceDb, days: int = Query(30, ge=1, le=365)):
    names = await _names(sdb)
    rows = await sdb.select("ai_usage_log", {"created_at": ("gte", _since(days))}, limit=50000)
    by_business: dict[str, dict[str, int]] = defaultdict(lambda: {"replies": 0, "tokens": 0})
    by_model: Counter = Counter()
    by_mode: Counter = Counter()
    for r in rows:
        b = by_business[r["account_id"]]
        b["replies"] += 1
        b["tokens"] += int(r.get("total_tokens") or 0)
        by_model[f"{r.get('provider')}/{r.get('model')}"] += 1
        by_mode[r.get("mode") or "reply"] += 1
    top = sorted(by_business.items(), key=lambda kv: -kv[1]["replies"])[:25]
    return {"days": days, "replies": len(rows), "tokens": sum(int(r.get("total_tokens") or 0) for r in rows), "by_model": dict(by_model), "by_mode": dict(by_mode), "top_businesses": [{"account_id": a, "business": names.get(a, ""), **v} for a, v in top]}


# ------------------------------------------------------------------ system and alerts
@router.get("/system-status")
async def system_status(_: AnyStaff, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    checks: dict[str, Any] = {}
    try:
        await sdb.select("plans", limit=1)
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 - report, never crash the status page
        checks["database"] = f"error: {exc.__class__.__name__}"
    day = _since(1)
    sending = await sdb.select("broadcasts", {"status": "sending"}, limit=500)
    return {
        "checked_at": _now().isoformat(),
        "checks": checks,
        "config": {
            "whatsapp_bridge": bool(settings.internal_secret),
            "razorpay": bool(settings.razorpay_key_id and settings.razorpay_key_secret),
            "razorpay_webhook": bool(settings.razorpay_webhook_secret),
        },
        "queues": {
            "automation_waiting": await sdb.count("automation_pending_executions"),
            "broadcasts_stuck_sending": sum(1 for b in sending if str(b.get("updated_at") or b.get("created_at") or "") < _since(1 / 24)),
            "failed_webhook_deliveries_24h": await sdb.count("webhook_deliveries", {"status": "failed"}, since=("created_at", day)),
            "failed_razorpay_events": await sdb.count("razorpay_events", {"status": "failed"}),
            "failed_messages_24h": await sdb.count("messages", {"status": "failed"}, since=("created_at", day)),
        },
    }


def _alert_id(kind: str, target: str) -> str:
    return f"{kind}-{target}" if len(target) <= 40 else f"{kind}-{hashlib.sha1(target.encode()).hexdigest()[:12]}"


async def _alerts(sdb, settings: Settings, include_dismissed: bool = False) -> list[dict]:
    cfg = {**ALERT_DEFAULTS, **(await _setting(sdb, "alert_settings", {}) or {})}
    rules = {**ALERT_DEFAULTS["rules"], **cfg.get("rules", {})}
    dismissed = set(await _setting(sdb, "dismissed_alerts", []) or [])
    names = await _names(sdb)
    subs = {s["account_id"]: s for s in await sdb.select("subscriptions")}
    out: list[dict] = []
    if rules["lowWallet"]:
        for w in await low_wallets(None, sdb, below_paise=int(cfg["lowWalletBelow"]) * 100):  # type: ignore[arg-type]
            if (w["subscription"] or "") != "trialing":
                out.append({"id": _alert_id("w", w["account_id"]), "severity": "warning" if w["balance_paise"] < 0 else "info", "title": f"{w['business']}: wallet is {'negative' if w['balance_paise'] < 0 else 'low'}", "account_id": w["account_id"]})
    if rules["paymentFailed"]:
        for acct, s in subs.items():
            if s.get("status") == "past_due" and acct in names:
                out.append({"id": _alert_id("p", acct), "severity": "warning", "title": f"{names[acct]}: subscription payment failed", "account_id": acct})
    if rules["trialEnding"]:
        soon = (_now() + timedelta(days=3)).isoformat()
        for acct, s in subs.items():
            if s.get("status") == "trialing" and s.get("trial_ends_at") and str(s["trial_ends_at"]) <= soon and acct in names:
                out.append({"id": _alert_id("t", acct), "severity": "info", "title": f"{names[acct]}: trial ends {str(s['trial_ends_at'])[:10]}", "account_id": acct})
    if rules["quality"]:
        for r in await _wa_rows(sdb):
            if r["registration_error"] or r["failed_messages_24h"] >= 10:
                out.append({"id": _alert_id("q", r["account_id"]), "severity": "critical" if r["failed_messages_24h"] >= 50 else "warning", "title": f"{r['business']}: WhatsApp problems ({r['failed_messages_24h']} failed in 24h)", "account_id": r["account_id"]})
    if rules["systemDown"]:
        status = await system_status(None, sdb, settings)  # type: ignore[arg-type]
        if status["checks"]["database"] != "ok":
            out.append({"id": "s-database", "severity": "critical", "title": "Database check failed"})
        if status["queues"]["broadcasts_stuck_sending"]:
            out.append({"id": "s-broadcasts", "severity": "warning", "title": f"{status['queues']['broadcasts_stuck_sending']} broadcasts stuck sending"})
        if status["queues"]["failed_razorpay_events"]:
            out.append({"id": "s-razorpay", "severity": "warning", "title": f"{status['queues']['failed_razorpay_events']} Razorpay events failed"})
    urgent = [t for t in await sdb.select("support_tickets", {"status": "open"}) if t.get("priority") in ("urgent", "high")]
    if urgent:
        out.append({"id": "tickets", "severity": "warning", "title": f"{len(urgent)} urgent support requests"})
    order = {"critical": 0, "warning": 1, "info": 2}
    out.sort(key=lambda a: order[a["severity"]])
    return [{**a, "dismissed": a["id"] in dismissed} for a in out if include_dismissed or a["id"] not in dismissed]


@router.get("/alerts")
async def alerts(_: AnyStaff, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)], include_dismissed: bool = False):
    return await _alerts(sdb, settings, include_dismissed)


@router.post("/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: str, admin: Manager, sdb: ServiceDb):
    current = list(await _setting(sdb, "dismissed_alerts", []) or [])
    if alert_id not in current:
        current = (current + [alert_id])[-500:]
        await _save_setting(sdb, "dismissed_alerts", current, admin.user.id)
    await audit.record(sdb, scope="platform", action="alert.dismiss", actor_id=admin.user.id, target=alert_id)
    return {"ok": True}


class AlertSettingsPatch(BaseModel):
    rules: dict[Literal["lowWallet", "quality", "paymentFailed", "trialEnding", "marketingSpike", "systemDown"], bool] | None = None
    low_wallet_below_inr: int | None = Field(None, ge=0, le=100000)
    channels: dict[Literal["panel", "email", "whatsapp"], bool] | None = None
    digest: bool | None = None


@router.get("/alert-settings")
async def get_alert_settings(_: AnyStaff, sdb: ServiceDb):
    return {**ALERT_DEFAULTS, **(await _setting(sdb, "alert_settings", {}) or {})}


@router.put("/alert-settings")
async def update_alert_settings(body: AlertSettingsPatch, admin: SuperOnly, sdb: ServiceDb):
    cfg = {**ALERT_DEFAULTS, **(await _setting(sdb, "alert_settings", {}) or {})}
    if body.rules:
        cfg["rules"] = {**cfg["rules"], **body.rules}
    if body.channels:
        cfg["channels"] = {**cfg["channels"], **body.channels}
    if body.low_wallet_below_inr is not None:
        cfg["lowWalletBelow"] = body.low_wallet_below_inr
    if body.digest is not None:
        cfg["digest"] = body.digest
    await _save_setting(sdb, "alert_settings", cfg, admin.user.id)
    await audit.record(sdb, scope="platform", action="alert_settings.update", actor_id=admin.user.id, details=body.model_dump(exclude_none=True))
    return cfg


# ------------------------------------------------------------------ one ticket
@router.get("/tickets/{number}")
async def ticket(number: int, _: AnyStaff, sdb: ServiceDb):
    rows = await sdb.select("support_tickets", {"number": str(number)}, limit=1)
    if not rows:
        raise HTTPException(404, "Ticket not found")
    names = await _names(sdb)
    return _ticket(rows[0], await _messages(sdb, number, staff=True), names.get(rows[0]["account_id"], ""))


# ------------------------------------------------------------------ user logins
async def _profile(sdb, user_id: str) -> dict:
    rows = await sdb.select("profiles", {"user_id": user_id}, limit=1)
    if not rows:
        raise HTTPException(404, "User not found")
    return rows[0]


async def _not_staff(sdb, user_id: str) -> None:
    if await sdb.select("platform_admins", {"user_id": user_id}, limit=1):
        raise HTTPException(403, "AutoShift team logins are managed in the admin panel's Admin team page, not here")


def _user_public(p: dict, names: dict[str, str]) -> dict:
    return {"user_id": p["user_id"], "name": p.get("full_name"), "email": p.get("email"), "account_id": p.get("account_id"), "business": names.get(p.get("account_id") or "", ""), "role": p.get("account_role"), "joined": p.get("created_at")}


@router.get("/users")
async def users(_: AnyStaff, sdb: ServiceDb, q: str | None = None, account_id: str | None = None, limit: int = Query(50, ge=1, le=500)):
    names = await _names(sdb)
    filters: dict[str, Any] = {"account_id": account_id} if account_id else {}
    if q and q.strip():
        term = q.strip().replace("*", "").replace(",", " ")
        seen, rows = set(), []
        for probe in ({"email": ("ilike", f"*{term}*")}, {"full_name": ("ilike", f"*{term}*")}):
            for p in await sdb.select("profiles", {**filters, **probe}, limit=limit):
                if p["user_id"] not in seen:
                    seen.add(p["user_id"])
                    rows.append(p)
    else:
        rows = await sdb.select("profiles", filters or None, order="created_at.desc", limit=limit)
    staff = {a["user_id"]: a["role"] for a in await sdb.select("platform_admins")}
    return [{**_user_public(p, names), "autoshift_team": staff.get(p["user_id"])} for p in rows[:limit]]


@router.get("/users/{user_id}")
async def user(user_id: str, _: AnyStaff, sdb: ServiceDb, auth: Auth):
    p = await _profile(sdb, user_id)
    try:
        login = await auth.get_user(user_id) or {}
    except AuthAdminError:
        login = {}
    staff = await sdb.select("platform_admins", {"user_id": user_id}, limit=1)
    keys = [k for k in await sdb.select("mcp_keys", {"user_id": user_id}) if not k.get("revoked_at")]
    return {
        **_user_public(p, await _names(sdb)),
        "autoshift_team": staff[0]["role"] if staff else None,
        "last_sign_in_at": login.get("last_sign_in_at"),
        "email_confirmed": bool(login.get("email_confirmed_at")),
        "disabled": bool(login.get("banned_until")) and str(login.get("banned_until")) > _now().isoformat(),
        "active_api_keys": len(keys),
    }


class UserInvite(BaseModel):
    account_id: str
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)
    role: Literal["admin", "agent", "viewer"]


@router.post("/users/invite", status_code=201)
async def invite_user(body: UserInvite, admin: Manager, sdb: ServiceDb, auth: Auth):
    """Add a person to a business; Supabase emails them a link to set their own password."""
    from .businesses import add_member
    from ..schemas import MemberAdd

    return await add_member(body.account_id, MemberAdd(name=body.name, email=body.email, role=body.role), admin, sdb, auth)


class UserRole(BaseModel):
    role: Literal["owner", "admin", "agent", "viewer"]


@router.patch("/users/{user_id}/role")
async def set_user_role(user_id: str, body: UserRole, admin: Manager, sdb: ServiceDb):
    p = await _profile(sdb, user_id)
    if not p.get("account_id"):
        raise HTTPException(409, "This person is not on a business")
    from .businesses import change_role
    from ..schemas import MemberPatch

    return await change_role(p["account_id"], user_id, MemberPatch(role=body.role), admin, sdb)


async def _sole_owner_of(sdb, user_id: str) -> list[str]:
    out = []
    for p in await sdb.select("profiles", {"user_id": user_id}):
        if p.get("account_role") == "owner" and p.get("account_id"):
            owners = [m for m in await sdb.select("profiles", {"account_id": p["account_id"]}) if m.get("account_role") == "owner"]
            if len(owners) <= 1:
                out.append(p["account_id"])
    return out


async def _revoke_keys(sdb, user_id: str) -> int:
    keys = [k for k in await sdb.select("mcp_keys", {"user_id": user_id}) if not k.get("revoked_at")]
    for k in keys:
        await sdb.update("mcp_keys", {"id": k["id"]}, {"revoked_at": _now().isoformat()})
    return len(keys)


class Reason(BaseModel):
    reason: str = Field("", max_length=300)


@router.post("/users/{user_id}/disable")
async def disable_user(user_id: str, body: Reason, admin: Manager, sdb: ServiceDb, auth: Auth):
    """Block sign-in (and the person's API keys). Their business and data stay as they are."""
    await _profile(sdb, user_id)
    await _not_staff(sdb, user_id)
    if user_id == admin.user.id:
        raise HTTPException(409, "You can't disable yourself")
    try:
        await auth.update_user(user_id, {"ban_duration": "876000h"})
    except AuthAdminError as exc:
        raise HTTPException(502, str(exc)) from exc
    revoked = await _revoke_keys(sdb, user_id)
    await audit.record(sdb, scope="platform", action="user.disable", actor_id=admin.user.id, target=user_id, details={"reason": body.reason, "api_keys_revoked": revoked})
    return {"ok": True, "disabled": True, "api_keys_revoked": revoked}


@router.post("/users/{user_id}/enable")
async def enable_user(user_id: str, admin: Manager, sdb: ServiceDb, auth: Auth):
    p = await _profile(sdb, user_id)
    await _not_staff(sdb, user_id)
    if (p.get("full_name") or "") == "Deleted user":
        raise HTTPException(409, "This login was removed and can't be turned back on")
    try:
        await auth.update_user(user_id, {"ban_duration": "none"})
    except AuthAdminError as exc:
        raise HTTPException(502, str(exc)) from exc
    await audit.record(sdb, scope="platform", action="user.enable", actor_id=admin.user.id, target=user_id)
    return {"ok": True, "disabled": False, "note": "Revoked API keys stay revoked; the person can create new ones."}


@router.post("/users/{user_id}/send-reset")
async def send_reset(user_id: str, admin: Manager, sdb: ServiceDb, auth: Auth):
    """Email the person a reset link. The link goes only to their inbox; it is never shown here."""
    p = await _profile(sdb, user_id)
    await _not_staff(sdb, user_id)
    if not p.get("email"):
        raise HTTPException(409, "This person has no email on file")
    try:
        await auth.send_recovery(p["email"])
    except AuthAdminError as exc:
        raise HTTPException(502, str(exc)) from exc
    await audit.record(sdb, scope="platform", action="user.send_reset", actor_id=admin.user.id, target=user_id)
    return {"ok": True, "sent_to": p["email"]}


@router.post("/users/{user_id}/remove")
async def remove_user(user_id: str, body: Reason, admin: SuperOnly, sdb: ServiceDb, auth: Auth):
    """Remove a login for good: wipe the person's details, take them off their business, lock the login
    and revoke their keys. Business data, invoices and the wallet ledger are kept. A business's last
    owner can't be removed (make someone else owner, or close the business, first)."""
    p = await _profile(sdb, user_id)
    await _not_staff(sdb, user_id)
    if user_id == admin.user.id:
        raise HTTPException(409, "You can't remove yourself")
    sole = await _sole_owner_of(sdb, user_id)
    if sole:
        names = await _names(sdb)
        raise HTTPException(409, f"This person is the only owner of {', '.join(names.get(a, a) for a in sole)}. Make someone else owner, or close the business, first.")
    try:
        await auth.update_user(user_id, {"ban_duration": "876000h", "email": f"removed+{user_id}@deleted.autoshift.invalid", "user_metadata": {}})
    except AuthAdminError as exc:
        raise HTTPException(502, str(exc)) from exc
    revoked = await _revoke_keys(sdb, user_id)
    await sdb.update("profiles", {"user_id": user_id}, {"full_name": "Deleted user", "email": None, "avatar_url": None, "account_id": None, "account_role": None})
    await sdb.delete("member_presence", {"user_id": user_id})
    await audit.record(sdb, scope="platform", action="user.remove", actor_id=admin.user.id, account_id=p.get("account_id"), target=user_id, details={"reason": body.reason, "api_keys_revoked": revoked})
    return {"ok": True, "removed": True, "kept": "business data, invoices and wallet ledger"}


# ------------------------------------------------------------------ admin panel charts
@router.get("/stats")
@key_limits.cached_for_keys()
async def stats(_: AnyStaff, sdb: ServiceDb, settings: Annotated[Settings, Depends(get_settings)]):
    """Everything the admin panel's charts need, from real rows (amounts in rupees):
    12 months of money and signups, 30 days of AI replies, 24 hours of webhook deliveries,
    service checks, recent errors, and each business's WhatsApp details."""
    now = _now()
    # ---- months (oldest first, this month last)
    months: list[dict] = []
    for i in range(11, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12
            y -= 1
        months.append({"key": f"{y:04d}-{m:02d}", "month": datetime(y, m, 1).strftime("%b"), "signups": 0, "paying": 0, "mrr": 0, "subscriptions": 0, "topups": 0, "metaCost": 0, "aiCost": 0})
    by_month = {mo["key"]: mo for mo in months}
    first = f"{months[0]['key']}-01T00:00:00+00:00"
    for a in await sdb.select("accounts", {"created_at": ("gte", first)}, limit=20000):
        mo = by_month.get(str(a.get("created_at"))[:7])
        if mo:
            mo["signups"] += 1
    for inv in await sdb.select("invoices", {"issued_at": ("gte", first)}, limit=20000):
        mo = by_month.get(str(inv["issued_at"])[:7])
        if mo:
            mo["subscriptions" if inv["kind"] == "subscription" else "topups"] += int(inv["base_paise"]) / 100
    for e in await sdb.select("wallet_ledger", {"created_at": ("gte", first)}, limit=50000):
        mo = by_month.get(str(e["created_at"])[:7])
        if mo and e["kind"].startswith("charge_"):
            mo["aiCost" if e["kind"] == "charge_ai" else "metaCost"] += -int(e["amount_paise"]) / 100
    subs = await sdb.select("subscriptions")
    plans = {p["id"]: p for p in await sdb.select("plans")}
    active = [s for s in subs if s["status"] == "active"]
    months[-1]["paying"] = len(active)
    months[-1]["mrr"] = round(sum(plans[s["plan_id"]]["monthly_paise"] * (1 if s["cycle"] == "monthly" else 10 / 12) for s in active if s["plan_id"] in plans) / 100)
    for mo in months:
        for k in ("subscriptions", "topups", "metaCost", "aiCost"):
            mo[k] = round(mo[k])
        mo.pop("key")

    # ---- AI replies per day by model tier (fast vs the rest)
    tiers = {f"{x['vendor']}/{x['model_id']}": x.get("tier") for x in await sdb.select("platform_ai_models")}
    ai_days = []
    day_index: dict[str, dict] = {}
    for i in range(29, -1, -1):
        d = (now - timedelta(days=i)).date()
        row = {"day": d.strftime("%d %b"), "fast": 0, "smart": 0, "errors": 0}
        ai_days.append(row)
        day_index[d.isoformat()] = row
    models: Counter = Counter()
    for u in await sdb.select("ai_usage_log", {"created_at": ("gte", _since(30))}, limit=50000):
        row = day_index.get(str(u["created_at"])[:10])
        key = f"{u.get('provider')}/{u.get('model')}"
        models[key] += 1
        if row:
            row["fast" if tiers.get(key) == "fast" else "smart"] += 1

    # ---- webhook deliveries per hour, last 24 hours
    hours = []
    hour_index: dict[str, dict] = {}
    for i in range(23, -1, -1):
        h = now - timedelta(hours=i)
        row = {"hour": h.strftime("%H:00"), "delivered": 0, "failed": 0}
        hours.append(row)
        hour_index[h.strftime("%Y-%m-%dT%H")] = row
    for d in await sdb.select("webhook_deliveries", {"created_at": ("gte", _since(1))}, limit=20000):
        row = hour_index.get(str(d["created_at"])[:13])
        if row and d.get("status") in ("delivered", "failed"):
            row[d["status"]] += 1

    # ---- service checks
    status = await system_status(_, sdb, settings)
    q = status["queues"]
    services = [
        {"id": "db", "name": "Database", "detail": "Supabase Postgres", "status": "operational" if status["checks"]["database"] == "ok" else "down"},
        {"id": "api", "name": "AutoShift API", "detail": "This server", "status": "operational"},
        {"id": "meta", "name": "WhatsApp sending", "detail": f"{q['failed_messages_24h']} failed in 24 hours" if q["failed_messages_24h"] else "No failed messages in 24 hours", "status": "degraded" if q["failed_messages_24h"] >= 20 else "operational"},
        {"id": "webhooks", "name": "Outgoing webhooks", "detail": f"{q['failed_webhook_deliveries_24h']} failed in 24 hours" if q["failed_webhook_deliveries_24h"] else "No failures in 24 hours", "status": "degraded" if q["failed_webhook_deliveries_24h"] else "operational"},
        {"id": "razorpay", "name": "Razorpay", "detail": "Not set up" if not status["config"]["razorpay"] else (f"{q['failed_razorpay_events']} events failed" if q["failed_razorpay_events"] else "Payments and webhooks"), "status": "degraded" if (not status["config"]["razorpay"] or q["failed_razorpay_events"]) else "operational"},
        {"id": "bridge", "name": "Web app bridge", "detail": "Used by AI and MCP sends" if status["config"]["whatsapp_bridge"] else "INTERNAL_SECRET is not set", "status": "operational" if status["config"]["whatsapp_bridge"] else "down"},
    ]

    # ---- recent errors: failed sends and failed payments
    events = []
    failed = await sdb.select("messages", {"status": "failed", "created_at": ("gte", _since(7))}, order="created_at.desc", limit=50)
    owner = await _conv_accounts(sdb, [m["conversation_id"] for m in failed])
    for m in failed:
        events.append({"id": f"msg-{m['id']}", "source": "send", "businessId": owner.get(m["conversation_id"], ""), "message": m.get("error_title") or "Message failed", "code": str(m.get("error_code") or ""), "at": m["created_at"], "retries": 0, "resolved": False})
    for o in await sdb.select("payment_orders", {"status": "failed", "created_at": ("gte", _since(30))}, order="created_at.desc", limit=20):
        events.append({"id": f"pay-{o['id']}", "source": "razorpay", "businessId": o["account_id"], "message": "Wallet top-up failed", "code": "PAYMENT_FAILED", "at": o["created_at"], "retries": 0, "resolved": False})
    events.sort(key=lambda e: str(e["at"]), reverse=True)

    # ---- WhatsApp per business, and rejected templates
    wa = {r["account_id"]: r for r in await _wa_rows(sdb)}
    approved = Counter(t["account_id"] for t in await sdb.select("message_templates", {"status": "APPROVED"}) if t.get("account_id"))
    rejected_templates = [
        {"businessId": t["account_id"], "template": t["name"], "reason": t.get("rejection_reason") or "No reason given", "at": t.get("updated_at")}
        for t in await sdb.select("message_templates", {"status": "REJECTED"}, order="updated_at.desc", limit=50)
        if t.get("account_id")
    ]
    whatsapp = {
        acct: {"status": r["status"], "phone_number_id": r["phone_number_id"], "connected_at": r["connected_at"], "approved": approved.get(acct, 0), "rejected": r["rejected_templates"], "failed_24h": r["failed_messages_24h"], "error": r["registration_error"]}
        for acct, r in wa.items()
    }
    return {"months": months, "ai_days": ai_days, "ai_models": dict(models), "webhook_hours": hours, "services": services, "events": events[:60], "whatsapp": whatsapp, "rejected_templates": rejected_templates}

import itertools
import os
import time
import uuid
from typing import Annotated, Any

import jwt
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

os.environ.setdefault("MCP_ALLOWED_HOSTS", "testserver,localhost:*")
os.environ.setdefault("WEBHOOK_WORKER", "false")

from app.config import Settings, get_settings
from app.db import DbError
from app.deps import get_auth_admin, get_llm, AccountCtx, get_account, get_razorpay, get_service_db, get_user_db
from app.razorpay import RazorpayError
from app.main import create_app

JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234"
ENC_KEY = "11" * 32
RZP_SECRET = "rzp-key-secret-for-tests"
RZP_WEBHOOK_SECRET = "rzp-webhook-secret-for-tests"


# Column defaults the real database applies on insert.
DEFAULTS = {
    "payment_orders": {"status": "created", "razorpay_payment_id": None, "paid_at": None},
    "razorpay_events": {"status": "processing", "error": None},
    "subscriptions": {"cancel_at_period_end": False, "razorpay_subscription_id": None, "current_period_end": None},
    "assistants": {"enabled": False},
    "announcements": {"draft": False, "views": 0},
}


class FakeDb:
    """In-memory stand-in for Supabase. `tenant` mimics row-level security:
    a user-scoped handle only ever sees rows of its own account."""

    _ids = itertools.count(1)

    def __init__(self, store: dict[str, list[dict]], tenant: str | None = None, fail_on: set[str] | None = None):
        self.store = store
        self.tenant = tenant
        self.fail_on = fail_on if fail_on is not None else set()

    def _visible(self, table: str) -> list[dict]:
        rows = self.store.setdefault(table, [])
        if self.tenant is None:
            return rows
        return [r for r in rows if "account_id" not in r or r.get("account_id") == self.tenant]

    @staticmethod
    def _match(row: dict, filters: dict[str, str] | None) -> bool:
        return all(str(row.get(k)).lower() == str(v).lower() for k, v in (filters or {}).items())

    async def select(self, table, filters=None, *, order=None, limit=None):
        rows = [dict(r) for r in self._visible(table) if self._match(r, filters)]
        if order:
            col, _, direction = order.partition(".")
            rows.sort(key=lambda r: (isinstance(r.get(col), str), r.get(col)), reverse=direction == "desc")
        return rows[:limit] if limit else rows

    async def insert(self, table, row):
        if table in self.fail_on:
            raise RuntimeError(f"{table} is down")
        n = next(self._ids)
        # Tables with an identity column get increasing numbers, as in Postgres.
        ident = {"id": n} if table in ("support_messages", "business_notes", "audit_log") else {"id": str(uuid.uuid4())}
        if table == "support_tickets":
            ident["number"] = 1041 + len(self.store.get("support_tickets", []))
        new = {**ident, "created_at": f"2026-01-01T00:00:{n:06d}Z", **DEFAULTS.get(table, {}), **row}
        self.store.setdefault(table, []).append(new)
        return dict(new)

    async def update(self, table, filters, patch):
        out = []
        for r in self._visible(table):
            if self._match(r, filters):
                r.update(patch)
                out.append(dict(r))
        return out

    async def delete(self, table, filters):
        visible = self._visible(table)
        gone = [r for r in visible if self._match(r, filters)]
        self.store[table] = [r for r in self.store.get(table, []) if not any(r is g for g in gone)]
        return [dict(g) for g in gone]

    async def upsert(self, table, row, on_conflict):
        return await self.insert(table, row)

    async def count(self, table, filters=None, *, since=None):
        rows = [r for r in self._visible(table) if self._match(r, filters)]
        if since:
            rows = [r for r in rows if str(r.get(since[0]) or "") >= since[1]]
        return len(rows)

    async def rpc(self, name, params):
        if name == "close_account_data":
            keep = {"accounts", "profiles", "wallet_ledger", "wallet_balances", "invoices", "payment_orders", "subscriptions", "audit_log", "razorpay_events"}
            n = 0
            for table, rows in self.store.items():
                if table in keep:
                    continue
                before = len(rows)
                self.store[table] = [r for r in rows if r.get("account_id") != params["p_account"]]
                n += before - len(self.store[table])
            return {"deleted_rows": n, "passes": 1}
        if name == "next_invoice_number":
            n = len(self.store.get("invoices", [])) + 1
            return f"INV-2026-{n:06d}"
        if name != "wallet_apply":
            raise NotImplementedError(name)
        acct, amount, key = params["p_account"], params["p_amount"], params["p_idem_key"]
        balances = self.store.setdefault("wallet_balances", [])
        row = next((b for b in balances if b["account_id"] == acct), None)
        if row is None:
            row = {"account_id": acct, "balance_paise": 0}
            balances.append(row)
        ledger = self.store.setdefault("wallet_ledger", [])
        if any(entry["idem_key"] == key for entry in ledger):
            return {"applied": False, "balance_paise": row["balance_paise"]}
        if row["balance_paise"] + amount < 0:
            raise DbError(400, '{"message":"insufficient_funds"}')
        row["balance_paise"] += amount
        ledger.append({"id": len(ledger) + 1, "account_id": acct, "kind": params["p_kind"], "amount_paise": amount, "balance_after": row["balance_paise"], "ref": params["p_ref"], "idem_key": key, "created_by": params.get("p_created_by"), "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()})
        return {"applied": True, "balance_paise": row["balance_paise"]}


class FakeRazorpay:
    key_id = "rzp_test_FAKEKEY123"

    def __init__(self):
        self.orders: list[dict] = []
        self.plans: list[dict] = []
        self.subscriptions: list[dict] = []
        self.cancelled: list[tuple[str, bool]] = []
        self.refunds: list[dict] = []
        self.fail = False

    def _check(self):
        if self.fail:
            raise RazorpayError(500, "down")

    async def create_order(self, amount_paise, receipt, notes):
        self._check()
        order = {"id": f"order_{len(self.orders) + 1}", "amount": amount_paise, "notes": notes}
        self.orders.append(order)
        return order

    async def create_plan(self, period, amount_paise, name):
        self._check()
        plan = {"id": f"plan_{len(self.plans) + 1}", "period": period, "amount": amount_paise}
        self.plans.append(plan)
        return plan

    async def create_subscription(self, plan_id, total_count, notes, start_at=None):
        self._check()
        sub = {"id": f"sub_{len(self.subscriptions) + 1}", "plan_id": plan_id, "total_count": total_count, "start_at": start_at}
        self.subscriptions.append(sub)
        return sub

    async def cancel_subscription(self, subscription_id, at_cycle_end):
        self._check()
        self.cancelled.append((subscription_id, at_cycle_end))
        return {"id": subscription_id}

    async def refund(self, payment_id, amount_paise, notes):
        self._check()
        out = {"id": f"rfnd_{len(self.refunds) + 1}", "payment_id": payment_id, "amount": amount_paise, "status": "pending"}
        self.refunds.append(out)
        return out


class FakeLlm:
    def __init__(self):
        self.calls: list[dict] = []
        self.answer = "We open at 9am."
        self.fail = False

    async def complete(self, vendor, api_key, model, system, messages):
        from app.llm import LlmError, LlmResult

        if self.fail:
            raise LlmError("down")
        self.calls.append({"vendor": vendor, "api_key": api_key, "model": model, "system": system, "messages": messages})
        return LlmResult(self.answer, 10, 5)


class FakeAuthAdmin:
    def __init__(self, world):
        self.world = world
        self.invited: list[str] = []

    async def invite(self, email, name):
        self.invited.append(email)
        existing = next((u for n, u in self.world.users.items() if f"{n}@example.com" == email), None)
        existing = existing or next((p["user_id"] for p in self.world.rows("profiles") if p.get("email") == email), None)
        if existing:
            return existing
        uid = self.world.add_user(email.split("@")[0], None, None, bare=True)
        next(p for p in self.world.rows("profiles") if p["user_id"] == uid)["email"] = email
        return uid


class World:
    """Two businesses, people with each role, and platform staff, on one fake database."""

    def __init__(self):
        self.store: dict[str, list[dict]] = {}
        self.fail_on: set[str] = set()
        self.service = FakeDb(self.store, fail_on=self.fail_on)
        self.users: dict[str, str] = {}
        self.acct_a = str(uuid.uuid4())
        self.acct_b = str(uuid.uuid4())
        for name, acct, role in [
            ("owner_a", self.acct_a, "owner"),
            ("admin_a", self.acct_a, "admin"),
            ("agent_a", self.acct_a, "agent"),
            ("viewer_a", self.acct_a, "viewer"),
            ("admin_b", self.acct_b, "admin"),
        ]:
            self.add_user(name, acct, role)
        for aid, nm in ((self.acct_a, "Business A"), (self.acct_b, "Business B")):
            self.store.setdefault("accounts", []).append({"id": aid, "name": nm, "status": "active", "industry": "", "city": "", "created_at": "2026-01-01T00:00:00Z", "owner_user_id": None})
        self.add_user("loner", None, None)
        for name, role in [("staff_super", "super_admin"), ("staff_finance", "finance"), ("staff_support", "support")]:
            uid = self.add_user(name, None, None)
            self.store.setdefault("platform_admins", []).append({"user_id": uid, "role": role})
        self.store["plans"] = [
            {"id": "starter", "name": "Starter", "monthly_paise": 99900, "seats": 2, "contacts": 1000, "ai_replies": 1000, "popular": False, "active": True, "razorpay_plan_monthly": None, "razorpay_plan_yearly": None},
            {"id": "growth", "name": "Growth", "monthly_paise": 249900, "seats": 5, "contacts": 10000, "ai_replies": 5000, "popular": True, "active": True, "razorpay_plan_monthly": None, "razorpay_plan_yearly": None},
            {"id": "pro", "name": "Pro", "monthly_paise": 599900, "seats": 15, "contacts": None, "ai_replies": 20000, "popular": False, "active": True, "razorpay_plan_monthly": None, "razorpay_plan_yearly": None},
        ]
        self.store["platform_ai_providers"] = [
            {"vendor": v, "enabled": False, "key_ciphertext": None, "key_tail": None, "saved_at": None}
            for v in ("openai", "google", "anthropic", "deepseek", "deepinfra")
        ]
        self.store["platform_ai_models"] = [
            {"vendor": "openai", "model_id": "gpt-5.4-mini", "label": "GPT-5.4 Mini", "tier": "fast", "enabled": True, "is_custom": False, "is_default": True},
            {"vendor": "openai", "model_id": "gpt-5.5", "label": "GPT-5.5", "tier": "flagship", "enabled": True, "is_custom": False, "is_default": False},
            {"vendor": "anthropic", "model_id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5", "tier": "balanced", "enabled": True, "is_custom": False, "is_default": False},
        ]

    def add_user(self, name: str, account: str | None, role: str | None, bare: bool = False) -> str:
        uid = str(uuid.uuid4())
        self.users[name] = uid
        if bare:  # a brand-new login: Supabase's trigger gives it a profile and an empty personal account of its own
            personal = str(uuid.uuid4())
            self.store.setdefault("accounts", []).append({"id": personal, "name": name, "status": "active", "industry": "", "city": "", "created_at": "2026-01-01T00:00:00Z", "owner_user_id": uid})
            self.store.setdefault("profiles", []).append({"id": str(uuid.uuid4()), "user_id": uid, "full_name": name, "email": f"{name}@example.com", "account_id": personal, "account_role": "owner"})
            return uid
        profile: dict[str, Any] = {"id": str(uuid.uuid4()), "user_id": uid, "full_name": name, "email": f"{name}@example.com"}
        if account:
            profile.update(account_id=account, account_role=role)
        self.store.setdefault("profiles", []).append(profile)
        return uid

    def token(self, name: str, *, secret: str = JWT_SECRET, expires_in: int = 3600, audience: str = "authenticated") -> str:
        claims = {"sub": self.users[name], "email": f"{name}@example.com", "aud": audience, "exp": int(time.time()) + expires_in}
        return jwt.encode(claims, secret, algorithm="HS256")

    def headers(self, name: str, **kw) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token(name, **kw)}"}

    def rows(self, table: str) -> list[dict]:
        return self.store.setdefault(table, [])


@pytest.fixture
def world() -> World:
    return World()


@pytest.fixture
def settings() -> Settings:
    return Settings(supabase_url="https://x.supabase.co", supabase_jwt_secret=JWT_SECRET, encryption_key=ENC_KEY, razorpay_key_id="rzp_test_FAKEKEY123", razorpay_key_secret=RZP_SECRET, razorpay_webhook_secret=RZP_WEBHOOK_SECRET)


@pytest.fixture
def rzp() -> FakeRazorpay:
    return FakeRazorpay()


@pytest.fixture
def auth_admin(world) -> FakeAuthAdmin:
    return FakeAuthAdmin(world)


@pytest.fixture
def llm() -> FakeLlm:
    return FakeLlm()


@pytest.fixture
def client(world: World, settings: Settings, rzp: FakeRazorpay, llm: FakeLlm, auth_admin: FakeAuthAdmin):
    async def fake_user_db(ctx: Annotated[AccountCtx, Depends(get_account)]):
        return FakeDb(world.store, tenant=ctx.account_id, fail_on=world.fail_on)

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_service_db] = lambda: world.service
    app.dependency_overrides[get_user_db] = fake_user_db
    app.dependency_overrides[get_razorpay] = lambda: rzp
    app.dependency_overrides[get_llm] = lambda: llm
    app.dependency_overrides[get_auth_admin] = lambda: auth_admin
    with TestClient(app) as c:
        yield c

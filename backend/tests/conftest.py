import itertools
import time
import uuid
from typing import Annotated, Any

import jwt
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.deps import AccountCtx, get_account, get_service_db, get_user_db
from app.main import app

JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234"
ENC_KEY = "11" * 32


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
            rows.sort(key=lambda r: str(r.get(col)), reverse=direction == "desc")
        return rows[:limit] if limit else rows

    async def insert(self, table, row):
        if table in self.fail_on:
            raise RuntimeError(f"{table} is down")
        new = {"id": str(uuid.uuid4()), "created_at": f"2026-01-01T00:00:{next(self._ids):06d}Z", **row}
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
        self.add_user("loner", None, None)
        for name, role in [("staff_super", "super_admin"), ("staff_finance", "finance"), ("staff_support", "support")]:
            uid = self.add_user(name, None, None)
            self.store.setdefault("platform_admins", []).append({"user_id": uid, "role": role})
        self.store["platform_ai_providers"] = [
            {"vendor": v, "enabled": False, "key_ciphertext": None, "key_tail": None, "saved_at": None}
            for v in ("openai", "google", "anthropic", "deepseek", "deepinfra")
        ]
        self.store["platform_ai_models"] = [
            {"vendor": "openai", "model_id": "gpt-5.4-mini", "label": "GPT-5.4 Mini", "tier": "fast", "enabled": True, "is_custom": False, "is_default": True},
            {"vendor": "openai", "model_id": "gpt-5.5", "label": "GPT-5.5", "tier": "flagship", "enabled": True, "is_custom": False, "is_default": False},
            {"vendor": "anthropic", "model_id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5", "tier": "balanced", "enabled": True, "is_custom": False, "is_default": False},
        ]

    def add_user(self, name: str, account: str | None, role: str | None) -> str:
        uid = str(uuid.uuid4())
        self.users[name] = uid
        profile: dict[str, Any] = {"id": uid}
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
        return self.store.get(table, [])


@pytest.fixture
def world() -> World:
    return World()


@pytest.fixture
def settings() -> Settings:
    return Settings(supabase_url="https://x.supabase.co", supabase_jwt_secret=JWT_SECRET, encryption_key=ENC_KEY)


@pytest.fixture
def client(world: World, settings: Settings):
    async def fake_user_db(ctx: Annotated[AccountCtx, Depends(get_account)]):
        return FakeDb(world.store, tenant=ctx.account_id, fail_on=world.fail_on)

    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_service_db] = lambda: world.service
    app.dependency_overrides[get_user_db] = fake_user_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

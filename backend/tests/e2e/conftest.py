"""End-to-end tests: the real FastAPI app on a real Postgres (migrations applied, real triggers,
real row-level security, real SQL functions). Skipped unless E2E_PG_DSN is set.

    E2E_PG_DSN="host=/tmp port=5544 user=postgres dbname=t" pytest tests/e2e
"""

import os
import time
import uuid

import httpx
import jwt
import psycopg
import pytest
from fastapi.testclient import TestClient

from app import db as app_db
from app.config import Settings, get_settings
from app.deps import get_auth_admin, get_llm, get_razorpay

from ..conftest import ENC_KEY, JWT_SECRET, RZP_SECRET, RZP_WEBHOOK_SECRET, FakeLlm, FakeRazorpay
from .pgrest_shim import make_app

DSN = os.environ.get("E2E_PG_DSN")
SERVICE_KEY = "service-key-for-e2e"


def sql(query: str, *args):
    with psycopg.connect(DSN, autocommit=True) as c:
        cur = c.execute(query, args)
        return cur.fetchall() if cur.description else []


class E2ERazorpay(FakeRazorpay):
    """The database keeps its rows between runs, so ids must never repeat."""

    async def create_order(self, amount_paise, receipt, notes):
        order = await super().create_order(amount_paise, receipt, notes)
        order["id"] = f"order_{uuid.uuid4().hex[:14]}"
        return order


class RealAuthAdmin:
    """Creates the login in auth.users, so Supabase's signup trigger runs for real."""

    async def invite(self, email: str, name: str) -> str:
        found = sql("SELECT id FROM auth.users WHERE email = %s", email)
        if found:
            return str(found[0][0])
        return str(sql("INSERT INTO auth.users (email, raw_user_meta_data) VALUES (%s, jsonb_build_object('full_name', %s::text)) RETURNING id", email, name)[0][0])


class Env:
    def __init__(self, client, rzp, llm):
        self.client, self.rzp, self.llm = client, rzp, llm

    def user(self, label: str = "u") -> dict:
        email = f"{label}-{uuid.uuid4().hex[:8]}@e2e.test"
        uid = str(sql("INSERT INTO auth.users (email, raw_user_meta_data) VALUES (%s, jsonb_build_object('full_name', %s::text)) RETURNING id", email, label)[0][0])
        acct = str(sql("SELECT account_id FROM profiles WHERE user_id = %s", uid)[0][0])
        return {"id": uid, "email": email, "account_id": acct, "h": self.headers(uid)}

    def headers(self, uid: str) -> dict:
        tok = jwt.encode({"sub": uid, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")
        return {"Authorization": f"Bearer {tok}"}

    def staff(self, role: str = "super_admin") -> dict:
        u = self.user("staff")
        sql("INSERT INTO platform_admins (user_id, role) VALUES (%s, %s)", u["id"], role)
        return u


@pytest.fixture(scope="session")
def env():
    # What Supabase grants by default. Functions go to service_role only, so the migrations'
    # REVOKE on wallet_apply (users must not call it) stays in force.
    sql("GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, authenticated")
    sql("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated")
    sql("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role")
    shim = make_app(DSN, SERVICE_KEY, JWT_SECRET)
    original = app_db.SupabaseDb.__init__

    def init(self, settings, bearer, apikey, client=None):
        original(self, settings, bearer, apikey, client or httpx.AsyncClient(transport=httpx.ASGITransport(app=shim)))

    app_db.SupabaseDb.__init__ = init
    os.environ["WEBHOOK_WORKER"] = "false"
    from app.main import create_app

    settings = Settings(supabase_url="https://x.supabase.co", supabase_service_role_key=SERVICE_KEY, supabase_anon_key="anon", supabase_jwt_secret=JWT_SECRET, encryption_key=ENC_KEY, razorpay_key_id="rzp_test_FAKEKEY123", razorpay_key_secret=RZP_SECRET, razorpay_webhook_secret=RZP_WEBHOOK_SECRET)
    rzp, llm = E2ERazorpay(), FakeLlm()
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_razorpay] = lambda: rzp
    app.dependency_overrides[get_llm] = lambda: llm
    app.dependency_overrides[get_auth_admin] = lambda: RealAuthAdmin()
    with TestClient(app) as client:
        yield Env(client, rzp, llm)
    app_db.SupabaseDb.__init__ = original

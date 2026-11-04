"""Serves the real API over HTTP on a real Postgres, for driving the real UI in a browser.

    E2E_PG_DSN="host=/tmp port=5544 user=postgres dbname=t" python -m tests.e2e.serve
Writes a ready-made login for a fresh test user to $E2E_LOGIN_FILE (default /tmp/e2e-login.json).
"""

import os

# Must come before anything imports app.main: settings are cached on first use.
os.environ["CORS_ORIGINS"] = os.environ.get("E2E_ORIGIN", "http://localhost:3111")  # as in a real deployment
os.environ["WEBHOOK_WORKER"] = "false"

import json
import time
import uuid

import httpx
import jwt
import psycopg
import uvicorn

from app import db as app_db
from app.config import Settings, get_settings
from app.deps import get_auth_admin, get_llm, get_razorpay

from ..conftest import ENC_KEY, JWT_SECRET, RZP_SECRET, RZP_WEBHOOK_SECRET, FakeLlm
from .conftest import E2ERazorpay, RealAuthAdmin, SERVICE_KEY
from .pgrest_shim import make_app

DSN = os.environ["E2E_PG_DSN"]
ORIGIN = os.environ.get("E2E_ORIGIN", "http://localhost:3111")


def main() -> None:
    with psycopg.connect(DSN, autocommit=True) as c:
        c.execute("GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, authenticated")
        c.execute("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated")
        c.execute("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role")
        uid = str(c.execute("INSERT INTO auth.users (email, raw_user_meta_data) VALUES (%s, '{\"full_name\":\"Browser Tester\"}') RETURNING id", (f"ui-{uuid.uuid4().hex[:8]}@e2e.test",)).fetchone()[0])
    token = jwt.encode({"sub": uid, "aud": "authenticated", "exp": int(time.time()) + 6 * 3600}, JWT_SECRET, algorithm="HS256")
    json.dump({"user_id": uid, "token": token}, open(os.environ.get("E2E_LOGIN_FILE", "/tmp/e2e-login.json"), "w"))

    shim = make_app(DSN, SERVICE_KEY, JWT_SECRET)
    original = app_db.SupabaseDb.__init__
    app_db.SupabaseDb.__init__ = lambda self, s, b, a, client=None: original(self, s, b, a, client or httpx.AsyncClient(transport=httpx.ASGITransport(app=shim)))
    settings = Settings(supabase_url="https://x.supabase.co", supabase_service_role_key=SERVICE_KEY, supabase_anon_key="anon", supabase_jwt_secret=JWT_SECRET, encryption_key=ENC_KEY, razorpay_key_id="rzp_test_FAKEKEY123", razorpay_key_secret=RZP_SECRET, razorpay_webhook_secret=RZP_WEBHOOK_SECRET, cors_origins=ORIGIN)
    from app.main import create_app
    from app import events

    # This sandbox has no outside DNS. Names resolve to a public address (as they would in production);
    # real IP addresses resolve to themselves, so private ones are still refused.
    import ipaddress

    def resolve(host, port, **kw):
        try:
            ip = str(ipaddress.ip_address(host))
        except ValueError:
            ip = "10.0.0.1" if host.endswith(".internal") else "93.184.216.34"
        return [(2, 1, 6, "", (ip, port))]

    events.socket.getaddrinfo = resolve

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_razorpay] = lambda: E2ERazorpay()
    app.dependency_overrides[get_llm] = lambda: FakeLlm()
    app.dependency_overrides[get_auth_admin] = lambda: RealAuthAdmin()
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("E2E_PORT", "8099")), log_level="warning")


if __name__ == "__main__":
    main()

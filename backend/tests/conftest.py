import hashlib
import hmac
import json
import time
from collections.abc import Iterator
from uuid import UUID, uuid4

import jwt
import pytest
import respx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import MemberRole, Tenant, utcnow
from app.repositories.memory import MemoryRepository

APP_ID = "1234567890"
APP_SECRET = "test-app-secret"
JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes!!"
SUPABASE_URL = "https://project.supabase.co"
GRAPH = "https://graph.facebook.com/v24.0"
WABA_ID = "102290129340398"
PHONE_ID = "106540352242922"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        meta_app_id=APP_ID,
        meta_app_secret=APP_SECRET,
        meta_graph_version="v24.0",
        whatsapp_webhook_verify_token="verify-me",
        token_encryption_key=Fernet.generate_key().decode(),
        repository_backend="memory",
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=JWT_SECRET,
    )


@pytest.fixture
def repo() -> MemoryRepository:
    return MemoryRepository()


@pytest.fixture
def client(settings: Settings, repo: MemoryRepository) -> Iterator[TestClient]:
    from app.config import get_settings
    from app.deps import limiter

    limiter._hits.clear()
    app = create_app(settings, repo)
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def graph() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


def make_token(user_id: UUID, email: str = "owner@example.com") -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": str(user_id),
            "email": email,
            "aud": "authenticated",
            "iss": f"{SUPABASE_URL}/auth/v1",
            "iat": now,
            "exp": now + 3600,
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def make_member(
    repo: MemoryRepository, role: MemberRole = MemberRole.OWNER, name: str = "Acme"
) -> tuple[Tenant, UUID]:
    """Seed synchronously (the repo's lock belongs to the TestClient's event loop)."""
    tenant = Tenant(id=uuid4(), name=name, created_at=utcnow())
    user = uuid4()
    repo.tenants[tenant.id] = tenant
    repo.members[(tenant.id, user)] = role
    return tenant, user


def headers(user_id: UUID, tenant_id: UUID | None = None) -> dict[str, str]:
    result = {"Authorization": f"Bearer {make_token(user_id)}"}
    if tenant_id is not None:
        result["X-Tenant-Id"] = str(tenant_id)
    return result


def signed(payload: dict) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(payload).encode()
    signature = hmac.new(APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return body, {"X-Hub-Signature-256": f"sha256={signature}", "Content-Type": "application/json"}

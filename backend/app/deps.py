"""FastAPI dependencies: settings, storage, Meta client, Supabase auth and tenant scoping."""

import time
from collections import defaultdict, deque
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from anyio import to_thread
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.models import MemberRole
from app.repositories.base import Repository
from app.services.crypto import SecretBox
from app.services.meta_graph import MetaGraphClient
from app.services.onboarding import OnboardingService

bearer = HTTPBearer(auto_error=False)


def get_repo(request: Request) -> Repository:
    return request.app.state.repo


def get_graph(request: Request) -> MetaGraphClient:
    return request.app.state.graph


@lru_cache
def _secret_box(key: str) -> SecretBox:
    return SecretBox(key)


def get_onboarding(
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[Repository, Depends(get_repo)],
    graph: Annotated[MetaGraphClient, Depends(get_graph)],
) -> OnboardingService:
    return OnboardingService(
        repo=repo,
        graph=graph,
        box=_secret_box(settings.token_encryption_key.get_secret_value()),
        app_id=settings.meta_app_id,
    )


@dataclass(frozen=True)
class AuthUser:
    id: UUID
    email: str | None


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)


async def current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthUser:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in to continue",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    token = credentials.credentials
    try:
        if settings.supabase_jwt_secret is not None:
            key: object = settings.supabase_jwt_secret.get_secret_value()
            algorithms = ["HS256"]
        else:
            signing_key = await to_thread.run_sync(
                _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt, token
            )
            key = signing_key.key
            algorithms = ["RS256", "ES256"]
        claims = jwt.decode(
            token,
            key,  # type: ignore[arg-type]
            algorithms=algorithms,
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
        )
        return AuthUser(id=UUID(claims["sub"]), email=claims.get("email"))
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise unauthorized from exc


@dataclass(frozen=True)
class TenantContext:
    tenant_id: UUID
    user: AuthUser
    role: MemberRole


async def tenant_context(
    user: Annotated[AuthUser, Depends(current_user)],
    repo: Annotated[Repository, Depends(get_repo)],
    x_tenant_id: Annotated[UUID, Header(description="Workspace (tenant) to act on")],
) -> TenantContext:
    role = await repo.get_member_role(x_tenant_id, user.id)
    if role is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a member of this workspace")
    return TenantContext(tenant_id=x_tenant_id, user=user, role=role)


async def tenant_admin(ctx: Annotated[TenantContext, Depends(tenant_context)]) -> TenantContext:
    if ctx.role not in (MemberRole.OWNER, MemberRole.ADMIN):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only workspace owners and admins can do this"
        )
    return ctx


class SlidingWindowLimiter:
    """Small in-process limiter; put a shared limiter (e.g. at the proxy) in front for scale-out."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts; wait a minute"
            )
        hits.append(now)


limiter = SlidingWindowLimiter()

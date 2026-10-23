from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import Settings, get_settings
from app.deps import (
    TenantContext,
    get_onboarding,
    get_repo,
    limiter,
    tenant_admin,
    tenant_context,
)
from app.models import WhatsAppAccount
from app.repositories.base import Repository, WabaOwnedByAnotherTenant
from app.schemas import AccountEnvelope, EmbeddedSignupIn, MessageOut, WhatsAppAccountOut
from app.services.onboarding import OnboardingError, OnboardingService

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


def _onboarding_http_error(exc: OnboardingError) -> HTTPException:
    return HTTPException(exc.status_code, {"step": exc.step, "message": exc.message})


async def _require_account(repo: Repository, ctx: TenantContext) -> WhatsAppAccount:
    account = await repo.get_account_by_tenant(ctx.tenant_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "WhatsApp is not connected")
    return account


@router.get("/account", response_model=AccountEnvelope)
async def get_account(
    ctx: Annotated[TenantContext, Depends(tenant_context)],
    repo: Annotated[Repository, Depends(get_repo)],
) -> AccountEnvelope:
    account = await repo.get_account_by_tenant(ctx.tenant_id)
    return AccountEnvelope(account=WhatsAppAccountOut.from_account(account) if account else None)


@router.post("/embedded-signup", response_model=WhatsAppAccountOut)
async def embedded_signup(
    body: EmbeddedSignupIn,
    ctx: Annotated[TenantContext, Depends(tenant_admin)],
    onboarding: Annotated[OnboardingService, Depends(get_onboarding)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> WhatsAppAccountOut:
    limiter.check(f"signup:{ctx.tenant_id}", settings.signup_rate_limit_per_minute)
    try:
        account = await onboarding.complete_signup(
            tenant_id=ctx.tenant_id,
            code=body.code,
            waba_id=body.waba_id,
            phone_number_id=body.phone_number_id,
            onboarding_type=body.onboarding_type,
        )
    except OnboardingError as exc:
        raise _onboarding_http_error(exc) from exc
    except WabaOwnedByAnotherTenant as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"step": "store", "message": "This WhatsApp account is connected to another workspace"},
        ) from exc
    return WhatsAppAccountOut.from_account(account)


@router.post("/account/refresh", response_model=WhatsAppAccountOut)
async def refresh_account(
    ctx: Annotated[TenantContext, Depends(tenant_context)],
    repo: Annotated[Repository, Depends(get_repo)],
    onboarding: Annotated[OnboardingService, Depends(get_onboarding)],
) -> WhatsAppAccountOut:
    account = await _require_account(repo, ctx)
    try:
        return WhatsAppAccountOut.from_account(await onboarding.refresh(account))
    except OnboardingError as exc:
        raise _onboarding_http_error(exc) from exc


@router.post("/account/retry", response_model=WhatsAppAccountOut)
async def retry_account(
    ctx: Annotated[TenantContext, Depends(tenant_admin)],
    repo: Annotated[Repository, Depends(get_repo)],
    onboarding: Annotated[OnboardingService, Depends(get_onboarding)],
) -> WhatsAppAccountOut:
    account = await _require_account(repo, ctx)
    try:
        return WhatsAppAccountOut.from_account(await onboarding.retry(account))
    except OnboardingError as exc:
        raise _onboarding_http_error(exc) from exc


@router.delete("/account", response_model=WhatsAppAccountOut)
async def disconnect_account(
    ctx: Annotated[TenantContext, Depends(tenant_admin)],
    repo: Annotated[Repository, Depends(get_repo)],
    onboarding: Annotated[OnboardingService, Depends(get_onboarding)],
) -> WhatsAppAccountOut:
    account = await _require_account(repo, ctx)
    return WhatsAppAccountOut.from_account(await onboarding.disconnect(account))


@router.get("/messages", response_model=list[MessageOut])
async def list_messages(
    ctx: Annotated[TenantContext, Depends(tenant_context)],
    repo: Annotated[Repository, Depends(get_repo)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[MessageOut]:
    return [MessageOut(**vars(m)) for m in await repo.list_messages(ctx.tenant_id, limit)]

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.deps import AuthUser, current_user, get_repo
from app.models import MemberRole
from app.repositories.base import Repository
from app.schemas import TenantIn, TenantOut

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


@router.get("", response_model=list[TenantOut])
async def list_my_tenants(
    user: Annotated[AuthUser, Depends(current_user)],
    repo: Annotated[Repository, Depends(get_repo)],
) -> list[TenantOut]:
    return [
        TenantOut(id=t.id, name=t.name, role=role, created_at=t.created_at)
        for t, role in await repo.list_tenants_for_user(user.id)
    ]


@router.post("", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantIn,
    user: Annotated[AuthUser, Depends(current_user)],
    repo: Annotated[Repository, Depends(get_repo)],
) -> TenantOut:
    tenant = await repo.create_tenant(body.name.strip(), user.id)
    return TenantOut(
        id=tenant.id, name=tenant.name, role=MemberRole.OWNER, created_at=tenant.created_at
    )

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..deps import PlatformAdmin, ServiceDb, get_platform_admin
from ..db import Db

router = APIRouter(prefix="/v1/platform", tags=["platform"])


@router.get("/audit")
async def audit_log(_: Annotated[PlatformAdmin, Depends(get_platform_admin)], sdb: ServiceDb, limit: int = Query(100, ge=1, le=500)):
    """Newest first: every admin and account action the backend recorded."""
    rows: list = await sdb.select("audit_log", order="created_at.desc", limit=limit)
    return rows

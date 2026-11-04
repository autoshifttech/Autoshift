from fastapi import APIRouter

from ..deps import Member, ServiceDb

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me")
async def me(ctx: Member, sdb: ServiceDb):
    """Who is calling: user, workspace, role, and whether they are platform staff."""
    admin = await sdb.select("platform_admins", {"user_id": ctx.user.id}, limit=1)
    return {
        "user": {"id": ctx.user.id, "email": ctx.user.email},
        "account_id": ctx.account_id,
        "role": ctx.role,
        "platform_admin": admin[0]["role"] if admin else None,
    }

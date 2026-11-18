"""Which pages a business gets: its own view, the sign-up choice, access requests, and the staff controls."""

from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import audit, pages
from ..deps import AdminMember, Member, PlatformAdmin, ServiceDb, get_platform_admin, require_platform_role

router = APIRouter(tags=["pages"])
AnyStaff = Annotated[PlatformAdmin, Depends(get_platform_admin)]
Manager = Annotated[PlatformAdmin, Depends(require_platform_role("support"))]
SuperOnly = Annotated[PlatformAdmin, Depends(require_platform_role())]

BusinessType = Literal["retail", "restaurant", "clinic", "salon", "real_estate", "education", "services", "other"]
ShopSource = Literal["whatsapp", "shopify", "website"]
PAGE_LABELS = {
    "leads": "Leads", "orders": "Orders", "insights": "Insights", "broadcasts": "Broadcasts", "templates": "Templates",
    "drips": "Drips", "segments": "Segments", "automations": "Automations", "flows": "Flows", "ai_tools": "AI tools",
}


class TypeChoice(BaseModel):
    business_type: BusinessType
    shop_source: ShopSource | None = None


class AccessRequest(BaseModel):
    page: str = Field(min_length=1, max_length=40)
    note: str = Field("", max_length=1000)


class PagesPatch(BaseModel):
    pages: list[str] | None = Field(None, max_length=40)  # the optional pages to switch on; None = every page
    business_type: BusinessType | None = None
    shop_source: ShopSource | None = None


class ResetBody(BaseModel):
    business_type: BusinessType | None = None


class DefaultsBody(BaseModel):
    defaults: dict[str, list[str]]


async def _account(sdb, account_id: str) -> dict:
    rows = await sdb.select("accounts", {"id": account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Business not found")
    return rows[0]


def _source(business_type: str, source: str | None) -> str | None:
    return (source or "whatsapp") if business_type in ("retail", "restaurant") else None


# ------------------------------------------------------------------ the business
@router.get("/v1/workspace/pages")
async def my_pages(ctx: Member, sdb: ServiceDb):
    return pages.describe(await _account(sdb, ctx.account_id))


@router.put("/v1/workspace/business-type")
async def choose_type(body: TypeChoice, ctx: AdminMember, sdb: ServiceDb):
    """Sign-up: what the business uses AutoShift for. Sets its starting pages once; after that only
    the AutoShift team changes the type or the pages."""
    acct = await _account(sdb, ctx.account_id)
    if acct.get("business_type") and acct["business_type"] != body.business_type:
        raise HTTPException(409, "The business type is already set. Ask AutoShift support to change it.")
    patch: dict = {"business_type": body.business_type, "shop_source": _source(body.business_type, body.shop_source)}
    if not acct.get("business_type"):
        patch["pages"] = (await pages.defaults(sdb))[body.business_type]
    rows = await sdb.update("accounts", {"id": ctx.account_id}, patch)
    await audit.record(sdb, scope="account", action="business.type_chosen", actor_id=ctx.user.id, account_id=ctx.account_id, target=ctx.account_id, details=patch)
    return pages.describe(rows[0] if rows else {**acct, **patch})


@router.post("/v1/workspace/pages/request", status_code=201)
async def request_page(body: AccessRequest, ctx: Member, sdb: ServiceDb):
    """"Request access" on a switched-off page: a support ticket for the AutoShift team."""
    if body.page not in pages.OPTIONAL:
        raise HTTPException(422, "Unknown page")
    acct = await _account(sdb, ctx.account_id)
    if body.page in pages.enabled(acct):
        return {"already_on": True}
    label = PAGE_LABELS[body.page]
    open_tickets = await sdb.select("support_tickets", {"account_id": ctx.account_id, "subject": f"Please switch on: {label}"}, limit=5)
    if any(t["status"] in ("open", "pending") for t in open_tickets):
        return {"already_requested": True}
    t = await sdb.insert("support_tickets", {"account_id": ctx.account_id, "subject": f"Please switch on: {label}", "category": "Other", "priority": "normal", "status": "open", "created_by": ctx.user.id})
    profile = await sdb.select("profiles", {"user_id": ctx.user.id}, limit=1)
    author = (profile[0].get("full_name") if profile else None) or "Customer"
    text = f"We'd like to use the {label} page." + (f"\n\n{body.note.strip()}" if body.note.strip() else "")
    await sdb.insert("support_messages", {"ticket": t["number"], "account_id": ctx.account_id, "sender": "business", "author": author, "text": text})
    await audit.record(sdb, scope="account", action="pages.requested", actor_id=ctx.user.id, account_id=ctx.account_id, target=body.page)
    return {"ticket": f"T-{t['number']}"}


# ------------------------------------------------------------------ the AutoShift team
@router.get("/v1/platform/businesses/{account_id}/pages")
async def business_pages(account_id: str, _: AnyStaff, sdb: ServiceDb):
    acct = await _account(sdb, account_id)
    return {**pages.describe(acct), "defaults": await pages.defaults(sdb)}


@router.put("/v1/platform/businesses/{account_id}/pages")
async def set_business_pages(account_id: str, body: PagesPatch, staff: Manager, sdb: ServiceDb):
    acct = await _account(sdb, account_id)
    patch: dict = {"pages": None if body.pages is None else pages.clean(body.pages)}
    if body.business_type:
        patch["business_type"] = body.business_type
        patch["shop_source"] = _source(body.business_type, body.shop_source or acct.get("shop_source"))
    elif body.shop_source and acct.get("business_type") in ("retail", "restaurant"):
        patch["shop_source"] = body.shop_source
    rows = await sdb.update("accounts", {"id": account_id}, patch)
    before, after = pages.enabled(acct), pages.enabled({**acct, **patch})
    await audit.record(sdb, scope="platform", action="pages.update", actor_id=staff.user.id, account_id=account_id, target=account_id, details={
        "on": [p for p in after if p not in before], "off": [p for p in before if p not in after], "business_type": patch.get("business_type"),
    })
    return pages.describe(rows[0] if rows else {**acct, **patch})


@router.post("/v1/platform/businesses/{account_id}/pages/reset")
async def reset_business_pages(account_id: str, body: ResetBody, staff: Manager, sdb: ServiceDb):
    """Back to the starting pages of the business type (optionally switching the type)."""
    acct = await _account(sdb, account_id)
    kind = body.business_type or acct.get("business_type") or "other"
    patch = {"business_type": kind, "shop_source": _source(kind, acct.get("shop_source")), "pages": (await pages.defaults(sdb))[kind]}
    rows = await sdb.update("accounts", {"id": account_id}, patch)
    await audit.record(sdb, scope="platform", action="pages.reset", actor_id=staff.user.id, account_id=account_id, target=account_id, details={"business_type": kind, "pages": patch["pages"]})
    return pages.describe(rows[0] if rows else {**acct, **patch})


@router.get("/v1/platform/page-defaults")
async def get_defaults(_: AnyStaff, sdb: ServiceDb):
    return {"defaults": await pages.defaults(sdb), "builtin": pages.BUILTIN_DEFAULTS, "optional": list(pages.OPTIONAL), "core": list(pages.CORE), "types": list(pages.TYPES)}


@router.put("/v1/platform/page-defaults")
async def set_defaults(body: DefaultsBody, staff: SuperOnly, sdb: ServiceDb):
    """The starting pages for each business type. Changes new businesses only; existing ones keep theirs."""
    unknown = [t for t in body.defaults if t not in pages.TYPES]
    if unknown:
        raise HTTPException(422, f"Unknown business type: {', '.join(unknown)}")
    current = await pages.defaults(sdb)
    value = {t: pages.clean(body.defaults.get(t, current[t])) for t in pages.TYPES}
    await sdb.upsert("platform_settings", {"key": pages.SETTING_KEY, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()}, on_conflict="key")
    await audit.record(sdb, scope="platform", action="pages.defaults", actor_id=staff.user.id, account_id=None, target=pages.SETTING_KEY, details=value)
    return {"defaults": value}

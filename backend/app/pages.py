"""Which pages each business gets.

A business picks what it uses AutoShift for at sign-up; that sets its starting pages. The AutoShift
team can then switch any page on or off for any business (admin panel), and edit the starting pages
for each business type. A switched-off page is hidden in the app and blocked in the API; nothing is
deleted, and switching it back on brings everything back.
"""

from typing import Any

from fastapi import HTTPException, Request

from .db import Db

TYPES = ("retail", "restaurant", "clinic", "salon", "real_estate", "education", "services", "other")
SHOP_SOURCES = ("whatsapp", "shopify", "website")
# Always on, so nobody is ever locked out of their workspace.
CORE = ("dashboard", "inbox", "contacts", "agents", "settings", "wallet", "support", "notifications", "opt_ins", "files")
OPTIONAL = ("leads", "orders", "appointments", "insights", "broadcasts", "templates", "drips", "segments", "automations", "flows", "ai_tools")

BUILTIN_DEFAULTS: dict[str, list[str]] = {
    "retail": ["leads", "orders", "insights", "broadcasts", "templates", "drips", "segments", "flows"],
    "restaurant": ["orders", "insights", "broadcasts", "templates", "segments"],
    "clinic": ["leads", "appointments", "insights", "broadcasts", "templates", "drips", "segments", "flows"],
    "salon": ["leads", "appointments", "insights", "broadcasts", "templates", "drips", "segments", "flows"],
    "real_estate": ["leads", "insights", "broadcasts", "templates", "drips", "segments", "flows"],
    "education": ["leads", "insights", "broadcasts", "templates", "drips", "segments", "flows"],
    "services": ["leads", "insights", "broadcasts", "templates", "drips", "automations", "flows"],
    "other": list(OPTIONAL),
}
SETTING_KEY = "page_defaults"

# API areas that belong to an optional page: switched off, they answer 403.
API_PAGES: tuple[tuple[str, str], ...] = (
    ("/v1/orders", "orders"),
    ("/v1/appointments", "appointments"),
    ("/v1/ws/leads", "leads"), ("/v1/ws/pipelines", "leads"),
    ("/v1/ws/broadcasts", "broadcasts"),
    ("/v1/ws/templates", "templates"),
    ("/v1/ws/segments", "segments"),
    ("/v1/ws/automations", "automations"),
    ("/v1/ws/flows", "flows"),
    ("/v1/ws/insights", "insights"),
    ("/v1/tools", "ai_tools"), ("/v1/custom-tools", "ai_tools"),
)


def clean(pages: list[str] | None) -> list[str]:
    """Known optional pages only, in the standard order."""
    wanted = set(pages or [])
    return [p for p in OPTIONAL if p in wanted]


async def defaults(sdb: Db) -> dict[str, list[str]]:
    """The starting pages per business type: the team's edits over the built-in ones."""
    rows = await sdb.select("platform_settings", {"key": SETTING_KEY}, limit=1)
    saved = rows[0]["value"] if rows and isinstance(rows[0].get("value"), dict) else {}
    return {t: clean(saved[t]) if isinstance(saved.get(t), list) else clean(BUILTIN_DEFAULTS[t]) for t in TYPES}


def enabled(account: dict[str, Any]) -> list[str]:
    """The optional pages this business has (NULL = all of them)."""
    pages = account.get("pages")
    return list(OPTIONAL) if pages is None else clean(pages)


def describe(account: dict[str, Any]) -> dict[str, Any]:
    on = enabled(account)
    return {
        "business_type": account.get("business_type"), "shop_source": account.get("shop_source"),
        "pages": [*CORE, *on], "optional_on": on, "all": account.get("pages") is None,
        "core": list(CORE), "optional": list(OPTIONAL),
    }


async def has(sdb: Db, account_id: str, page: str) -> bool:
    if page not in OPTIONAL:
        return True
    rows = await sdb.select("accounts", {"id": account_id}, limit=1)
    return bool(rows) and page in enabled(rows[0])


def page_for(path: str) -> str | None:
    return next((page for prefix, page in API_PAGES if path == prefix or path.startswith(prefix + "/")), None)


async def guard(request: Request, sdb: Db, account_id: str) -> None:
    """403 when the API area this request belongs to is switched off for the business."""
    page = page_for(request.url.path)
    if page and not await has(sdb, account_id, page):
        raise HTTPException(403, f"The {page.replace('_', ' ')} feature isn't switched on for this business. Ask AutoShift support to switch it on.")

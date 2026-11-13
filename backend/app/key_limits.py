"""Safety for API keys (MCP and automation tools).

* Daily limits per key: messages sent, broadcast recipients, AI replies. A runaway AI or a leaked
  key can only do so much in a day. Defaults below; platform_settings 'api_key_limits' overrides.
  Logins (people in the app) are not limited here.
* Request ids: a send or broadcast repeated with the same request id returns the first answer
  instead of doing it again, so an AI app's retry never sends twice.
* A short in-memory cache for heavy staff reports.
"""

import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from fastapi import HTTPException

from .db import Db

DEFAULT_LIMITS = {"messages": 300, "broadcast_recipients": 2000, "ai_replies": 200}
LABEL = {"messages": "messages", "broadcast_recipients": "broadcast recipients", "ai_replies": "AI replies"}


async def limits(sdb: Db) -> dict[str, int]:
    rows = await sdb.select("platform_settings", {"key": "api_key_limits"}, limit=1)
    override = rows[0]["value"] if rows and isinstance(rows[0].get("value"), dict) else {}
    return {k: int(override.get(k, v)) for k, v in DEFAULT_LIMITS.items()}


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def used_today(sdb: Db, key_id: str) -> dict[str, int]:
    rows = await sdb.select("api_key_usage", {"key_id": key_id, "day": _today()})
    out = {k: 0 for k in DEFAULT_LIMITS}
    for r in rows:
        out[r["metric"]] = int(r["used"])
    return out


async def check(sdb: Db, user, metric: str, amount: int = 1) -> None:
    """Refuse (429) when this key would go over today's limit. Logins are never limited here."""
    if not getattr(user, "key_id", None) or amount <= 0:
        return
    cap = (await limits(sdb))[metric]
    have = (await used_today(sdb, user.key_id))[metric]
    if have + amount > cap:
        raise HTTPException(429, f"This API key reached today's limit of {cap} {LABEL[metric]} ({have} used). It resets at midnight UTC; people can still do this in the app.")


async def consume(sdb: Db, user, metric: str, amount: int = 1) -> None:
    """Count usage after the action went through."""
    if not getattr(user, "key_id", None) or amount <= 0:
        return
    have = (await used_today(sdb, user.key_id))[metric]
    await sdb.upsert("api_key_usage", {"key_id": user.key_id, "day": _today(), "metric": metric, "used": have + amount}, "key_id,day,metric")


async def remembered(sdb: Db, user, request_id: str | None, route: str) -> Any | None:
    """The first answer to this request id, if this key already made the request."""
    if not request_id or not getattr(user, "key_id", None):
        return None
    rows = await sdb.select("api_idempotency", {"key_id": user.key_id, "request_id": request_id}, limit=1)
    if not rows:
        return None
    if rows[0]["route"] != route:
        raise HTTPException(409, "This request id was already used for a different action")
    return rows[0]["response"]


async def remember(sdb: Db, user, request_id: str | None, route: str, response: Any) -> None:
    if not request_id or not getattr(user, "key_id", None):
        return
    try:
        await sdb.insert("api_idempotency", {"key_id": user.key_id, "request_id": request_id, "route": route, "response": response})
    except Exception:  # noqa: BLE001 - a lost race means the first answer is already saved
        pass


_cache: dict[str, tuple[float, Any]] = {}


async def cached(key: str, ttl: float, make: Callable[[], Awaitable[Any]]) -> Any:
    """A few minutes' cache for heavy staff reports (same answer for every staff member)."""
    hit = _cache.get(key)
    now = time.monotonic()
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = await make()
    _cache[key] = (now, value)
    if len(_cache) > 200:
        for k, _ in sorted(_cache.items(), key=lambda kv: kv[1][0])[:50]:
            _cache.pop(k, None)
    return value


def clear_cache() -> None:
    _cache.clear()


def cached_for_keys(ttl: float = 120):
    """Decorator for heavy staff report routes: an API key (an AI app polling the report) gets a
    cached answer for `ttl` seconds; people in the admin panel always get fresh numbers.
    The staff argument must be named `_` (PlatformAdmin); the cache key is the route plus its
    query values."""
    import functools

    def wrap(fn):
        @functools.wraps(fn)
        async def inner(*args, **kwargs):
            staff = kwargs.get("_")
            if not getattr(getattr(staff, "user", None), "key_id", None):
                return await fn(*args, **kwargs)
            simple = sorted((k, v) for k, v in kwargs.items() if isinstance(v, (str, int, float, bool, type(None))))
            return await cached(f"{fn.__name__}:{simple}", ttl, lambda: fn(*args, **kwargs))

        return inner

    return wrap

"""A small PostgREST client for Supabase.

Two ways to call the database:
  * with the signed-in user's own token (Supabase row-level security then
    enforces tenant isolation as a second line of defence), or
  * with the service-role key, for trusted work and for tables no user may touch.
Routers always filter by account_id as well, so isolation never rests on one layer.
"""

from typing import Any, Protocol

import httpx

from .config import Settings

Row = dict[str, Any]


class DbError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class Db(Protocol):
    async def select(self, table: str, filters: dict[str, str] | None = None, *, order: str | None = None, limit: int | None = None) -> list[Row]: ...
    async def insert(self, table: str, row: Row) -> Row: ...
    async def update(self, table: str, filters: dict[str, str], patch: Row) -> list[Row]: ...
    async def delete(self, table: str, filters: dict[str, str]) -> list[Row]: ...
    async def upsert(self, table: str, row: Row, on_conflict: str) -> Row: ...
    async def rpc(self, name: str, params: Row) -> Any: ...


class SupabaseDb:
    def __init__(self, settings: Settings, bearer: str, apikey: str, client: httpx.AsyncClient | None = None):
        self._base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        self._headers = {"apikey": apikey, "Authorization": f"Bearer {bearer}", "Content-Type": "application/json"}
        self._client = client or httpx.AsyncClient(timeout=15)

    async def _send(self, method: str, table: str, *, params: dict[str, str] | None = None, json: Any = None, prefer: str | None = None) -> Any:
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        res = await self._client.request(method, f"{self._base}/{table}", params=params, json=json, headers=headers)
        if res.status_code >= 400:
            raise DbError(res.status_code, res.text[:300])
        return res.json() if res.content else []

    @staticmethod
    def _eq(filters: dict[str, str] | None) -> dict[str, str]:
        return {k: f"eq.{v}" for k, v in (filters or {}).items()}

    async def select(self, table, filters=None, *, order=None, limit=None):
        params = self._eq(filters)
        if order:
            params["order"] = order
        if limit:
            params["limit"] = str(limit)
        return await self._send("GET", table, params=params)

    async def insert(self, table, row):
        data = await self._send("POST", table, json=row, prefer="return=representation")
        return data[0]

    async def update(self, table, filters, patch):
        return await self._send("PATCH", table, params=self._eq(filters), json=patch, prefer="return=representation")

    async def delete(self, table, filters):
        return await self._send("DELETE", table, params=self._eq(filters), prefer="return=representation")

    async def upsert(self, table, row, on_conflict):
        data = await self._send("POST", table, params={"on_conflict": on_conflict}, json=row, prefer="resolution=merge-duplicates,return=representation")
        return data[0]


    async def rpc(self, name, params):
        return await self._send("POST", f"rpc/{name}", json=params)


def service_db(settings: Settings) -> SupabaseDb:
    return SupabaseDb(settings, settings.supabase_service_role_key, settings.supabase_service_role_key)


def user_db(settings: Settings, token: str) -> SupabaseDb:
    return SupabaseDb(settings, token, settings.supabase_anon_key)

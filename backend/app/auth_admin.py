"""Creating and finding sign-in users (Supabase Auth admin API, service role only)."""

from typing import Protocol

import httpx

from .config import Settings


class AuthAdminError(Exception):
    pass


class AuthAdmin(Protocol):
    async def invite(self, email: str, name: str) -> str:
        """Create the user if new (they get an email to set a password); return the user id."""
        ...


class SupabaseAuthAdmin:
    def __init__(self, settings: Settings):
        self._base = f"{settings.supabase_url.rstrip('/')}/auth/v1"
        self._headers = {"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}"}

    async def invite(self, email: str, name: str) -> str:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(f"{self._base}/invite", headers=self._headers, json={"email": email, "data": {"full_name": name}})
            if res.status_code == 422 or "already" in res.text.lower():
                found = await client.get(f"{self._base}/admin/users", headers=self._headers, params={"page": 1, "per_page": 200})
                for u in found.json().get("users", []) if found.status_code == 200 else []:
                    if (u.get("email") or "").lower() == email.lower():
                        return u["id"]
                raise AuthAdminError("That email already has a login that couldn't be found")
            if res.status_code >= 400:
                raise AuthAdminError(f"Could not invite {email} ({res.status_code})")
            return res.json()["id"]

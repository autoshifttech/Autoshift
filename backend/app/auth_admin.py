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

    async def get_user(self, user_id: str) -> dict | None:
        """Sign-in facts for one user: email, created, last sign-in, confirmed, banned_until. Never secrets."""
        ...

    async def update_user(self, user_id: str, attrs: dict) -> None:
        """Change sign-in settings: ban_duration ("none" to lift), email, user_metadata."""
        ...

    async def send_recovery(self, email: str) -> None:
        """Email the user a password-reset link (the link is never returned)."""
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

    async def get_user(self, user_id: str) -> dict | None:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(f"{self._base}/admin/users/{user_id}", headers=self._headers)
        if res.status_code == 404:
            return None
        if res.status_code >= 400:
            raise AuthAdminError(f"Could not load the login ({res.status_code})")
        u = res.json()
        return {k: u.get(k) for k in ("id", "email", "created_at", "last_sign_in_at", "email_confirmed_at", "banned_until")}

    async def update_user(self, user_id: str, attrs: dict) -> None:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.put(f"{self._base}/admin/users/{user_id}", headers=self._headers, json=attrs)
        if res.status_code >= 400:
            raise AuthAdminError(f"Could not change the login ({res.status_code})")

    async def send_recovery(self, email: str) -> None:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(f"{self._base}/recover", headers=self._headers, json={"email": email})
        if res.status_code >= 400:
            raise AuthAdminError(f"Could not send the reset email ({res.status_code})")

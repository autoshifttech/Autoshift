"""Thin async client for the Meta Graph API calls used by WhatsApp Embedded Signup.

Tokens are passed per call and never logged.
"""

from dataclasses import dataclass
from typing import Any

import httpx

PHONE_NUMBER_FIELDS = (
    "id,display_phone_number,verified_name,quality_rating,"
    "code_verification_status,name_status,status"
)


class MetaGraphError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: int | None = None,
        subcode: int | None = None,
        fbtrace_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.subcode = subcode
        self.fbtrace_id = fbtrace_id

    def as_dict(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "status_code": self.status_code,
            "code": self.code,
            "subcode": self.subcode,
            "fbtrace_id": self.fbtrace_id,
        }


@dataclass(frozen=True)
class TokenDebugInfo:
    app_id: str | None
    is_valid: bool
    scopes: list[str]
    granular_scopes: dict[str, list[str] | None]


class MetaGraphClient:
    def __init__(
        self, http: httpx.AsyncClient, *, graph_url: str, app_id: str, app_secret: str
    ) -> None:
        self._http = http
        self._graph_url = graph_url.rstrip("/")
        self._app_id = app_id
        self._app_secret = app_secret

    @property
    def _app_access_token(self) -> str:
        return f"{self._app_id}|{self._app_secret}"

    async def _request(
        self,
        method: str,
        path: str,
        *,
        token: str,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            response = await self._http.request(
                method,
                f"{self._graph_url}/{path.lstrip('/')}",
                params=params,
                json=json,
                headers={"Authorization": f"Bearer {token}"},
                timeout=20.0,
            )
        except httpx.HTTPError as exc:
            raise MetaGraphError(f"Could not reach Meta Graph API: {type(exc).__name__}") from exc
        return self._parse(response)

    @staticmethod
    def _parse(response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.is_success and "error" not in body:
            return body if isinstance(body, dict) else {"data": body}
        error = body.get("error", {}) if isinstance(body, dict) else {}
        raise MetaGraphError(
            error.get("error_user_msg") or error.get("message") or f"HTTP {response.status_code}",
            status_code=response.status_code,
            code=error.get("code"),
            subcode=error.get("error_subcode"),
            fbtrace_id=error.get("fbtrace_id"),
        )

    async def exchange_code(self, code: str) -> str:
        """Exchange the Embedded Signup authorization code for a business integration token."""
        try:
            response = await self._http.get(
                f"{self._graph_url}/oauth/access_token",
                params={
                    "client_id": self._app_id,
                    "client_secret": self._app_secret,
                    "code": code,
                },
                timeout=20.0,
            )
        except httpx.HTTPError as exc:
            raise MetaGraphError(f"Could not reach Meta Graph API: {type(exc).__name__}") from exc
        body = self._parse(response)
        token = body.get("access_token")
        if not isinstance(token, str) or not token:
            raise MetaGraphError("Meta did not return an access token for this code")
        return token

    async def debug_token(self, token: str) -> TokenDebugInfo:
        body = await self._request(
            "GET", "debug_token", token=self._app_access_token, params={"input_token": token}
        )
        data = body.get("data", {})
        granular: dict[str, list[str] | None] = {}
        for item in data.get("granular_scopes", []) or []:
            scope = item.get("scope")
            if scope:
                targets = item.get("target_ids")
                granular[scope] = [str(t) for t in targets] if targets is not None else None
        return TokenDebugInfo(
            app_id=str(data["app_id"]) if data.get("app_id") is not None else None,
            is_valid=bool(data.get("is_valid")),
            scopes=list(data.get("scopes", []) or []),
            granular_scopes=granular,
        )

    async def list_phone_numbers(self, waba_id: str, token: str) -> list[dict[str, Any]]:
        body = await self._request(
            "GET", f"{waba_id}/phone_numbers", token=token, params={"fields": PHONE_NUMBER_FIELDS}
        )
        return list(body.get("data", []))

    async def get_phone_number(self, phone_number_id: str, token: str) -> dict[str, Any]:
        return await self._request(
            "GET", phone_number_id, token=token, params={"fields": PHONE_NUMBER_FIELDS}
        )

    async def subscribe_app(self, waba_id: str, token: str) -> None:
        body = await self._request("POST", f"{waba_id}/subscribed_apps", token=token)
        if body.get("success") is False:
            raise MetaGraphError("Meta rejected the webhook subscription for this WABA")

    async def unsubscribe_app(self, waba_id: str, token: str) -> None:
        await self._request("DELETE", f"{waba_id}/subscribed_apps", token=token)

    async def register_phone_number(self, phone_number_id: str, token: str, pin: str) -> None:
        body = await self._request(
            "POST",
            f"{phone_number_id}/register",
            token=token,
            json={"messaging_product": "whatsapp", "pin": pin},
        )
        if body.get("success") is False:
            raise MetaGraphError("Meta rejected the phone number registration")

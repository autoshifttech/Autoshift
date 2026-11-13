"""Calls into the web app's internal bridge (/api/internal/mcp), which runs the same WhatsApp code
the dashboard uses: sending, broadcasts, template submit and sync, knowledge documents.

The backend checks the caller's key, role, opt-outs and blocklist before calling. The shared
INTERNAL_SECRET protects the bridge; without it (or a web address) these tools are switched off.
"""

from typing import Any, Protocol

import httpx

from .config import Settings


class BridgeError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


class WebBridge(Protocol):
    async def call(self, action: str, account_id: str, user_id: str, role: str, **fields: Any) -> dict: ...


class HttpWebBridge:
    def __init__(self, settings: Settings):
        self._url = (settings.web_internal_url or settings.site_url).rstrip("/") + "/api/internal/mcp"
        self._secret = settings.internal_secret

    async def call(self, action: str, account_id: str, user_id: str, role: str, **fields: Any) -> dict:
        if not self._secret:
            raise BridgeError(503, "WhatsApp actions are switched off: INTERNAL_SECRET is not set on the API")
        body = {"action": action, "account_id": account_id, "user_id": user_id, "role": role, **fields}
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                res = await client.post(self._url, json=body, headers={"X-AutoShift-Internal": self._secret})
        except httpx.HTTPError as exc:
            raise BridgeError(502, f"The web app could not be reached ({exc.__class__.__name__})") from exc
        try:
            data = res.json()
        except ValueError:
            data = {"error": res.text[:300]}
        if res.status_code >= 400:
            detail = data.get("error") if isinstance(data, dict) else None
            raise BridgeError(res.status_code, str(detail or res.text[:300]))
        return data if isinstance(data, dict) else {"result": data}

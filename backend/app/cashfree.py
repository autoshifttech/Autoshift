"""Cashfree Payments: payment links on a business's own Cashfree account, and webhook signatures.

Keys come from Cashfree → Developers → API Keys: an App ID (x-client-id) and a Secret Key
(x-client-secret). Test keys work against the sandbox. Cashfree signs webhooks with the same
Secret Key: base64(HMAC-SHA256(timestamp + raw body)).
"""

import base64
import hashlib
import hmac
from typing import Any

import httpx

API_VERSION = "2023-08-01"
LIVE = "https://api.cashfree.com/pg"
SANDBOX = "https://sandbox.cashfree.com/pg"


class CashfreeError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def base_url(mode: str | None) -> str:
    return LIVE if mode == "live" else SANDBOX


def mode_for(app_id: str, secret: str) -> str:
    """Test keys start with TEST (app id) or carry _test_ (secret); everything else is live."""
    if app_id.upper().startswith("TEST") or "_test_" in secret:
        return "test"
    return "live"


def _headers(app_id: str, secret: str) -> dict[str, str]:
    return {"x-client-id": app_id, "x-client-secret": secret, "x-api-version": API_VERSION, "Content-Type": "application/json"}


async def cf_post(app_id: str, secret: str, mode: str | None, path: str, body: dict[str, Any]) -> dict[str, Any]:
    """One call to Cashfree with the business's own keys. Replaced in tests."""
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(f"{base_url(mode)}{path}", json=body, headers=_headers(app_id, secret))
    if res.status_code >= 400:
        raise CashfreeError(res.status_code, res.text[:300])
    return res.json()


async def cf_get(app_id: str, secret: str, mode: str | None, path: str) -> dict[str, Any]:
    """Read from Cashfree with the business's own keys. Replaced in tests."""
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{base_url(mode)}{path}", headers=_headers(app_id, secret))
    if res.status_code >= 400:
        raise CashfreeError(res.status_code, res.text[:300])
    return res.json()


def verify_webhook_signature(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    if not secret or not signature or not timestamp:
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), timestamp.encode() + raw_body, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected.encode(), signature.encode())


def customer_phone(phone: str | None) -> str:
    """Cashfree wants a 10-digit Indian number; WhatsApp gives 91XXXXXXXXXX."""
    digits = "".join(ch for ch in phone or "" if ch.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits if len(digits) >= 10 else "9999999999"

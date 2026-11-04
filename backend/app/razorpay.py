"""Razorpay: the API calls we make and the signatures we check."""

import hashlib
import hmac
from typing import Any

import httpx

from .config import Settings

API = "https://api.razorpay.com/v1"


class RazorpayError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _hmac(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_payment_signature(order_id: str, payment_id: str, signature: str, key_secret: str) -> bool:
    """Checkout returns order_id, payment_id and a signature of 'order_id|payment_id'."""
    if not key_secret or not signature:
        return False
    return _eq(_hmac(key_secret, f"{order_id}|{payment_id}".encode()), signature)


def verify_subscription_signature(payment_id: str, subscription_id: str, signature: str, key_secret: str) -> bool:
    """For subscriptions the signed text is 'payment_id|subscription_id'."""
    if not key_secret or not signature:
        return False
    return _eq(_hmac(key_secret, f"{payment_id}|{subscription_id}".encode()), signature)


def verify_webhook_signature(raw_body: bytes, signature: str, webhook_secret: str) -> bool:
    """Webhooks are signed over the exact raw request body."""
    if not webhook_secret or not signature:
        return False
    return _eq(_hmac(webhook_secret, raw_body), signature)


class RazorpayClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._auth = (settings.razorpay_key_id, settings.razorpay_key_secret)
        self._client = client or httpx.AsyncClient(timeout=20)
        self.key_id = settings.razorpay_key_id

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        res = await self._client.post(f"{API}{path}", json=body, auth=self._auth)
        if res.status_code >= 400:
            raise RazorpayError(res.status_code, res.text[:300])
        return res.json()

    async def create_order(self, amount_paise: int, receipt: str, notes: dict[str, str]) -> dict[str, Any]:
        return await self._post("/orders", {"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes})

    async def create_plan(self, period: str, amount_paise: int, name: str) -> dict[str, Any]:
        return await self._post("/plans", {"period": period, "interval": 1, "item": {"name": name, "amount": amount_paise, "currency": "INR"}})

    async def create_subscription(self, plan_id: str, total_count: int, notes: dict[str, str], start_at: int | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"plan_id": plan_id, "total_count": total_count, "customer_notify": 1, "notes": notes}
        if start_at:
            body["start_at"] = start_at
        return await self._post("/subscriptions", body)

    async def cancel_subscription(self, subscription_id: str, at_cycle_end: bool) -> dict[str, Any]:
        return await self._post(f"/subscriptions/{subscription_id}/cancel", {"cancel_at_cycle_end": 1 if at_cycle_end else 0})

    async def refund(self, payment_id: str, amount_paise: int, notes: dict[str, str]) -> dict[str, Any]:
        return await self._post(f"/payments/{payment_id}/refund", {"amount": amount_paise, "notes": notes})

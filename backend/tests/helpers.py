import hashlib
import hmac
import json

from .conftest import RZP_SECRET, RZP_WEBHOOK_SECRET


def _sig(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def payment_signature(order_id: str, payment_id: str) -> str:
    return _sig(RZP_SECRET, f"{order_id}|{payment_id}".encode())


def subscription_signature(payment_id: str, subscription_id: str) -> str:
    return _sig(RZP_SECRET, f"{payment_id}|{subscription_id}".encode())


def webhook(client, event: str, payload: dict, *, event_id: str = "evt_1", secret: str = RZP_WEBHOOK_SECRET):
    body = json.dumps({"event": event, "payload": payload}).encode()
    return client.post("/v1/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": _sig(secret, body), "X-Razorpay-Event-Id": event_id, "Content-Type": "application/json"})


def order_paid(order_id: str, payment_id: str, amount: int) -> dict:
    return {"payment": {"entity": {"id": payment_id, "order_id": order_id, "amount": amount, "status": "captured"}}, "order": {"entity": {"id": order_id, "amount": amount}}}


def start_topup(client, world, amount_inr: int = 1000, who: str = "admin_a") -> dict:
    res = client.post("/v1/wallet/topups", json={"amount_inr": amount_inr}, headers=world.headers(who))
    assert res.status_code == 201, res.text
    return res.json()

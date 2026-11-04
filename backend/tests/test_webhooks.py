import json

from .helpers import order_paid, payment_signature, start_topup, webhook


def _balance(world):
    rows = world.rows("wallet_balances")
    return rows[0]["balance_paise"] if rows else 0


def test_bad_signature_is_rejected(client, world):
    assert webhook(client, "order.paid", {}, secret="wrong").status_code == 400
    assert client.post("/v1/webhooks/razorpay", content=b"{}").status_code == 400


def test_order_paid_credits_the_wallet_even_if_the_browser_never_returned(client, world):
    order = start_topup(client, world, 1000)
    res = webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000))
    assert res.status_code == 200 and res.json()["status"] == "processed"
    assert _balance(world) == 100000 and len(world.rows("invoices")) == 1
    assert world.rows("razorpay_events")[0]["status"] == "processed"


def test_a_repeated_delivery_is_ignored(client, world):
    order = start_topup(client, world, 1000)
    payload = order_paid(order["razorpay_order_id"], "pay_1", 118000)
    assert webhook(client, "order.paid", payload).json()["status"] == "processed"
    assert webhook(client, "order.paid", payload).json()["status"] == "duplicate"
    assert _balance(world) == 100000


def test_same_payment_under_a_new_event_id_still_credits_once(client, world):
    order = start_topup(client, world, 1000)
    payload = order_paid(order["razorpay_order_id"], "pay_1", 118000)
    webhook(client, "order.paid", payload, event_id="evt_a")
    webhook(client, "order.paid", payload, event_id="evt_b")
    assert _balance(world) == 100000 and len(world.rows("wallet_ledger")) == 1


def test_browser_verify_and_webhook_together_credit_once(client, world):
    order = start_topup(client, world, 1000)
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": payment_signature(order["razorpay_order_id"], "pay_1")}
    client.post("/v1/wallet/topups/verify", json=pay, headers=world.headers("admin_a"))
    webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000))
    assert _balance(world) == 100000 and len(world.rows("invoices")) == 1


def test_a_wrong_amount_is_not_credited_and_is_retried_later(client, world):
    order = start_topup(client, world, 1000)
    res = webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 5000), event_id="evt_x")
    assert res.status_code == 500 and _balance(world) == 0
    assert world.rows("razorpay_events")[0]["status"] == "failed"
    assert any(a["action"] == "payment.amount_mismatch" for a in world.rows("audit_log"))
    # Razorpay retries the same event; once it is right it goes through.
    ok = webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000), event_id="evt_x")
    assert ok.json()["status"] == "processed" and _balance(world) == 100000


def test_unknown_orders_and_events_are_ignored(client, world):
    assert webhook(client, "order.paid", order_paid("order_other", "pay_z", 100), event_id="e1").json()["status"] == "ignored"
    assert webhook(client, "payment.authorized", {}, event_id="e2").json()["status"] == "ignored"
    assert _balance(world) == 0


def _make_subscription(world, status="trialing"):
    world.rows("subscriptions").append({"account_id": world.acct_a, "plan_id": "growth", "cycle": "monthly", "status": status, "trial_ends_at": "2026-12-01T00:00:00+00:00", "cancel_at_period_end": False, "razorpay_subscription_id": "sub_1", "current_period_end": None})


def _sub_payload(payment_id: str | None = None, amount: int = 294882):
    out = {"subscription": {"entity": {"id": "sub_1", "current_end": 1798761600}}}
    if payment_id:
        out["payment"] = {"entity": {"id": payment_id, "amount": amount}}
    return out


def test_subscription_charge_activates_and_invoices_once(client, world):
    _make_subscription(world)
    assert webhook(client, "subscription.charged", _sub_payload("pay_s1"), event_id="s1").json()["status"] == "processed"
    sub = world.rows("subscriptions")[0]
    assert sub["status"] == "active" and sub["current_period_end"].startswith("2027-01-01")
    inv = world.rows("invoices")
    assert len(inv) == 1 and inv[0]["total_paise"] == 294882 and inv[0]["base_paise"] + inv[0]["gst_paise"] == 294882
    webhook(client, "subscription.charged", _sub_payload("pay_s1"), event_id="s2")
    assert len(world.rows("invoices")) == 1


def test_subscription_status_follows_razorpay(client, world):
    _make_subscription(world, "active")
    webhook(client, "subscription.halted", _sub_payload(), event_id="h")
    assert world.rows("subscriptions")[0]["status"] == "past_due"
    webhook(client, "subscription.cancelled", _sub_payload(), event_id="c")
    assert world.rows("subscriptions")[0]["status"] == "cancelled"
    webhook(client, "subscription.completed", _sub_payload(), event_id="d")
    assert world.rows("subscriptions")[0]["status"] == "expired"


def test_refund_takes_back_the_credits_it_covers(client, world):
    order = start_topup(client, world, 1000)
    webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000), event_id="p")
    refund = {"refund": {"entity": {"id": "rfnd_1", "payment_id": "pay_1", "amount": 59000}}}  # half
    assert webhook(client, "refund.processed", refund, event_id="r").json()["status"] == "processed"
    assert _balance(world) == 50000


def test_refund_after_credits_were_spent_takes_only_what_is_left(client, world):
    order = start_topup(client, world, 1000)
    webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000), event_id="p")
    world.rows("wallet_balances")[0]["balance_paise"] = 20000
    refund = {"refund": {"entity": {"id": "rfnd_1", "payment_id": "pay_1", "amount": 118000}}}
    webhook(client, "refund.processed", refund, event_id="r")
    assert _balance(world) == 0
    short = next(a for a in world.rows("audit_log") if a["action"] == "refund.shortfall")
    assert short["details"]["shortfall_paise"] == 80000

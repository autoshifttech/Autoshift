from .helpers import order_paid, start_topup, webhook


def test_only_finance_and_super_admins_adjust_wallets(client, world):
    body = {"amount_paise": 5000, "reason": "Goodwill credit", "idempotency_key": "adj-0001"}
    for who in ("staff_support", "owner_a"):
        assert client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json=body, headers=world.headers(who)).status_code == 403
    assert client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json=body, headers=world.headers("staff_finance")).json() == {"applied": True, "balance_paise": 5000}


def test_a_double_click_adjusts_once(client, world):
    h = world.headers("staff_super")
    body = {"amount_paise": 5000, "reason": "Goodwill credit", "idempotency_key": "adj-0002"}
    client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json=body, headers=h)
    again = client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json=body, headers=h).json()
    assert again == {"applied": False, "balance_paise": 5000}
    assert len(world.rows("wallet_ledger")) == 1


def test_removing_more_than_the_wallet_holds_is_refused(client, world):
    h = world.headers("staff_super")
    res = client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json={"amount_paise": -100, "reason": "Correction", "idempotency_key": "adj-0003"}, headers=h)
    assert res.status_code == 409 and world.rows("wallet_ledger") == []
    assert client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json={"amount_paise": 0, "reason": "Nothing", "idempotency_key": "adj-0004"}, headers=h).status_code == 422


def test_adjustments_are_audited_with_the_reason(client, world):
    client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json={"amount_paise": 2500, "reason": "Promo credit", "idempotency_key": "adj-0005"}, headers=world.headers("staff_finance"))
    entry = world.rows("audit_log")[0]
    assert entry["scope"] == "platform" and entry["details"]["reason"] == "Promo credit" and entry["account_id"] == world.acct_a


def test_staff_can_look_at_any_wallet(client, world):
    client.post(f"/v1/platform/wallets/{world.acct_a}/adjust", json={"amount_paise": 2500, "reason": "Promo credit", "idempotency_key": "adj-0006"}, headers=world.headers("staff_finance"))
    seen = client.get(f"/v1/platform/wallets/{world.acct_a}", headers=world.headers("staff_support")).json()
    assert seen["balance_paise"] == 2500 and len(seen["ledger"]) == 1
    assert client.get(f"/v1/platform/wallets/{world.acct_a}", headers=world.headers("admin_a")).status_code == 403


def test_refund_goes_through_razorpay_and_credits_are_taken_back_on_confirmation(client, world, rzp):
    order = start_topup(client, world, 1000)
    webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000), event_id="p")
    h = world.headers("staff_finance")
    out = client.post("/v1/platform/payments/pay_1/refund", json={"reason": "Customer asked"}, headers=h).json()
    assert out["amount_paise"] == 118000 and rzp.refunds[0]["payment_id"] == "pay_1"
    assert world.rows("wallet_balances")[0]["balance_paise"] == 100000  # not yet: wait for Razorpay
    refund = {"refund": {"entity": {"id": out["refund_id"], "payment_id": "pay_1", "amount": 118000}}}
    webhook(client, "refund.processed", refund, event_id="r")
    assert world.rows("wallet_balances")[0]["balance_paise"] == 0


def test_refund_checks_the_payment_and_the_amount(client, world):
    h = world.headers("staff_finance")
    assert client.post("/v1/platform/payments/pay_nope/refund", json={"reason": "Customer asked"}, headers=h).status_code == 404
    order = start_topup(client, world, 1000)
    webhook(client, "order.paid", order_paid(order["razorpay_order_id"], "pay_1", 118000), event_id="p")
    assert client.post("/v1/platform/payments/pay_1/refund", json={"amount_paise": 999999, "reason": "Too much"}, headers=h).status_code == 422
    assert client.post("/v1/platform/payments/pay_1/refund", json={"reason": "Customer asked"}, headers=world.headers("staff_support")).status_code == 403

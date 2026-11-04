from app import wallet
from .helpers import payment_signature, start_topup


def test_new_wallet_is_empty_and_shows_the_rate_card(client, world):
    body = client.get("/v1/wallet", headers=world.headers("viewer_a")).json()
    assert body["balance_paise"] == 0 and body["rates_paise"]["charge_marketing"] == 99


def test_topup_amount_and_gst_are_decided_by_the_server(client, world, rzp):
    order = start_topup(client, world, 1000)
    assert order["base_paise"] == 100000 and order["gst_paise"] == 18000 and order["amount_paise"] == 118000
    assert rzp.orders[0]["amount"] == 118000
    saved = world.rows("payment_orders")[0]
    assert saved["account_id"] == world.acct_a and saved["status"] == "created" and saved["total_paise"] == 118000


def test_topup_limits_and_roles(client, world):
    h = world.headers("admin_a")
    assert client.post("/v1/wallet/topups", json={"amount_inr": 499}, headers=h).status_code == 422
    assert client.post("/v1/wallet/topups", json={"amount_inr": 100001}, headers=h).status_code == 422
    assert client.post("/v1/wallet/topups", json={"amount_inr": -5}, headers=h).status_code == 422
    for who in ("agent_a", "viewer_a"):
        assert client.post("/v1/wallet/topups", json={"amount_inr": 1000}, headers=world.headers(who)).status_code == 403


def test_razorpay_down_creates_no_order_row(client, world, rzp):
    rzp.fail = True
    assert client.post("/v1/wallet/topups", json={"amount_inr": 1000}, headers=world.headers("admin_a")).status_code == 502
    assert world.rows("payment_orders") == []


def test_verified_payment_credits_the_base_amount_and_issues_a_gst_invoice(client, world):
    order = start_topup(client, world, 1000)
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": payment_signature(order["razorpay_order_id"], "pay_1")}
    res = client.post("/v1/wallet/topups/verify", json=pay, headers=world.headers("admin_a"))
    assert res.status_code == 200 and res.json()["balance_paise"] == 100000  # credits, not the GST
    inv = world.rows("invoices")[0]
    assert (inv["base_paise"], inv["gst_paise"], inv["total_paise"]) == (100000, 18000, 118000)
    assert world.rows("payment_orders")[0]["status"] == "paid"
    assert [a["action"] for a in world.rows("audit_log")] == ["wallet.topup"]


def test_repeating_the_verify_call_never_credits_twice(client, world):
    order = start_topup(client, world, 1000)
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": payment_signature(order["razorpay_order_id"], "pay_1")}
    for _ in range(3):
        assert client.post("/v1/wallet/topups/verify", json=pay, headers=world.headers("admin_a")).json()["balance_paise"] == 100000
    assert len(world.rows("wallet_ledger")) == 1 and len(world.rows("invoices")) == 1


def test_a_forged_signature_credits_nothing(client, world):
    order = start_topup(client, world, 1000)
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": "0" * 64}
    assert client.post("/v1/wallet/topups/verify", json=pay, headers=world.headers("admin_a")).status_code == 400
    assert world.rows("wallet_ledger") == []


def test_one_business_cannot_claim_anothers_order(client, world):
    order = start_topup(client, world, 1000, who="admin_a")
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_9", "razorpay_signature": payment_signature(order["razorpay_order_id"], "pay_9")}
    assert client.post("/v1/wallet/topups/verify", json=pay, headers=world.headers("admin_b")).status_code == 404
    assert world.rows("wallet_ledger") == []


def test_ledger_and_invoices_are_for_admins_and_only_their_own(client, world):
    order = start_topup(client, world, 1000)
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": payment_signature(order["razorpay_order_id"], "pay_1")}
    client.post("/v1/wallet/topups/verify", json=pay, headers=world.headers("admin_a"))
    assert len(client.get("/v1/wallet/ledger", headers=world.headers("owner_a")).json()) == 1
    assert client.get("/v1/wallet/ledger", headers=world.headers("agent_a")).status_code == 403
    assert client.get("/v1/wallet/ledger", headers=world.headers("admin_b")).json() == []
    assert client.get("/v1/wallet/invoices", headers=world.headers("admin_b")).json() == []
    assert len(client.get("/v1/wallet/invoices", headers=world.headers("admin_a")).json()) == 1


async def test_charges_use_the_rate_card_and_stop_at_zero(world):
    sdb = world.service
    await wallet.apply(sdb, world.acct_a, 500, "topup", "seed", "seed-1")
    assert (await wallet.charge(sdb, world.acct_a, "charge_marketing", 5, "m1", "msg-1")).balance_paise == 5  # 500 - 5*99
    assert await wallet.charge(sdb, world.acct_a, "charge_service", 10, "m2", "msg-2") is None  # free
    try:
        await wallet.charge(sdb, world.acct_a, "charge_marketing", 1, "m3", "msg-3")
        raise AssertionError("went below zero")
    except wallet.InsufficientFunds:
        pass
    assert await wallet.balance(sdb, world.acct_a) == 5


async def test_a_retried_charge_is_not_charged_twice(world):
    sdb = world.service
    await wallet.apply(sdb, world.acct_a, 1000, "topup", "seed", "seed-1")
    first = await wallet.charge(sdb, world.acct_a, "charge_ai", 2, "reply-7", "ai:reply-7")
    again = await wallet.charge(sdb, world.acct_a, "charge_ai", 2, "reply-7", "ai:reply-7")
    assert first.applied and not again.applied and again.balance_paise == 950

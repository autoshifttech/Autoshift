from datetime import datetime, timedelta, timezone

from .helpers import subscription_signature


def test_plans_list_shows_monthly_and_yearly_prices(client, world):
    plans = client.get("/v1/plans", headers=world.headers("viewer_a")).json()
    assert [p["id"] for p in plans] == ["starter", "growth", "pro"]
    assert plans[0]["monthly_paise"] == 99900 and plans[0]["yearly_paise"] == 999000  # 10 months


def test_a_new_workspace_starts_a_14_day_trial(client, world):
    sub = client.get("/v1/subscription", headers=world.headers("agent_a")).json()
    assert sub["status"] == "trialing"
    ends = datetime.fromisoformat(sub["trial_ends_at"])
    assert timedelta(days=13) < ends - datetime.now(timezone.utc) <= timedelta(days=14)
    assert len(world.rows("subscriptions")) == 1
    client.get("/v1/subscription", headers=world.headers("agent_a"))
    assert len(world.rows("subscriptions")) == 1


def test_checkout_creates_the_razorpay_plan_once_and_delays_the_charge_to_trial_end(client, world, rzp):
    h = world.headers("admin_a")
    out = client.post("/v1/subscription/checkout", json={"plan_id": "pro", "cycle": "yearly"}, headers=h).json()
    assert out["amount_paise"] == 5999000 and out["starts_after_trial"] is True and out["key_id"].startswith("rzp_test_")
    assert rzp.plans[0]["amount"] == 5999000 and rzp.plans[0]["period"] == "yearly"
    assert rzp.subscriptions[0]["start_at"] is not None and rzp.subscriptions[0]["total_count"] == 10
    # A second checkout for the same plan reuses the Razorpay plan.
    client.post("/v1/subscription/checkout", json={"plan_id": "pro", "cycle": "yearly"}, headers=h)
    assert len(rzp.plans) == 1
    assert world.rows("subscriptions")[0]["plan_id"] == "pro"


def test_checkout_roles_and_unknown_plans(client, world):
    assert client.post("/v1/subscription/checkout", json={"plan_id": "growth"}, headers=world.headers("agent_a")).status_code == 403
    assert client.post("/v1/subscription/checkout", json={"plan_id": "platinum"}, headers=world.headers("admin_a")).status_code == 422


def test_verify_checks_the_signature_and_the_subscription(client, world):
    h = world.headers("admin_a")
    sub = client.post("/v1/subscription/checkout", json={"plan_id": "growth"}, headers=h).json()["razorpay_subscription_id"]
    bad = {"razorpay_payment_id": "pay_1", "razorpay_subscription_id": sub, "razorpay_signature": "0" * 64}
    assert client.post("/v1/subscription/verify", json=bad, headers=h).status_code == 400
    good = {**bad, "razorpay_signature": subscription_signature("pay_1", sub)}
    assert client.post("/v1/subscription/verify", json=good, headers=h).status_code == 200
    other = {"razorpay_payment_id": "pay_1", "razorpay_subscription_id": "sub_other", "razorpay_signature": subscription_signature("pay_1", "sub_other")}
    assert client.post("/v1/subscription/verify", json=other, headers=h).status_code == 404


def test_an_active_subscription_must_be_cancelled_before_a_new_checkout(client, world):
    h = world.headers("admin_a")
    client.post("/v1/subscription/checkout", json={"plan_id": "growth"}, headers=h)
    world.rows("subscriptions")[0]["status"] = "active"
    assert client.post("/v1/subscription/checkout", json={"plan_id": "pro"}, headers=h).status_code == 409


def test_cancel_runs_to_the_end_of_the_paid_period(client, world, rzp):
    h = world.headers("admin_a")
    assert client.post("/v1/subscription/cancel", headers=h).status_code == 409  # nothing to cancel yet
    sub = client.post("/v1/subscription/checkout", json={"plan_id": "growth"}, headers=h).json()["razorpay_subscription_id"]
    out = client.post("/v1/subscription/cancel", headers=h).json()
    assert out["cancel_at_period_end"] is True and rzp.cancelled == [(sub, True)]
    assert any(a["action"] == "subscription.cancel" for a in world.rows("audit_log"))


def test_businesses_have_separate_subscriptions(client, world):
    client.post("/v1/subscription/checkout", json={"plan_id": "pro"}, headers=world.headers("admin_a"))
    assert client.get("/v1/subscription", headers=world.headers("admin_b")).json()["plan_id"] == "growth"

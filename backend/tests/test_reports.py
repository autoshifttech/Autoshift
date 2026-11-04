from datetime import datetime, timezone

from app import wallet

NOW = datetime.now(timezone.utc).isoformat()


def H(world, who="staff_finance"):
    return world.headers(who)


async def test_usage_sums_charges_by_kind_and_business(client, world):
    await wallet.apply(world.service, world.acct_a, 10000, "topup", "t", "u1")
    await wallet.charge(world.service, world.acct_a, "charge_marketing", 3, "m", "u-m")
    await wallet.charge(world.service, world.acct_a, "charge_ai", 2, "a", "u-a")
    for e in world.rows("wallet_ledger"):
        e["created_at"] = NOW
    out = client.get("/v1/platform/usage", headers=H(world)).json()
    assert out["by_kind"]["charge_marketing"] == {"count": 1, "paise": 297}
    assert out["total_paise"] == 297 + 50 and "topup" not in out["by_kind"]
    assert out["top_businesses"][0]["business"] == "Business A"


def test_payments_list_filter_and_names(client, world):
    world.rows("payment_orders").extend([
        {"id": "1", "account_id": world.acct_a, "status": "paid", "base_paise": 1000, "created_at": "2026-01-02", "paid_at": NOW},
        {"id": "2", "account_id": world.acct_b, "status": "failed", "base_paise": 500, "created_at": "2026-01-03"},
    ])
    paid = client.get("/v1/platform/payments?status=paid", headers=H(world)).json()
    assert [p["id"] for p in paid] == ["1"] and paid[0]["business"] == "Business A"
    assert client.get("/v1/platform/payments?status=bogus", headers=H(world)).status_code == 422


async def test_overview_numbers(client, world):
    await wallet.apply(world.service, world.acct_a, 700, "topup", "t", "o1")
    world.rows("subscriptions").append({"account_id": world.acct_a, "plan_id": "growth", "cycle": "monthly", "status": "active"})
    world.rows("payment_orders").append({"id": "1", "account_id": world.acct_a, "status": "paid", "base_paise": 700, "paid_at": NOW})
    out = client.get("/v1/platform/overview", headers=H(world)).json()
    assert out["businesses"] == 2 and out["mrr_paise"] == 249900 and out["wallet_float_paise"] == 700
    assert out["topups_30d_paise"] == 700 and out["active_subscriptions"] == 1


def test_reports_are_staff_only(client, world):
    for path in ("payments", "invoices", "usage", "overview"):
        assert client.get(f"/v1/platform/{path}", headers=world.headers("owner_a")).status_code == 403

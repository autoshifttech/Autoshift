from app import wallet
from app.gst import check_char, gstin_problem, split_tax
from app.security import encrypt

from .helpers import order_paid, payment_signature, start_topup, webhook


def gstin(state="29", body="ABCDE1234F1Z"):
    first14 = f"{state}{body}"
    return first14 + check_char(first14)


def H(world, who="admin_a"):
    return world.headers(who)


def details(**kw):
    return {"legal_name": "Olive & Thread LLP", "has_gstin": False, "state_code": "27", "email": "bill@olive.in", **kw}


def test_gstin_rules():
    assert gstin_problem(gstin()) is None
    assert gstin_problem("nonsense") == "format"
    assert gstin_problem(gstin(state="99")) == "state"
    bad = gstin()[:-1] + ("A" if gstin()[-1] != "A" else "B")
    assert gstin_problem(bad) == "checksum"


def test_tax_split_by_place_of_supply():
    assert split_tax(10000, 1800, "29", "29") == {"cgst_paise": 900, "sgst_paise": 900, "igst_paise": 0}
    assert split_tax(10000, 1800, "27", "29") == {"cgst_paise": 0, "sgst_paise": 0, "igst_paise": 1800}
    assert split_tax(10000, 1801, "29", "29") == {"cgst_paise": 900, "sgst_paise": 901, "igst_paise": 0}  # never loses a paisa


def test_save_and_read_billing_details(client, world):
    assert client.get("/v1/billing-details", headers=H(world)).json()["legal_name"] == ""
    res = client.put("/v1/billing-details", json=details(), headers=H(world))
    assert res.status_code == 200, res.text
    assert client.get("/v1/billing-details", headers=H(world)).json()["state_code"] == "27"
    client.put("/v1/billing-details", json=details(legal_name="Renamed"), headers=H(world))
    assert len(world.rows("billing_details")) == 1 and world.rows("billing_details")[0]["legal_name"] == "Renamed"


def test_a_gstin_needs_the_full_address_and_a_matching_state(client, world):
    res = client.put("/v1/billing-details", json=details(has_gstin=True, gstin=gstin("29"), state_code="27"), headers=H(world))
    errors = res.json()["detail"]["errors"]
    assert res.status_code == 422 and errors["state_code"] == "mismatch" and {"address", "city", "pincode"} <= set(errors)
    ok = client.put("/v1/billing-details", json=details(has_gstin=True, gstin=gstin("29").lower(), state_code="29", address="12 MG Road", city="Bengaluru", pincode="560001"), headers=H(world))
    assert ok.status_code == 200 and ok.json()["gstin"] == gstin("29")  # stored in capitals


def test_only_admins_see_or_change_billing_details_and_workspaces_are_separate(client, world):
    assert client.get("/v1/billing-details", headers=H(world, "agent_a")).status_code == 403
    assert client.put("/v1/billing-details", json=details(), headers=H(world, "viewer_a")).status_code == 403
    client.put("/v1/billing-details", json=details(), headers=H(world))
    assert client.get("/v1/billing-details", headers=H(world, "admin_b")).json()["legal_name"] == ""


def test_invoice_keeps_a_snapshot_of_the_buyer_and_splits_tax(client, world):
    client.put("/v1/billing-details", json=details(state_code="27"), headers=H(world))
    order = start_topup(client, world, 1000)
    pay = {"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": payment_signature(order["razorpay_order_id"], "pay_1")}
    client.post("/v1/wallet/topups/verify", json=pay, headers=H(world))
    client.put("/v1/billing-details", json=details(legal_name="Changed later", state_code="29"), headers=H(world))
    inv = client.get("/v1/invoices", headers=H(world)).json()[0]
    assert inv["buyer"]["legal_name"] == "Olive & Thread LLP"  # not rewritten by the later change
    assert inv["igst_paise"] == 18000 and inv["cgst_paise"] == 0  # Maharashtra buyer, Karnataka seller


def test_usage_counts_against_the_plan(client, world):
    world.rows("contacts").extend([{"id": str(i), "account_id": world.acct_a} for i in range(3)] + [{"id": "x", "account_id": world.acct_b}])
    world.rows("subscriptions").append({"account_id": world.acct_a, "plan_id": "starter"})
    out = client.get("/v1/usage", headers=H(world, "agent_a")).json()
    assert out["plan_id"] == "starter"
    assert out["seats"] == {"used": 4, "limit": 2} and out["contacts"] == {"used": 3, "limit": 1000}
    assert out["ai_replies"] == {"used": 0, "limit": 1000}


async def test_ai_replies_stop_at_the_plan_limit_without_charging(client, world, settings, llm):
    p = next(p for p in world.rows("platform_ai_providers") if p["vendor"] == "openai")
    p.update(enabled=True, key_ciphertext=encrypt("sk-x-1234", settings), key_tail="1234")
    await wallet.apply(world.service, world.acct_a, 5000, "topup", "t", "fund")
    world.rows("subscriptions").append({"account_id": world.acct_a, "plan_id": "starter"})
    world.rows("plans")[0]["ai_replies"] = 2  # starter allows two this month
    aid = client.post("/v1/assistants", json={"name": "Sam", "provider": "openai", "model_id": "gpt-5.5"}, headers=H(world)).json()["id"]
    outs = [client.post(f"/v1/assistants/{aid}/test-reply", json={"message": "hi", "idempotency_key": f"limit-key-{i}"}, headers=H(world)).json() for i in range(3)]
    assert [o["status"] for o in outs] == ["reply", "reply", "plan_limit"]
    assert len(llm.calls) == 2 and world.rows("wallet_balances")[0]["balance_paise"] == 5000 - 50

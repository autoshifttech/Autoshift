"""The details GST invoices are made out to, and invoices with their tax split."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import audit, usage as usage_mod
from ..config import Settings, get_settings
from ..deps import AdminMember, Member, ServiceDb, UserDb
from ..gst import STATE_CODES, gstin_problem, split_tax
from ..schemas import BillingDetails

router = APIRouter(prefix="/v1", tags=["billing"])
EMPTY = BillingDetails().model_dump()


def validate(d: BillingDetails) -> dict[str, str]:
    """Same rules as the form: what's missing or wrong, by field."""
    e: dict[str, str] = {}
    if not d.legal_name.strip():
        e["legal_name"] = "required"
    if d.state_code not in STATE_CODES:
        e["state_code"] = "required"
    if d.email and not re.match(r"^\S+@\S+\.\S+$", d.email.strip()):
        e["email"] = "invalid"
    if d.has_gstin:
        problem = gstin_problem(d.gstin)
        if problem:
            e["gstin"] = problem
        elif d.state_code and d.gstin.strip()[:2] != d.state_code:
            e["state_code"] = "mismatch"
        if not d.address.strip():
            e["address"] = "required"
        if not d.city.strip():
            e["city"] = "required"
        if not re.match(r"^[1-9][0-9]{5}$", d.pincode.strip()):
            e["pincode"] = "invalid"
    return e


@router.get("/billing-details")
async def get_details(ctx: AdminMember, sdb: ServiceDb):
    rows = await sdb.select("billing_details", {"account_id": ctx.account_id}, limit=1)
    return {k: (rows[0][k] if rows else v) for k, v in EMPTY.items()}


@router.put("/billing-details")
async def put_details(body: BillingDetails, ctx: AdminMember, sdb: ServiceDb):
    errors = validate(body)
    if errors:
        raise HTTPException(422, {"errors": errors})
    row = {**body.model_dump(), "gstin": body.gstin.strip().upper() if body.has_gstin else "", "legal_name": body.legal_name.strip()}
    if await sdb.select("billing_details", {"account_id": ctx.account_id}, limit=1):
        await sdb.update("billing_details", {"account_id": ctx.account_id}, row)
    else:
        await sdb.insert("billing_details", {"account_id": ctx.account_id, **row})
    await audit.record(sdb, scope="account", action="billing_details.update", actor_id=ctx.user.id, account_id=ctx.account_id, details={"has_gstin": body.has_gstin, "state_code": body.state_code})
    return row


@router.get("/invoices")
async def invoices(ctx: AdminMember, db: UserDb, settings: Annotated[Settings, Depends(get_settings)], limit: int = Query(50, ge=1, le=200)):
    """Newest first, each with the tax split worked out from the buyer's state at the time of issue."""
    rows = await db.select("invoices", {"account_id": ctx.account_id}, order="issued_at.desc", limit=limit)
    return [{**r, **split_tax(r["base_paise"], r["gst_paise"], (r.get("buyer") or {}).get("state_code", ""), settings.seller_state_code)} for r in rows]


@router.get("/usage")
async def usage(ctx: Member, sdb: ServiceDb):
    return await usage_mod.usage(sdb, ctx.account_id)

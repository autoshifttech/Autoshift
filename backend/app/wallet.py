"""The wallet service: the one place money moves, and what each message costs."""

from dataclasses import dataclass

from .db import Db, DbError

# What a business is charged, in paise (mirrors the rate card in the app).
RATES_PAISE = {
    "charge_marketing": 99,
    "charge_utility": 15,
    "charge_authentication": 15,
    "charge_service": 0,
    "charge_ai": 25,
}


class InsufficientFunds(Exception):
    pass


@dataclass(frozen=True)
class Applied:
    applied: bool
    balance_paise: int


async def apply(
    sdb: Db,
    account_id: str,
    amount_paise: int,
    kind: str,
    ref: str,
    idem_key: str,
    created_by: str | None = None,
) -> Applied:
    """Credit (+) or debit (-) a wallet. Safe to retry: the same idem_key does nothing twice."""
    try:
        out = await sdb.rpc(
            "wallet_apply",
            {"p_account": account_id, "p_amount": amount_paise, "p_kind": kind, "p_ref": ref, "p_idem_key": idem_key, "p_created_by": created_by},
        )
    except DbError as exc:
        if "insufficient_funds" in str(exc):
            raise InsufficientFunds from exc
        raise
    return Applied(applied=bool(out["applied"]), balance_paise=int(out["balance_paise"]))


async def rates(sdb: Db) -> dict[str, int]:
    """The rate card: the defaults above, with any platform override (platform_settings key rates_paise)."""
    rows = await sdb.select("platform_settings", {"key": "rates_paise"}, limit=1)
    override = rows[0]["value"] if rows and isinstance(rows[0].get("value"), dict) else {}
    return {k: int(override.get(k, v)) for k, v in RATES_PAISE.items()}


async def charge(sdb: Db, account_id: str, kind: str, units: int, ref: str, idem_key: str) -> Applied | None:
    """Charge for messages or AI replies at the rate card. Free kinds are skipped."""
    amount = (await rates(sdb))[kind] * units
    if amount == 0:
        return None
    return await apply(sdb, account_id, -amount, kind, ref, idem_key)


async def balance(sdb: Db, account_id: str) -> int:
    rows = await sdb.select("wallet_balances", {"account_id": account_id}, limit=1)
    return int(rows[0]["balance_paise"]) if rows else 0

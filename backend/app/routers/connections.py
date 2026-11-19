import json
import logging
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from .. import audit, cashfree, google_api
from ..config import Settings, get_settings
from ..deps import AdminMember, Member, ServiceDb, UserDb
from ..schemas import ConnectionCreate
from ..security import encrypt, mask

router = APIRouter(prefix="/v1/connections", tags=["connections"])


@router.get("")
async def list_connections(ctx: Member, db: UserDb):
    """Safe details only. Secrets are never returned."""
    return await db.select("flow_connections", {"account_id": ctx.account_id}, order="created_at.desc")


@router.post("", status_code=201)
async def create_connection(
    body: ConnectionCreate,
    ctx: AdminMember,
    db: UserDb,
    sdb: ServiceDb,
    settings: Annotated[Settings, Depends(get_settings)],
):
    if body.kind == "google":
        if not body.google:
            raise HTTPException(422, "Paste the service account key")
        detail = json.loads(body.google.service_account_json)["client_email"]
        mode = None
        secret = body.google.service_account_json
        default_name = detail
    elif body.kind == "cashfree":
        if not body.cashfree:
            raise HTTPException(422, "Enter the Cashfree keys")
        cf = body.cashfree
        mode = cf.mode or cashfree.mode_for(cf.app_id, cf.secret_key)
        detail = mask(cf.app_id)
        secret = json.dumps({"app_id": cf.app_id.strip(), "secret_key": cf.secret_key.strip()})
        default_name = f"Cashfree — {mode}"
    else:
        if not body.razorpay:
            raise HTTPException(422, "Enter the Razorpay keys")
        rz = body.razorpay
        detail = mask(rz.key_id)
        mode = "live" if "_live_" in rz.key_id else "test"
        secret = json.dumps(rz.model_dump())
        default_name = f"Razorpay — {mode}"

    return await _save(db, sdb, settings, account_id=ctx.account_id, user_id=ctx.user.id, kind=body.kind,
                       name=body.name.strip() or default_name, detail=detail, mode=mode, secret=secret)


async def _save(db, sdb, settings: Settings, *, account_id: str, user_id: str, kind: str, name: str, detail: str, mode: str | None, secret: str) -> dict:
    """The connection row (safe details) and its encrypted secret, both or neither."""
    row = await db.insert(
        "flow_connections",
        {"account_id": account_id, "kind": kind, "name": name[:80], "detail": detail, "mode": mode, "created_by": user_id},
    )
    try:
        await sdb.insert("flow_connection_secrets", {"connection_id": row["id"], "ciphertext": encrypt(secret, settings)})
    except Exception:
        # Never leave a connection that has no secret behind.
        await db.delete("flow_connections", {"id": row["id"], "account_id": account_id})
        raise
    await audit.record(sdb, scope="account", action="connection.create", actor_id=user_id, account_id=account_id, target=row["id"], details={"kind": kind})
    return row


# ------------------------------------------------------------ Connect Google (sign in)

log = logging.getLogger("autoshift.connections")


@router.get("/google/available")
async def google_available(_: Member, settings: Annotated[Settings, Depends(get_settings)]):
    """Whether "Connect Google" can sign in here (the platform set up a Google OAuth client)."""
    return {"oauth": google_api.oauth_ready(settings)}


@router.post("/google/start")
async def google_start(ctx: AdminMember, settings: Annotated[Settings, Depends(get_settings)], name: str = ""):
    """The Google sign-in page to send the browser to. Comes back to /google/callback."""
    if not google_api.oauth_ready(settings):
        raise HTTPException(409, "Google sign-in isn't set up on this AutoShift yet. Add a service account key instead.")
    state = google_api.make_state(settings, ctx.account_id, ctx.user.id, name)
    return {"url": google_api.auth_url(settings, state)}


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    sdb: ServiceDb,
    settings: Annotated[Settings, Depends(get_settings)],
    code: str = "",
    state: str = "",
    error: str = "",
):
    """Google sends the browser back here. Saves the connection, then returns to Connections."""
    back = settings.site_url.rstrip("/") + "/flows/connections"

    def done(**q: str) -> RedirectResponse:
        return RedirectResponse(back + "?" + urlencode(q), status_code=303)

    if error:
        return done(google="cancelled" if error == "access_denied" else "error", reason=error[:100])
    try:
        info = google_api.read_state(settings, state)
        # The person who started this must still be an admin of that business.
        members = await sdb.select("profiles", {"user_id": info["u"]}, limit=1)
        if not members or str(members[0].get("account_id")) != info["a"] or members[0].get("account_role") not in ("owner", "admin"):
            raise google_api.GoogleError(403, "Only owners and admins can connect accounts")
        tokens = await google_api.exchange_code(settings, code)
        email = str((await google_api.userinfo(tokens["access_token"])).get("email") or "Google account")
        await _save(sdb, sdb, settings, account_id=info["a"], user_id=info["u"], kind="google", name=info.get("n") or email,
                    detail=email, mode=None, secret=google_api.dumps_oauth_secret(tokens, email))
    except google_api.GoogleError as exc:
        return done(google="error", reason=exc.message[:200])
    except Exception as exc:  # noqa: BLE001 - never show a raw error page to the business
        log.exception("google connect failed: %s", exc)
        return done(google="error", reason="Something went wrong. Try again.")
    return done(google="connected")


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(connection_id: str, ctx: AdminMember, db: UserDb, sdb: ServiceDb):
    rows = await db.select("flow_connections", {"id": connection_id, "account_id": ctx.account_id}, limit=1)
    if not rows:
        raise HTTPException(404, "Connection not found")
    await db.delete("flow_connections", {"id": connection_id, "account_id": ctx.account_id})
    await audit.record(sdb, scope="account", action="connection.delete", actor_id=ctx.user.id, account_id=ctx.account_id, target=connection_id, details={"kind": rows[0]["kind"]})

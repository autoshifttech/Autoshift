"""Google for flows: Sheets (add a row) and Calendar (add an event).

A Google connection holds one of two secrets (encrypted in flow_connection_secrets):
- {"type": "oauth", "refresh_token": ..., "email": ...} from "Connect Google" (the business signs in);
- a service-account JSON key the business pasted (the sheet or calendar is shared with its email).
Either way we turn it into a short-lived access token and call the Google APIs with it.
"""

import json
import re
import time
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

import httpx
import jwt

from .config import Settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar.events",
]
STATE_MINUTES = 10


class GoogleError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def oauth_ready(settings: Settings) -> bool:
    return bool(settings.google_oauth_client_id and settings.google_oauth_client_secret and settings.public_api_url and settings.encryption_key)


def redirect_uri(settings: Settings) -> str:
    return settings.public_api_url.rstrip("/") + "/v1/connections/google/callback"


def make_state(settings: Settings, account_id: str, user_id: str, name: str) -> str:
    """A signed, short-lived note of who asked, so the callback can't be replayed for another business."""
    exp = int(time.time()) + STATE_MINUTES * 60
    return jwt.encode({"a": account_id, "u": user_id, "n": name[:80], "exp": exp, "p": "google-connect"}, settings.encryption_key, algorithm="HS256")


def read_state(settings: Settings, state: str) -> dict:
    try:
        data = jwt.decode(state, settings.encryption_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise GoogleError(400, "This sign-in link has expired. Try Connect Google again.") from exc
    if data.get("p") != "google-connect":
        raise GoogleError(400, "Not a Google connect request")
    return data


def auth_url(settings: Settings, state: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": redirect_uri(settings),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        # Always ask, so Google returns a refresh token even for an account that connected before.
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    })


async def _post_form(url: str, data: dict[str, str]) -> dict[str, Any]:
    """Replaced in tests."""
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(url, data=data)
    body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    if res.status_code >= 400:
        raise GoogleError(res.status_code, str(body.get("error_description") or body.get("error") or res.text[:200]))
    return body


async def _call(method: str, url: str, token: str, body: dict | None = None) -> dict[str, Any]:
    """Replaced in tests."""
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.request(method, url, json=body, headers={"Authorization": f"Bearer {token}"})
    if res.status_code >= 400:
        try:
            msg = res.json().get("error", {}).get("message") or res.text[:200]
        except ValueError:
            msg = res.text[:200]
        raise GoogleError(res.status_code, msg)
    return res.json() if res.content else {}


async def userinfo(token: str) -> dict[str, Any]:
    return await _call("GET", USERINFO_URL, token)


async def exchange_code(settings: Settings, code: str) -> dict[str, Any]:
    """The code Google sent back → tokens. Needs a refresh token to keep working later."""
    tokens = await _post_form(TOKEN_URL, {
        "code": code,
        "client_id": settings.google_oauth_client_id,
        "client_secret": settings.google_oauth_client_secret,
        "redirect_uri": redirect_uri(settings),
        "grant_type": "authorization_code",
    })
    if not tokens.get("refresh_token"):
        raise GoogleError(400, "Google didn't give lasting access. Try again and allow every permission.")
    granted = set(str(tokens.get("scope", "")).split())
    missing = [s for s in SCOPES[2:] if s not in granted]
    if missing:
        raise GoogleError(400, "Tick both Sheets and Calendar on Google's permission screen, then try again.")
    return tokens


# ------------------------------------------------------------ access tokens

_cache: dict[str, tuple[str, float]] = {}


async def access_token(settings: Settings, connection_id: str, secret: dict) -> str:
    hit = _cache.get(connection_id)
    if hit and hit[1] > time.time() + 60:
        return hit[0]
    if secret.get("type") == "oauth":
        out = await _post_form(TOKEN_URL, {
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "refresh_token": secret["refresh_token"],
            "grant_type": "refresh_token",
        })
    elif secret.get("type") == "service_account":
        now = int(time.time())
        assertion = jwt.encode(
            {"iss": secret["client_email"], "scope": " ".join(SCOPES[2:]), "aud": TOKEN_URL, "iat": now, "exp": now + 3600},
            secret["private_key"], algorithm="RS256",
        )
        out = await _post_form(TOKEN_URL, {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion})
    else:
        raise GoogleError(409, "This Google connection can't be used; add it again")
    token = str(out.get("access_token") or "")
    if not token:
        raise GoogleError(502, "Google gave no access token")
    _cache[connection_id] = (token, time.time() + int(out.get("expires_in") or 3000))
    return token


# ------------------------------------------------------------ the two actions

def spreadsheet_id(value: str) -> str:
    """Accepts the sheet's id or its full link."""
    m = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]+)", value)
    sid = m.group(1) if m else value.strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", sid):
        raise GoogleError(422, "That isn't a Google Sheet link or id")
    return sid


def row_values(raw: str) -> list[str]:
    """One value per line (the flow editor's box); empty lines stay as empty cells in between."""
    lines = raw.replace("\r\n", "\n").split("\n")
    while lines and not lines[-1].strip():
        lines.pop()
    return [line.strip()[:5000] for line in lines][:100]


async def sheets_append(token: str, spreadsheet: str, sheet: str, values: str) -> dict[str, Any]:
    sid = spreadsheet_id(spreadsheet)
    tab = (sheet or "Sheet1").strip()[:100]
    rng = quote(f"'{tab}'!A1", safe="")
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{sid}/values/{rng}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
    out = await _call("POST", url, token, {"values": [row_values(values)]})
    return {"link": f"https://docs.google.com/spreadsheets/d/{sid}", "range": (out.get("updates") or {}).get("updatedRange")}


_FORMATS = ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M", "%Y-%m-%d %I:%M %p", "%d/%m/%Y %I:%M %p", "%d-%m-%Y %I:%M %p")


def parse_start(value: str, tz: str) -> datetime:
    """'2026-11-20 15:30', '20/11/2026 3:30 PM' or ISO with an offset. Times without one are in tz."""
    text = value.strip().upper().replace(".", "")
    try:
        when = datetime.fromisoformat(value.strip())
    except ValueError:
        when = None
        for fmt in _FORMATS:
            try:
                when = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
    if when is None:
        raise GoogleError(422, f"Couldn't read the start time '{value[:40]}'. Use 2026-11-20 15:30.")
    if when.tzinfo is None:
        when = when.replace(tzinfo=ZoneInfo(tz))
    return when


async def calendar_event(token: str, calendar: str, title: str, start: str, minutes: str, tz: str = "Asia/Kolkata", description: str = "") -> dict[str, Any]:
    begin = parse_start(start, tz)
    try:
        length = max(5, min(int(str(minutes or "30").strip() or 30), 24 * 60))
    except ValueError:
        length = 30
    cal = quote((calendar or "primary").strip() or "primary", safe="")
    body = {
        "summary": (title or "Appointment").strip()[:300],
        "description": description[:4000],
        "start": {"dateTime": begin.isoformat(), "timeZone": tz},
        "end": {"dateTime": (begin + timedelta(minutes=length)).isoformat(), "timeZone": tz},
    }
    out = await _call("POST", f"https://www.googleapis.com/calendar/v3/calendars/{cal}/events", token, body)
    return {"link": out.get("htmlLink", ""), "event_id": out.get("id")}


def dumps_oauth_secret(tokens: dict, email: str) -> str:
    return json.dumps({"type": "oauth", "refresh_token": tokens["refresh_token"], "email": email})

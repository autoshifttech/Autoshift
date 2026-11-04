"""Token verification and secret encryption."""

import base64
import os
from dataclasses import dataclass
from functools import lru_cache

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import Settings


class AuthError(Exception):
    """The request has no valid login."""


@dataclass(frozen=True)
class TokenUser:
    id: str
    email: str | None
    token: str


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)


def verify_token(token: str, settings: Settings) -> TokenUser:
    """Check a Supabase access token and return who it belongs to."""
    try:
        if settings.supabase_jwt_secret:
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            if not settings.supabase_url:
                raise AuthError("Server is not configured for login")
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["RS256", "ES256"],
                audience="authenticated",
            )
    except AuthError:
        raise
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid or expired token") from exc
    sub = claims.get("sub")
    if not sub:
        raise AuthError("Token has no user")
    return TokenUser(id=str(sub), email=claims.get("email"), token=token)


# ------------------------------------------------------------- secret box
_PREFIX = "py1:"


def _key(settings: Settings) -> bytes:
    raw = settings.encryption_key.strip()
    if len(raw) != 64:
        raise RuntimeError("ENCRYPTION_KEY must be 64 hex characters")
    return bytes.fromhex(raw)


def encrypt(plaintext: str, settings: Settings) -> str:
    """AES-256-GCM. A fresh random nonce per value; the tag guards against edits."""
    nonce = os.urandom(12)
    sealed = AESGCM(_key(settings)).encrypt(nonce, plaintext.encode(), None)
    return _PREFIX + base64.b64encode(nonce + sealed).decode()


def decrypt(token: str, settings: Settings) -> str:
    if not token.startswith(_PREFIX):
        raise ValueError("Unknown secret format")
    blob = base64.b64decode(token[len(_PREFIX):])
    return AESGCM(_key(settings)).decrypt(blob[:12], blob[12:], None).decode()


def mask(value: str) -> str:
    """Shows the start and end of an id, hides the middle."""
    v = value.strip()
    return f"{v[:3]}••••" if len(v) <= 10 else f"{v[:8]}••••{v[-4:]}"

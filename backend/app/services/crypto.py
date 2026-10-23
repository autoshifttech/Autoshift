"""Symmetric encryption for secrets stored in the database (business tokens, registration PINs)."""

import secrets

from cryptography.fernet import Fernet, InvalidToken


class SecretBox:
    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode())
        except (ValueError, TypeError) as exc:
            raise ValueError(
                "TOKEN_ENCRYPTION_KEY must be a Fernet key; generate one with "
                '`python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"`'
            ) from exc

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise ValueError("Stored secret could not be decrypted with the current key") from exc


def generate_pin() -> str:
    """Six-digit two-step verification PIN used when registering a phone number."""
    return f"{secrets.randbelow(1_000_000):06d}"

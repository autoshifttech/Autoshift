"""Runtime configuration. Every secret comes from environment variables (or backend/.env)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    # Meta / WhatsApp Cloud API
    meta_app_id: str
    meta_app_secret: SecretStr
    meta_graph_version: str = Field(pattern=r"^v\d+\.\d+$")
    meta_graph_base_url: str = "https://graph.facebook.com"
    whatsapp_webhook_verify_token: SecretStr

    # Fernet key (urlsafe base64, 32 bytes) used to encrypt business tokens and PINs at rest.
    token_encryption_key: SecretStr

    # Storage: "postgres" (Supabase) in every real deployment; "memory" for local demos/tests.
    repository_backend: Literal["postgres", "memory"] = "postgres"
    database_url: SecretStr | None = None

    # Supabase Auth: JWTs are verified with the project's JWKS, or the legacy HS256 secret if set.
    supabase_url: str
    supabase_jwt_secret: SecretStr | None = None
    supabase_jwt_audience: str = "authenticated"

    signup_rate_limit_per_minute: int = 10

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def graph_url(self) -> str:
        return f"{self.meta_graph_base_url.rstrip('/')}/{self.meta_graph_version}"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

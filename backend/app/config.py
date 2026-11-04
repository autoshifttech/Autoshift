"""Settings, read from the environment (or a .env file)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase project.
    supabase_url: str = ""
    # The key the backend uses for trusted work (never sent to a browser).
    supabase_service_role_key: str = ""
    # The public anon key; tenant calls use it together with the user's own token.
    supabase_anon_key: str = ""
    # Legacy HS256 projects verify tokens with this secret. When empty, the
    # project's public JWKS is used (newer, asymmetric projects).
    supabase_jwt_secret: str = ""

    # 64 hex characters (32 bytes). Encrypts provider and connection secrets.
    encryption_key: str = ""

    # Browser origins allowed to call the API, comma separated.
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

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

    # The platform's Razorpay account (test keys until you go live).
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    # The secret you set on the webhook in the Razorpay dashboard.
    razorpay_webhook_secret: str = ""

    # Wallet top-up limits, in rupees. GST is added on top of the credit amount.
    topup_min_inr: int = 500
    topup_max_inr: int = 100000
    # Public address of the web app, for invite links (…/join/<token>).
    site_url: str = "http://localhost:3000"
    # State code of the seller (first two digits of its GSTIN): decides CGST+SGST versus IGST.
    seller_state_code: str = "29"
    gst_rate: float = 0.18

    # Browser origins allowed to call the API, comma separated.
    cors_origins: str = "http://localhost:3000"
    # Hosts the MCP endpoint answers to (DNS-rebinding protection). Add your API domain in production.
    # Retry queued webhook deliveries in the background (turn off for one-off scripts and tests).
    webhook_worker: bool = True
    mcp_allowed_hosts: str = "localhost:*,127.0.0.1:*"

    @property
    def mcp_hosts(self) -> list[str]:
        return [h.strip() for h in self.mcp_allowed_hosts.split(",") if h.strip()]

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

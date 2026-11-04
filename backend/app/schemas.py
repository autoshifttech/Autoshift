"""Request and response shapes."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

Tone = Literal["friendly", "professional", "concise"]
Audience = Literal["all", "new_contacts", "tagged", "after_hours"]
Vendor = Literal["openai", "google", "anthropic", "deepseek", "deepinfra"]
Tier = Literal["newest", "flagship", "balanced", "fast", "reasoning", "preview", "value"]


class Handoff(BaseModel):
    onRequest: bool = True
    onUnknown: bool = True
    maxReplies: int = Field(15, ge=1, le=50)


class Faq(BaseModel):
    q: str = Field("", max_length=300)
    a: str = Field("", max_length=4000)


class AssistantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = "custom"
    color: str = Field("#1E4C41", pattern=r"^#[0-9A-Fa-f]{6}$")
    enabled: bool = False
    tone: Tone = "friendly"
    instructions: str = Field("", max_length=8000)
    greeting: str = Field("", max_length=500)
    provider: Vendor = "openai"
    model_id: str = Field("", max_length=120)
    knowledge: list[Faq] = []
    tool_ids: list[str] = []
    capture_leads: bool = False
    audience: Audience = "all"
    tags: list[str] = []
    handoff: Handoff = Handoff()


class AssistantPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    enabled: bool | None = None
    tone: Tone | None = None
    instructions: str | None = Field(None, max_length=8000)
    greeting: str | None = Field(None, max_length=500)
    provider: Vendor | None = None
    model_id: str | None = Field(None, max_length=120)
    knowledge: list[Faq] | None = None
    tool_ids: list[str] | None = None
    capture_leads: bool | None = None
    audience: Audience | None = None
    tags: list[str] | None = None
    handoff: Handoff | None = None


class GoogleSecret(BaseModel):
    service_account_json: str

    @field_validator("service_account_json")
    @classmethod
    def _valid(cls, v: str) -> str:
        import json

        try:
            data = json.loads(v)
        except ValueError as exc:
            raise ValueError("That isn't valid JSON") from exc
        email = data.get("client_email", "")
        if data.get("type") != "service_account" or not str(email).endswith(".gserviceaccount.com") or not data.get("private_key"):
            raise ValueError("This doesn't look like a service account key")
        return v


class RazorpaySecret(BaseModel):
    key_id: str = Field(pattern=r"^rzp_(live|test)_[A-Za-z0-9]{6,}$")
    key_secret: str = Field(min_length=8)
    webhook_secret: str | None = None


class ConnectionCreate(BaseModel):
    kind: Literal["google", "razorpay"]
    name: str = Field("", max_length=80)
    google: GoogleSecret | None = None
    razorpay: RazorpaySecret | None = None


class ProviderUpdate(BaseModel):
    enabled: bool | None = None
    api_key: str | None = Field(None, min_length=8, max_length=400)


class ModelUpdate(BaseModel):
    enabled: bool | None = None
    is_default: bool | None = None


class ModelCreate(BaseModel):
    model_id: str = Field(min_length=1, max_length=120)
    label: str = Field("", max_length=120)
    tier: Tier = "balanced"


class TopupCreate(BaseModel):
    amount_inr: int = Field(gt=0)


class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class SubscriptionCheckout(BaseModel):
    plan_id: Literal["starter", "growth", "pro"]
    cycle: Literal["monthly", "yearly"] = "monthly"


class SubscriptionVerify(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


class WalletAdjust(BaseModel):
    amount_paise: int
    reason: str = Field(min_length=3, max_length=200)
    idempotency_key: str = Field(min_length=8, max_length=80)


class RefundRequest(BaseModel):
    amount_paise: int | None = Field(None, gt=0)
    reason: str = Field(min_length=3, max_length=200)

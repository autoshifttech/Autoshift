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


class KeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scope: Literal["read", "write"] = "read"
    expires_in_days: int | None = Field(90, ge=1, le=365)


class ReplyTest(BaseModel):
    """Try an assistant on a sample message. This is a real AI call and is charged."""

    message: str = Field(min_length=1, max_length=2000)
    history: list[dict] = Field(default_factory=list, max_length=30)
    idempotency_key: str = Field(min_length=8, max_length=80)

    @field_validator("history")
    @classmethod
    def _shape(cls, v: list[dict]) -> list[dict]:
        for turn in v:
            if turn.get("role") not in ("user", "assistant") or not isinstance(turn.get("content"), str) or len(turn["content"]) > 2000:
                raise ValueError("Each turn needs a role (user or assistant) and text")
        return [{"role": t["role"], "content": t["content"]} for t in v]


class Person(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)


class BusinessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    industry: str = Field("", max_length=60)
    city: str = Field("", max_length=60)
    owner: Person
    plan_id: str = "starter"


class BusinessPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    industry: str | None = Field(None, max_length=60)
    city: str | None = Field(None, max_length=60)


class Suspend(BaseModel):
    suspended: bool
    reason: str = Field("", max_length=300)


class MemberAdd(Person):
    role: Literal["admin", "agent", "viewer"]


class MemberPatch(BaseModel):
    role: Literal["owner", "admin", "agent", "viewer"]


class HookCreate(BaseModel):
    url: str = Field(max_length=500)
    events: list[str] = Field(default_factory=lambda: ["*"], min_length=1, max_length=10)
    label: str = Field("", max_length=80)

    @field_validator("events")
    @classmethod
    def _known(cls, v: list[str]) -> list[str]:
        from .events import EVENT_TYPES

        bad = [e for e in v if e != "*" and e not in EVENT_TYPES]
        if bad:
            raise ValueError(f"Unknown event: {bad[0]}")
        return v


class BillingDetails(BaseModel):
    legal_name: str = Field("", max_length=160)
    has_gstin: bool = False
    gstin: str = Field("", max_length=15)
    state_code: str = Field("", max_length=2)
    address: str = Field("", max_length=300)
    city: str = Field("", max_length=80)
    pincode: str = Field("", max_length=6)
    email: str = Field("", max_length=200)


class SubscriptionChange(BaseModel):
    """Platform staff change a business's plan or extend its trial."""

    plan_id: Literal["starter", "growth", "pro"] | None = None
    extend_trial_days: int | None = Field(None, ge=1, le=90)


class NoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class TeamRole(BaseModel):
    role: Literal["owner", "admin", "agent", "viewer"]


class InviteCreate(BaseModel):
    role: Literal["admin", "agent", "viewer"]
    expires_in_days: int = Field(7, ge=1, le=365)
    label: str = Field("", max_length=80)


class ToolParam(BaseModel):
    name: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,40}$")
    type: Literal["string", "number", "boolean"] = "string"
    required: bool = True
    description: str = Field("", max_length=200)


class ToolWebhook(BaseModel):
    url: str = Field(max_length=500)
    method: Literal["GET", "POST"] = "POST"
    params: list[ToolParam] = Field(default_factory=list, max_length=10)


class ToolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=500)
    enabled: bool = True
    webhook: ToolWebhook


class ToolPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    description: str | None = Field(None, min_length=1, max_length=500)
    enabled: bool | None = None
    webhook: ToolWebhook | None = None


TicketCategory = Literal["WhatsApp connection", "Billing", "Templates", "AI assistant", "Bug", "Other"]
TicketPriority = Literal["low", "normal", "high", "urgent"]


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=160)
    category: TicketCategory = "Other"
    priority: TicketPriority = "normal"
    message: str = Field(min_length=1, max_length=5000)


class TicketReply(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class StaffReply(TicketReply):
    note: bool = False  # staff-only, never shown to the business
    close: bool = False


class TicketPatch(BaseModel):
    status: Literal["open", "pending", "closed"] | None = None
    priority: TicketPriority | None = None
    assignee: str | None = Field(None, max_length=120)


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field("", max_length=2000)
    kind: Literal["news", "maintenance", "banner"] = "news"
    audience: Literal["all", "trial", "paying", "starter", "growth", "pro"] = "all"
    draft: bool = False
    publish_at: str | None = None


class AdminIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)
    name: str = Field(min_length=1, max_length=120)
    role: Literal["super_admin", "support", "finance", "read_only"]


class AdminRolePatch(BaseModel):
    role: Literal["super_admin", "support", "finance", "read_only"]


class AnnouncementPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)
    body: str | None = Field(None, max_length=2000)
    kind: Literal["news", "maintenance", "banner"] | None = None
    audience: Literal["all", "trial", "paying", "starter", "growth", "pro"] | None = None
    draft: bool | None = None
    publish_at: str | None = None


MessageCategory = Literal["marketing", "utility", "authentication", "service", "ai"]


class InternalCharge(BaseModel):
    account_id: str
    category: MessageCategory
    units: int = Field(1, ge=1, le=100000)
    ref: str = Field(min_length=1, max_length=200)
    idempotency_key: str = Field(min_length=8, max_length=200)


class InternalCanSend(BaseModel):
    account_id: str
    category: MessageCategory
    units: int = Field(1, ge=1, le=100000)


class InternalAiReply(BaseModel):
    account_id: str
    assistant_id: str
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict] = Field(default_factory=list, max_length=40)
    ref: str = Field(min_length=8, max_length=200)


class InternalEvent(BaseModel):
    account_id: str
    type: str
    data: dict = Field(default_factory=dict)


class CloseBusiness(BaseModel):
    """Typing the business's name confirms it: closing can't be undone."""

    confirm_name: str = Field(min_length=1, max_length=120)


class CloseRequest(CloseBusiness):
    reason: str = Field("", max_length=60)

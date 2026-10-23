"""Request/response bodies. Secrets (tokens, PINs) never appear in any response model."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models import ConnectionStatus, MemberRole, OnboardingType, WhatsAppAccount

GraphId = Field(min_length=1, max_length=64, pattern=r"^\d+$")


class EmbeddedSignupIn(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    waba_id: str = GraphId
    phone_number_id: str = GraphId
    onboarding_type: OnboardingType = OnboardingType.CLOUD


class WhatsAppAccountOut(BaseModel):
    waba_id: str
    phone_number_id: str
    onboarding_type: OnboardingType
    display_phone_number: str | None
    verified_name: str | None
    quality_rating: str | None
    number_status: str | None
    code_verification_status: str | None
    name_status: str | None
    connection_status: ConnectionStatus
    webhooks_subscribed: bool
    phone_registered: bool
    last_error: dict[str, Any] | None
    connected_at: datetime | None
    last_webhook_at: datetime | None
    updated_at: datetime

    @classmethod
    def from_account(cls, account: WhatsAppAccount) -> "WhatsAppAccountOut":
        return cls(
            waba_id=account.waba_id,
            phone_number_id=account.phone_number_id,
            onboarding_type=account.onboarding_type,
            display_phone_number=account.display_phone_number,
            verified_name=account.verified_name,
            quality_rating=account.quality_rating,
            number_status=account.number_status,
            code_verification_status=account.code_verification_status,
            name_status=account.name_status,
            connection_status=account.connection_status,
            webhooks_subscribed=account.webhooks_subscribed,
            phone_registered=account.phone_registered,
            last_error=account.last_error,
            connected_at=account.connected_at,
            last_webhook_at=account.last_webhook_at,
            updated_at=account.updated_at,
        )


class AccountEnvelope(BaseModel):
    account: WhatsAppAccountOut | None


class TenantIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TenantOut(BaseModel):
    id: UUID
    name: str
    role: MemberRole
    created_at: datetime


class MessageOut(BaseModel):
    wamid: str
    direction: str
    from_number: str
    contact_name: str | None
    message_type: str
    text: str | None
    sent_at: datetime
    latest_status: str | None


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    company: str | None = Field(default=None, max_length=160)
    topic: Literal["sales", "support", "partnerships"]
    message: str = Field(min_length=10, max_length=5000)
    # Honeypot: real visitors never fill this hidden field.
    website: str | None = Field(default=None, max_length=200)

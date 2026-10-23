"""Domain records shared by the repositories, services and routers."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4


def utcnow() -> datetime:
    return datetime.now(UTC)


class ConnectionStatus(StrEnum):
    PENDING = "pending"
    CONNECTED = "connected"
    SUBSCRIBE_FAILED = "subscribe_failed"
    REGISTRATION_FAILED = "registration_failed"
    DISCONNECTED = "disconnected"
    RESTRICTED = "restricted"


class OnboardingType(StrEnum):
    CLOUD = "cloud"
    # Number stays on the WhatsApp Business app (coexistence); it must not be re-registered.
    COEXISTENCE = "coexistence"


class MemberRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    AGENT = "agent"


@dataclass
class Tenant:
    id: UUID
    name: str
    created_at: datetime


@dataclass
class WhatsAppAccount:
    tenant_id: UUID
    waba_id: str
    phone_number_id: str
    onboarding_type: OnboardingType = OnboardingType.CLOUD
    id: UUID = field(default_factory=uuid4)
    display_phone_number: str | None = None
    verified_name: str | None = None
    quality_rating: str | None = None
    number_status: str | None = None
    code_verification_status: str | None = None
    name_status: str | None = None
    connection_status: ConnectionStatus = ConnectionStatus.PENDING
    webhooks_subscribed: bool = False
    phone_registered: bool = False
    token_ciphertext: str | None = None
    pin_ciphertext: str | None = None
    last_error: dict[str, Any] | None = None
    connected_at: datetime | None = None
    last_webhook_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)

    def apply_phone_details(self, details: dict[str, Any]) -> None:
        self.display_phone_number = details.get("display_phone_number", self.display_phone_number)
        self.verified_name = details.get("verified_name", self.verified_name)
        self.quality_rating = details.get("quality_rating", self.quality_rating)
        self.number_status = details.get("status", self.number_status)
        self.code_verification_status = details.get(
            "code_verification_status", self.code_verification_status
        )
        self.name_status = details.get("name_status", self.name_status)


@dataclass
class InboundMessage:
    tenant_id: UUID
    wamid: str
    phone_number_id: str
    from_number: str
    message_type: str
    sent_at: datetime
    contact_name: str | None = None
    text: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class MessageStatus:
    tenant_id: UUID
    wamid: str
    status: str
    recipient_id: str | None
    occurred_at: datetime
    errors: list[dict[str, Any]] | None = None


@dataclass
class MessageView:
    wamid: str
    direction: str
    from_number: str
    contact_name: str | None
    message_type: str
    text: str | None
    sent_at: datetime
    latest_status: str | None


@dataclass
class ContactRequest:
    name: str
    email: str
    topic: str
    message: str
    company: str | None = None
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=utcnow)

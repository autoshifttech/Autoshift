"""Storage interface: `PostgresRepository` (Supabase) or `MemoryRepository` (tests/demos)."""

from typing import Any, Protocol
from uuid import UUID

from app.models import (
    ContactRequest,
    InboundMessage,
    MemberRole,
    MessageStatus,
    MessageView,
    Tenant,
    WhatsAppAccount,
)


class WabaOwnedByAnotherTenant(Exception):
    """A WABA can only be connected to one tenant at a time."""


class Repository(Protocol):
    async def list_tenants_for_user(self, user_id: UUID) -> list[tuple[Tenant, MemberRole]]: ...

    async def create_tenant(self, name: str, owner_user_id: UUID) -> Tenant: ...

    async def get_member_role(self, tenant_id: UUID, user_id: UUID) -> MemberRole | None: ...

    async def get_account_by_tenant(self, tenant_id: UUID) -> WhatsAppAccount | None: ...

    async def get_account_by_waba(self, waba_id: str) -> WhatsAppAccount | None: ...

    async def save_account(self, account: WhatsAppAccount) -> WhatsAppAccount:
        """Insert or update by id. Raises WabaOwnedByAnotherTenant on a WABA/number clash."""
        ...

    async def insert_webhook_event(
        self, *, field: str, waba_id: str | None, tenant_id: UUID | None, payload: dict[str, Any]
    ) -> UUID: ...

    async def mark_webhook_event_processed(
        self, event_id: UUID, error: str | None = None
    ) -> None: ...

    async def insert_message(self, message: InboundMessage) -> bool:
        """Returns False when the wamid was already stored (Meta redelivery)."""
        ...

    async def insert_message_status(self, status: MessageStatus) -> bool: ...

    async def list_messages(self, tenant_id: UUID, limit: int) -> list[MessageView]: ...

    async def insert_contact_request(self, request: ContactRequest) -> None: ...

    async def close(self) -> None: ...

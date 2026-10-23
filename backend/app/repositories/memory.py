"""In-process repository for tests and local demos. Data is lost on restart."""

import asyncio
import copy
from typing import Any
from uuid import UUID, uuid4

from app.models import (
    ContactRequest,
    InboundMessage,
    MemberRole,
    MessageStatus,
    MessageView,
    Tenant,
    WhatsAppAccount,
    utcnow,
)
from app.repositories.base import WabaOwnedByAnotherTenant


class MemoryRepository:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self.tenants: dict[UUID, Tenant] = {}
        self.members: dict[tuple[UUID, UUID], MemberRole] = {}
        self.accounts: dict[UUID, WhatsAppAccount] = {}
        self.webhook_events: dict[UUID, dict[str, Any]] = {}
        self.messages: dict[str, InboundMessage] = {}
        self.statuses: dict[tuple[str, str], MessageStatus] = {}
        self.contact_requests: list[ContactRequest] = []

    async def list_tenants_for_user(self, user_id: UUID) -> list[tuple[Tenant, MemberRole]]:
        return [
            (self.tenants[tenant_id], role)
            for (tenant_id, member_id), role in self.members.items()
            if member_id == user_id
        ]

    async def create_tenant(self, name: str, owner_user_id: UUID) -> Tenant:
        async with self._lock:
            tenant = Tenant(id=uuid4(), name=name, created_at=utcnow())
            self.tenants[tenant.id] = tenant
            self.members[(tenant.id, owner_user_id)] = MemberRole.OWNER
            return tenant

    async def get_member_role(self, tenant_id: UUID, user_id: UUID) -> MemberRole | None:
        return self.members.get((tenant_id, user_id))

    async def get_account_by_tenant(self, tenant_id: UUID) -> WhatsAppAccount | None:
        for account in self.accounts.values():
            if account.tenant_id == tenant_id:
                return copy.deepcopy(account)
        return None

    async def get_account_by_waba(self, waba_id: str) -> WhatsAppAccount | None:
        for account in self.accounts.values():
            if account.waba_id == waba_id:
                return copy.deepcopy(account)
        return None

    async def save_account(self, account: WhatsAppAccount) -> WhatsAppAccount:
        async with self._lock:
            for other in self.accounts.values():
                if other.id == account.id:
                    continue
                if other.waba_id == account.waba_id or other.phone_number_id == (
                    account.phone_number_id
                ):
                    raise WabaOwnedByAnotherTenant(account.waba_id)
                if other.tenant_id == account.tenant_id:
                    raise ValueError("Tenant already has a different WhatsApp account row")
            account.updated_at = utcnow()
            self.accounts[account.id] = copy.deepcopy(account)
            return copy.deepcopy(account)

    async def insert_webhook_event(
        self, *, field: str, waba_id: str | None, tenant_id: UUID | None, payload: dict[str, Any]
    ) -> UUID:
        event_id = uuid4()
        self.webhook_events[event_id] = {
            "field": field,
            "waba_id": waba_id,
            "tenant_id": tenant_id,
            "payload": payload,
            "received_at": utcnow(),
            "processed_at": None,
            "error": None,
        }
        return event_id

    async def mark_webhook_event_processed(self, event_id: UUID, error: str | None = None) -> None:
        event = self.webhook_events[event_id]
        event["processed_at"] = utcnow()
        event["error"] = error

    async def insert_message(self, message: InboundMessage) -> bool:
        if message.wamid in self.messages:
            return False
        self.messages[message.wamid] = message
        return True

    async def insert_message_status(self, status: MessageStatus) -> bool:
        key = (status.wamid, status.status)
        if key in self.statuses:
            return False
        self.statuses[key] = status
        return True

    async def list_messages(self, tenant_id: UUID, limit: int) -> list[MessageView]:
        rows = sorted(
            (m for m in self.messages.values() if m.tenant_id == tenant_id),
            key=lambda m: m.sent_at,
            reverse=True,
        )[:limit]
        views = []
        for m in rows:
            statuses = sorted(
                (s for (wamid, _), s in self.statuses.items() if wamid == m.wamid),
                key=lambda s: s.occurred_at,
            )
            views.append(
                MessageView(
                    wamid=m.wamid,
                    direction="inbound",
                    from_number=m.from_number,
                    contact_name=m.contact_name,
                    message_type=m.message_type,
                    text=m.text,
                    sent_at=m.sent_at,
                    latest_status=statuses[-1].status if statuses else None,
                )
            )
        return views

    async def insert_contact_request(self, request: ContactRequest) -> None:
        self.contact_requests.append(request)

    async def close(self) -> None:
        return None

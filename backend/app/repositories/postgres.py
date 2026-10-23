"""Supabase Postgres repository (asyncpg).

Use the Supabase connection string from Project Settings -> Database. Statement caching is off so
the transaction pooler (port 6543) works as well as a direct connection.
"""

import json
from typing import Any
from uuid import UUID

import asyncpg

from app.models import (
    ConnectionStatus,
    ContactRequest,
    InboundMessage,
    MemberRole,
    MessageStatus,
    MessageView,
    OnboardingType,
    Tenant,
    WhatsAppAccount,
)
from app.repositories.base import WabaOwnedByAnotherTenant

_ACCOUNT_COLUMNS = (
    "id, tenant_id, waba_id, phone_number_id, onboarding_type, display_phone_number, "
    "verified_name, quality_rating, number_status, code_verification_status, name_status, "
    "connection_status, webhooks_subscribed, phone_registered, token_ciphertext, pin_ciphertext, "
    "last_error, connected_at, last_webhook_at, created_at, updated_at"
)


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


def _account_from_row(row: asyncpg.Record) -> WhatsAppAccount:
    return WhatsAppAccount(
        id=row["id"],
        tenant_id=row["tenant_id"],
        waba_id=row["waba_id"],
        phone_number_id=row["phone_number_id"],
        onboarding_type=OnboardingType(row["onboarding_type"]),
        display_phone_number=row["display_phone_number"],
        verified_name=row["verified_name"],
        quality_rating=row["quality_rating"],
        number_status=row["number_status"],
        code_verification_status=row["code_verification_status"],
        name_status=row["name_status"],
        connection_status=ConnectionStatus(row["connection_status"]),
        webhooks_subscribed=row["webhooks_subscribed"],
        phone_registered=row["phone_registered"],
        token_ciphertext=row["token_ciphertext"],
        pin_ciphertext=row["pin_ciphertext"],
        last_error=row["last_error"],
        connected_at=row["connected_at"],
        last_webhook_at=row["last_webhook_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class PostgresRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "PostgresRepository":
        pool = await asyncpg.create_pool(
            dsn, min_size=1, max_size=10, statement_cache_size=0, init=_init_connection
        )
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()

    async def list_tenants_for_user(self, user_id: UUID) -> list[tuple[Tenant, MemberRole]]:
        rows = await self._pool.fetch(
            """
            select t.id, t.name, t.created_at, m.role
            from public.tenant_members m join public.tenants t on t.id = m.tenant_id
            where m.user_id = $1 order by t.created_at
            """,
            user_id,
        )
        return [
            (Tenant(id=r["id"], name=r["name"], created_at=r["created_at"]), MemberRole(r["role"]))
            for r in rows
        ]

    async def create_tenant(self, name: str, owner_user_id: UUID) -> Tenant:
        async with self._pool.acquire() as conn, conn.transaction():
            row = await conn.fetchrow(
                "insert into public.tenants (name) values ($1) returning id, name, created_at",
                name,
            )
            await conn.execute(
                "insert into public.tenant_members (tenant_id, user_id, role) "
                "values ($1, $2, 'owner')",
                row["id"],
                owner_user_id,
            )
        return Tenant(id=row["id"], name=row["name"], created_at=row["created_at"])

    async def get_member_role(self, tenant_id: UUID, user_id: UUID) -> MemberRole | None:
        role = await self._pool.fetchval(
            "select role from public.tenant_members where tenant_id = $1 and user_id = $2",
            tenant_id,
            user_id,
        )
        return MemberRole(role) if role else None

    async def get_account_by_tenant(self, tenant_id: UUID) -> WhatsAppAccount | None:
        row = await self._pool.fetchrow(
            f"select {_ACCOUNT_COLUMNS} from public.whatsapp_accounts where tenant_id = $1",  # noqa: S608
            tenant_id,
        )
        return _account_from_row(row) if row else None

    async def get_account_by_waba(self, waba_id: str) -> WhatsAppAccount | None:
        row = await self._pool.fetchrow(
            f"select {_ACCOUNT_COLUMNS} from public.whatsapp_accounts where waba_id = $1",  # noqa: S608
            waba_id,
        )
        return _account_from_row(row) if row else None

    async def save_account(self, account: WhatsAppAccount) -> WhatsAppAccount:
        try:
            row = await self._pool.fetchrow(
                f"""
                insert into public.whatsapp_accounts ({_ACCOUNT_COLUMNS})
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                        $17, $18, $19, $20, now())
                on conflict (id) do update set
                  waba_id = excluded.waba_id,
                  phone_number_id = excluded.phone_number_id,
                  onboarding_type = excluded.onboarding_type,
                  display_phone_number = excluded.display_phone_number,
                  verified_name = excluded.verified_name,
                  quality_rating = excluded.quality_rating,
                  number_status = excluded.number_status,
                  code_verification_status = excluded.code_verification_status,
                  name_status = excluded.name_status,
                  connection_status = excluded.connection_status,
                  webhooks_subscribed = excluded.webhooks_subscribed,
                  phone_registered = excluded.phone_registered,
                  token_ciphertext = excluded.token_ciphertext,
                  pin_ciphertext = excluded.pin_ciphertext,
                  last_error = excluded.last_error,
                  connected_at = excluded.connected_at,
                  last_webhook_at = excluded.last_webhook_at,
                  updated_at = now()
                returning {_ACCOUNT_COLUMNS}
                """,  # noqa: S608
                account.id,
                account.tenant_id,
                account.waba_id,
                account.phone_number_id,
                account.onboarding_type.value,
                account.display_phone_number,
                account.verified_name,
                account.quality_rating,
                account.number_status,
                account.code_verification_status,
                account.name_status,
                account.connection_status.value,
                account.webhooks_subscribed,
                account.phone_registered,
                account.token_ciphertext,
                account.pin_ciphertext,
                account.last_error,
                account.connected_at,
                account.last_webhook_at,
                account.created_at,
            )
        except asyncpg.UniqueViolationError as exc:
            if "tenant_id" in (exc.constraint_name or ""):
                raise ValueError("Tenant already has a different WhatsApp account row") from exc
            raise WabaOwnedByAnotherTenant(account.waba_id) from exc
        return _account_from_row(row)

    async def insert_webhook_event(
        self, *, field: str, waba_id: str | None, tenant_id: UUID | None, payload: dict[str, Any]
    ) -> UUID:
        return await self._pool.fetchval(
            "insert into public.webhook_events (field, waba_id, tenant_id, payload) "
            "values ($1, $2, $3, $4) returning id",
            field,
            waba_id,
            tenant_id,
            payload,
        )

    async def mark_webhook_event_processed(self, event_id: UUID, error: str | None = None) -> None:
        await self._pool.execute(
            "update public.webhook_events set processed_at = now(), error = $2 where id = $1",
            event_id,
            error,
        )

    async def insert_message(self, message: InboundMessage) -> bool:
        inserted = await self._pool.fetchval(
            """
            insert into public.messages
              (tenant_id, wamid, phone_number_id, from_number, contact_name, message_type, text,
               payload, sent_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            on conflict (wamid) do nothing
            returning id
            """,
            message.tenant_id,
            message.wamid,
            message.phone_number_id,
            message.from_number,
            message.contact_name,
            message.message_type,
            message.text,
            message.payload,
            message.sent_at,
        )
        return inserted is not None

    async def insert_message_status(self, status: MessageStatus) -> bool:
        inserted = await self._pool.fetchval(
            """
            insert into public.message_statuses
              (tenant_id, wamid, status, recipient_id, errors, occurred_at)
            values ($1, $2, $3, $4, $5, $6)
            on conflict (wamid, status) do nothing
            returning id
            """,
            status.tenant_id,
            status.wamid,
            status.status,
            status.recipient_id,
            status.errors,
            status.occurred_at,
        )
        return inserted is not None

    async def list_messages(self, tenant_id: UUID, limit: int) -> list[MessageView]:
        rows = await self._pool.fetch(
            """
            select m.wamid, m.direction, m.from_number, m.contact_name, m.message_type, m.text,
                   m.sent_at,
                   (select s.status from public.message_statuses s
                     where s.wamid = m.wamid order by s.occurred_at desc limit 1) as latest_status
            from public.messages m
            where m.tenant_id = $1
            order by m.sent_at desc
            limit $2
            """,
            tenant_id,
            limit,
        )
        return [MessageView(**dict(r)) for r in rows]

    async def insert_contact_request(self, request: ContactRequest) -> None:
        await self._pool.execute(
            "insert into public.contact_requests (id, name, email, company, topic, message) "
            "values ($1, $2, $3, $4, $5, $6)",
            request.id,
            request.name,
            request.email,
            request.company,
            request.topic,
            request.message,
        )

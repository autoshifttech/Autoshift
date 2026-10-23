-- Autoshift CRM schema for Supabase Postgres.
-- The FastAPI backend connects with a privileged role and enforces tenant scoping itself.
-- RLS is enabled everywhere so the public anon/authenticated roles can never read secrets.

create extension if not exists pgcrypto;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'agent')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);

create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  waba_id text not null unique,
  phone_number_id text not null unique,
  onboarding_type text not null default 'cloud' check (onboarding_type in ('cloud', 'coexistence')),
  display_phone_number text,
  verified_name text,
  quality_rating text,
  number_status text,
  code_verification_status text,
  name_status text,
  connection_status text not null default 'pending' check (
    connection_status in (
      'pending', 'connected', 'subscribe_failed', 'registration_failed', 'disconnected', 'restricted'
    )
  ),
  webhooks_subscribed boolean not null default false,
  phone_registered boolean not null default false,
  -- Fernet ciphertext; the key lives only in the backend's TOKEN_ENCRYPTION_KEY.
  token_ciphertext text,
  pin_ciphertext text,
  last_error jsonb,
  connected_at timestamptz,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  field text not null,
  waba_id text,
  tenant_id uuid references public.tenants (id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index webhook_events_waba_idx on public.webhook_events (waba_id, received_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  wamid text not null unique,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  phone_number_id text not null,
  from_number text not null,
  contact_name text,
  message_type text not null,
  text text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index messages_tenant_sent_idx on public.messages (tenant_id, sent_at desc);

create table public.message_statuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  wamid text not null,
  status text not null,
  recipient_id text,
  errors jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (wamid, status)
);
create index message_statuses_wamid_idx on public.message_statuses (wamid, occurred_at desc);

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  topic text not null check (topic in ('sales', 'support', 'partnerships')),
  message text not null,
  created_at timestamptz not null default now()
);

-- Row level security -------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.webhook_events enable row level security;
alter table public.messages enable row level security;
alter table public.message_statuses enable row level security;
alter table public.contact_requests enable row level security;

create or replace function public.is_tenant_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = target and m.user_id = (select auth.uid())
  );
$$;

create policy "members read their tenants" on public.tenants
  for select to authenticated using (public.is_tenant_member(id));
create policy "members read memberships" on public.tenant_members
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "members read statuses" on public.message_statuses
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- No policies for whatsapp_accounts, webhook_events or contact_requests: only the backend reads them.
revoke all on public.whatsapp_accounts, public.webhook_events, public.contact_requests
  from anon, authenticated;

create table if not exists public.casting_integration_events (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null,
  event_key text not null unique,
  event_type text not null,
  event_version integer not null default 1 check (event_version > 0),
  source_system text not null check (source_system = 'casting-attual-360'),
  target_system text not null check (target_system = 'attual-one'),
  organization_external_id text,
  project_external_id text,
  talent_id uuid,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed')),
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists casting_integration_events_type_idx
  on public.casting_integration_events (event_type, occurred_at desc);

create index if not exists casting_integration_events_status_idx
  on public.casting_integration_events (processing_status, received_at asc);

alter table public.casting_integration_events enable row level security;

revoke all privileges on table public.casting_integration_events from anon, authenticated;
grant select, insert, update, delete on table public.casting_integration_events to service_role;

comment on table public.casting_integration_events is
  'Inbox idempotente de eventos recebidos do Casting Attual 360. Escrita restrita ao backend via service role.';

create table if not exists public.casting_invitation_projections (
  invitation_id text primary key,
  production_id text not null,
  casting_call_id text not null,
  shortlist_id text not null,
  talent_id text not null,
  state text not null check (state in ('prepared', 'linked', 'sent', 'accepted', 'declined')),
  prepared_at timestamptz,
  telegram_linked_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  response_status text not null default 'pending'
    check (response_status in ('pending', 'accepted', 'declined')),
  last_event_key text not null,
  last_event_type text not null,
  final_state_conflict boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists casting_invitation_projections_state_idx
  on public.casting_invitation_projections (state, updated_at desc);

alter table public.casting_invitation_projections enable row level security;

revoke all privileges on table public.casting_invitation_projections from public, anon, authenticated;
grant select, insert, update, delete on table public.casting_invitation_projections to service_role;

alter table public.casting_integration_events
  add column if not exists payload_hash text,
  add column if not exists state_conflict boolean not null default false;

revoke all privileges on table public.casting_integration_events from public, anon, authenticated;
grant select, insert, update, delete on table public.casting_integration_events to service_role;

comment on table public.casting_invitation_projections is
  'Projecao operacional idempotente dos convites recebidos do Casting Attual 360.';

create table if not exists public.matrix_signal_inbox (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  matrix_person_id uuid not null,
  topic_key text not null,
  score numeric(10,4) not null check (score >= 0),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  signal_count integer not null check (signal_count > 0),
  policy_version text not null,
  purpose text not null default 'personalization' check (purpose = 'personalization'),
  marketing_allowed boolean not null default false check (marketing_allowed = false),
  external_action_allowed boolean not null default false check (external_action_allowed = false),
  source_system text not null default 'matrix-attual' check (source_system = 'matrix-attual'),
  target_system text not null default 'attual-one' check (target_system = 'attual-one'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  processing_status text not null default 'unlinked'
    check (processing_status in ('received','unlinked','linked','suppressed','failed')),
  linked_customer_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matrix_signal_inbox_person_idx
  on public.matrix_signal_inbox (matrix_person_id, received_at desc);

create index if not exists matrix_signal_inbox_status_idx
  on public.matrix_signal_inbox (processing_status, received_at asc);

alter table public.matrix_signal_inbox enable row level security;
revoke all privileges on table public.matrix_signal_inbox from anon, authenticated;
grant select, insert, update on table public.matrix_signal_inbox to service_role;

comment on table public.matrix_signal_inbox is
  'Inbox governado para sinais qualificados da Matrix. Aceita apenas Matrix person_id identificado, sem PII, marketing ou ação externa. O vínculo com cliente do ATTUAL ONE deve ser explícito e auditável.';

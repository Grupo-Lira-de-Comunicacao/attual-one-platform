-- ATTUAL ONE
-- M4 explicit Matrix person/account linking and audit evidence.

create table if not exists public.matrix_person_links (
  id uuid primary key default gen_random_uuid(),
  matrix_person_id uuid not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null unique references public.store_customer_accounts(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','linked','revoked','suppressed','failed')),
  source text not null default 'explicit_user_bridge' check (source = 'explicit_user_bridge'),
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  last_correlation_id uuid
);

create index if not exists matrix_person_links_status_idx
  on public.matrix_person_links (status, updated_at desc);

create index if not exists matrix_person_links_customer_idx
  on public.matrix_person_links (customer_id)
  where customer_id is not null;

create table if not exists public.matrix_person_link_audit (
  id uuid primary key default gen_random_uuid(),
  matrix_person_id uuid not null,
  store_account_id uuid not null,
  action text not null check (action in ('bridge_requested','linked','revoked','suppressed','failed')),
  actor_type text not null check (actor_type in ('user','matrix','system')),
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists matrix_person_link_audit_person_idx
  on public.matrix_person_link_audit (matrix_person_id, created_at desc);

alter table public.matrix_person_links enable row level security;
alter table public.matrix_person_link_audit enable row level security;

revoke all on public.matrix_person_links from public, anon, authenticated;
revoke all on public.matrix_person_link_audit from public, anon, authenticated;

grant select, insert, update on public.matrix_person_links to service_role;
grant select, insert on public.matrix_person_link_audit to service_role;

comment on table public.matrix_person_links is
  'Vínculo explícito e auditável entre Matrix person_id e conta/cliente do ATTUAL ONE. Não contém consentimento de marketing.';

comment on table public.matrix_person_link_audit is
  'Evidência de link/unlink M4. Nenhuma ação comercial é executada por esta tabela.';

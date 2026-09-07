create table if not exists public.matrix_person_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.store_customer_accounts(id) on delete cascade,
  matrix_person_id uuid not null,
  link_status text not null default 'pending' check (link_status in ('pending','linked','revoked')),
  correlation_id uuid,
  linked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, matrix_person_id)
);

create unique index if not exists matrix_person_links_active_account_idx
  on public.matrix_person_links (account_id)
  where link_status in ('pending','linked');

create unique index if not exists matrix_person_links_active_person_idx
  on public.matrix_person_links (matrix_person_id)
  where link_status in ('pending','linked');

alter table public.matrix_person_links enable row level security;
revoke all privileges on table public.matrix_person_links from anon, authenticated;
grant select, insert, update on table public.matrix_person_links to service_role;

comment on table public.matrix_person_links is
  'Vinculo explicito e auditavel entre conta autenticada do ATTUAL ONE e Matrix person_id. Sem PII e sem marketing.';

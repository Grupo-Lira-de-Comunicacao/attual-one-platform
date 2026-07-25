begin;
set local check_function_bodies = off;

-- Painel Mestre: administração global da plataforma, separada dos papéis por empresa
-- (company_role continua exclusivamente escopado a uma empresa via company_users).
create table public.platform_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- Cada usuário só enxerga a própria linha (nunca a lista de outros admins, evita enumeração).
-- Não existe nenhuma policy de insert/update/delete: conceder platform admin só é possível
-- manualmente via SQL Editor com a role de owner do projeto — nunca pelo app. Isso é a
-- proteção contra auto-promoção: nenhum usuário, nem mesmo um platform admin, consegue
-- se promover ou promover outros através de qualquer rota do produto.
create policy platform_admins_self_read on public.platform_admins for select to authenticated using (id = auth.uid());

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from platform_admins where id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Leitura global para o platform admin. A escrita NUNCA acontece por policy de insert/update
-- em companies ou company_users — só pelas RPCs abaixo, que validam tudo internamente.
create policy companies_platform_admin_read on public.companies for select to authenticated using (public.is_platform_admin());
create policy company_users_platform_admin_read on public.company_users for select to authenticated using (public.is_platform_admin());

create function public.platform_create_company(p_name text, p_slug text, p_owner_user_id uuid) returns public.companies
language plpgsql security definer set search_path = public as $$
declare result companies;
begin
  if not is_platform_admin() then raise exception 'apenas administradores da plataforma podem criar empresas'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'nome da empresa é obrigatório'; end if;
  if length(trim(coalesce(p_slug,''))) = 0 then raise exception 'slug da empresa é obrigatório'; end if;
  if not exists(select 1 from profiles where id = p_owner_user_id) then raise exception 'usuário proprietário não encontrado'; end if;
  if exists(select 1 from companies where slug = trim(p_slug)) then raise exception 'slug já está em uso'; end if;
  insert into companies(name, slug) values (trim(p_name), trim(p_slug)) returning * into result;
  insert into company_users(company_id, user_id, role, status, created_by) values (result.id, p_owner_user_id, 'owner', 'active', auth.uid());
  insert into audit_logs(company_id, user_id, action, entity, entity_id, essentials)
    values (result.id, auth.uid(), 'insert', 'companies', result.id, jsonb_build_object('name', result.name, 'slug', result.slug, 'owner_user_id', p_owner_user_id, 'via', 'platform_admin'));
  return result;
end $$;
revoke all on function public.platform_create_company(text,text,uuid) from public;
grant execute on function public.platform_create_company(text,text,uuid) to authenticated;

create function public.platform_link_owner(p_company_id uuid, p_user_id uuid) returns public.company_users
language plpgsql security definer set search_path = public as $$
declare result company_users;
begin
  if not is_platform_admin() then raise exception 'apenas administradores da plataforma podem vincular proprietários'; end if;
  if not exists(select 1 from companies where id = p_company_id) then raise exception 'empresa não encontrada'; end if;
  if not exists(select 1 from profiles where id = p_user_id) then raise exception 'usuário não encontrado'; end if;
  insert into company_users(company_id, user_id, role, status, created_by) values (p_company_id, p_user_id, 'owner', 'active', auth.uid())
    on conflict (company_id, user_id) do update set role = 'owner', status = 'active'
    returning * into result;
  insert into audit_logs(company_id, user_id, action, entity, entity_id, essentials)
    values (p_company_id, auth.uid(), 'update', 'company_users', result.id, jsonb_build_object('linked_user_id', p_user_id, 'role', 'owner', 'via', 'platform_admin'));
  return result;
end $$;
revoke all on function public.platform_link_owner(uuid,uuid) from public;
grant execute on function public.platform_link_owner(uuid,uuid) to authenticated;

-- Busca estreita por e-mail exato, só para platform admin: necessária porque `profiles` não
-- guarda e-mail e o client nunca tem acesso direto a `auth.users`. A função roda como
-- security definer e só devolve dados quando quem chama já passou por is_platform_admin().
create function public.platform_find_user_by_email(p_email text) returns table(user_id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'apenas administradores da plataforma podem buscar usuários'; end if;
  return query select u.id, p.full_name, u.email::text from auth.users u left join profiles p on p.id = u.id where u.email = p_email;
end $$;
revoke all on function public.platform_find_user_by_email(text) from public;
grant execute on function public.platform_find_user_by_email(text) to authenticated;

commit;

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/202607250001_attual_one_platform_admin.sql", import.meta.url);
const raw = await readFile(migrationUrl, "utf8");
const sql = raw.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

test("cria platform_admins com RLS e sem nenhuma policy de escrita (proteção contra auto-promoção)", () => {
  assert.match(sql, /create table public\.platform_admins/);
  assert.match(sql, /alter table public\.platform_admins enable row level security/);
  assert.match(sql, /create policy platform_admins_self_read on public\.platform_admins for select to authenticated using \(id = auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /platform_admins for (insert|update|delete|all)/);
});

test("is_platform_admin é security definer, stable, com search_path seguro e sem grant a anon", () => {
  assert.match(sql, /create function public\.is_platform_admin\(\) returns boolean\s*\nlanguage sql stable security definer set search_path = public/);
  assert.match(sql, /revoke all on function public\.is_platform_admin\(\) from public/);
  assert.match(sql, /grant execute on function public\.is_platform_admin\(\) to authenticated/);
  assert.doesNotMatch(sql, /is_platform_admin\(\).*to authenticated,\s*anon/);
});

test("leitura global de companies e company_users só via policy de select (nunca insert/update/delete direto)", () => {
  assert.match(sql, /create policy companies_platform_admin_read on public\.companies for select to authenticated using \(public\.is_platform_admin\(\)\)/);
  assert.match(sql, /create policy company_users_platform_admin_read on public\.company_users for select to authenticated using \(public\.is_platform_admin\(\)\)/);
  assert.doesNotMatch(sql, /companies_platform_admin.*for (insert|update|delete|all)/);
  assert.doesNotMatch(sql, /company_users_platform_admin.*for (insert|update|delete|all)/);
});

test("platform_create_company valida permissão, nome, slug, proprietário existente e slug duplicado", () => {
  const idx = sql.indexOf("create function public.platform_create_company");
  assert.ok(idx >= 0);
  const body = sql.slice(idx, sql.indexOf("$$;", idx));
  assert.match(body, /language plpgsql security definer set search_path = public/);
  assert.match(body, /if not is_platform_admin\(\) then raise exception/);
  assert.match(body, /if length\(trim\(coalesce\(p_name,''\)\)\) = 0 then raise exception/);
  assert.match(body, /if length\(trim\(coalesce\(p_slug,''\)\)\) = 0 then raise exception/);
  assert.match(body, /if not exists\(select 1 from profiles where id = p_owner_user_id\) then raise exception/);
  assert.match(body, /if exists\(select 1 from companies where slug = trim\(p_slug\)\) then raise exception/);
  assert.match(body, /insert into company_users\(company_id, user_id, role, status, created_by\) values \(result\.id, p_owner_user_id, 'owner', 'active', auth\.uid\(\)\)/);
  assert.match(body, /insert into audit_logs/);
});

test("platform_link_owner valida permissão, empresa e usuário existentes, e é idempotente em vínculo já existente", () => {
  const idx = sql.indexOf("create function public.platform_link_owner");
  assert.ok(idx >= 0);
  const body = sql.slice(idx, sql.indexOf("$$;", idx));
  assert.match(body, /language plpgsql security definer set search_path = public/);
  assert.match(body, /if not is_platform_admin\(\) then raise exception/);
  assert.match(body, /if not exists\(select 1 from companies where id = p_company_id\) then raise exception/);
  assert.match(body, /if not exists\(select 1 from profiles where id = p_user_id\) then raise exception/);
  assert.match(body, /on conflict \(company_id, user_id\) do update set role = 'owner', status = 'active'/);
});

test("platform_find_user_by_email exige is_platform_admin antes de ler auth.users", () => {
  const idx = sql.indexOf("create function public.platform_find_user_by_email");
  assert.ok(idx >= 0);
  const body = sql.slice(idx, sql.indexOf("$$;", idx));
  assert.match(body, /language plpgsql stable security definer set search_path = public/);
  assert.match(body, /if not is_platform_admin\(\) then raise exception/);
  assert.match(body, /from auth\.users u left join profiles p on p\.id = u\.id where u\.email = p_email/);
});

test("todas as funções platform_* têm permissões mínimas: revoke de public e grant só para authenticated", () => {
  for (const fn of [
    "platform_create_company(text,text,uuid)",
    "platform_link_owner(uuid,uuid)",
    "platform_find_user_by_email(text)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, "\\$&")} from public`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, "\\$&")} to authenticated`));
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, "\\$&")} to authenticated,\\s*anon`));
  }
});

test("nenhuma migration existente foi alterada: RPCs de pedidos/pagamentos/estoque permanecem intactas neste arquivo", () => {
  for (const rpc of ["confirm_order", "cancel_order", "create_order", "update_order", "adjust_stock", "register_payment_leg", "refund_payment_leg", "apply_order_coupon", "redeem_loyalty_reward", "complete_order"]) {
    assert.doesNotMatch(sql, new RegExp(`create (or replace )?function public\\.${rpc}\\b`));
  }
});

begin;

-- Avoid per-row auth.uid() re-evaluation in the few policies that reference it directly.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (public.is_company_member(company_id) and user_id = (select auth.uid()));

drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read on public.platform_admins for select to authenticated
  using (id = (select auth.uid()));

-- Cover foreign keys used by joins/deletes. These are intentionally additive;
-- existing business indexes are preserved.
create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
create index if not exists categories_created_by_idx on public.categories(created_by);
create index if not exists categories_updated_by_idx on public.categories(updated_by);
create index if not exists company_users_created_by_idx on public.company_users(created_by);
create index if not exists company_users_user_id_idx on public.company_users(user_id);
create index if not exists coupon_usages_company_id_idx on public.coupon_usages(company_id);
create index if not exists coupon_usages_customer_id_idx on public.coupon_usages(customer_id);
create index if not exists coupon_usages_order_id_idx on public.coupon_usages(order_id);
create index if not exists customers_created_by_idx on public.customers(created_by);
create index if not exists customers_updated_by_idx on public.customers(updated_by);
create index if not exists import_jobs_created_by_idx on public.import_jobs(created_by);
create index if not exists loyalty_accounts_customer_id_idx on public.loyalty_accounts(customer_id);
create index if not exists loyalty_transactions_account_id_idx on public.loyalty_transactions(account_id);
create index if not exists loyalty_transactions_created_by_idx on public.loyalty_transactions(created_by);
create index if not exists loyalty_transactions_order_id_idx on public.loyalty_transactions(order_id);
create index if not exists order_items_company_id_idx on public.order_items(company_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists orders_created_by_idx on public.orders(created_by);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_updated_by_idx on public.orders(updated_by);
create index if not exists payment_refunds_created_by_idx on public.payment_refunds(created_by);
create index if not exists payment_refunds_order_id_idx on public.payment_refunds(order_id);
create index if not exists payments_created_by_idx on public.payments(created_by);
create index if not exists payments_order_id_idx on public.payments(order_id);
create index if not exists payments_updated_by_idx on public.payments(updated_by);
create index if not exists product_options_company_id_idx on public.product_options(company_id);
create index if not exists product_options_product_id_idx on public.product_options(product_id);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_created_by_idx on public.products(created_by);
create index if not exists products_updated_by_idx on public.products(updated_by);
create index if not exists stock_movements_created_by_idx on public.stock_movements(created_by);
create index if not exists stock_movements_product_id_idx on public.stock_movements(product_id);

commit;

// Local only. Install @electric-sql/pglite separately without changing the production lockfile.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table public.companies(id uuid primary key);
create table public.store_customer_accounts(id uuid primary key);
create table public.customers(id uuid primary key);`);
  for (const path of [
    'supabase/migrations/202609070001_matrix_signal_inbox.sql',
    'supabase/migrations/202609070002_matrix_person_links.sql',
    'supabase/migrations/20261125221000_matrix_atomic_link_receipts.sql',
    'tests/sql/m4_atomic_link_receipts.sql',
  ]) {
    await db.exec(await readFile(new URL('../../' + path, import.meta.url), 'utf8'));
    process.stdout.write('PASS ' + path + '\n');
  }
  console.log(await db.query('select count(*)::int as remaining_test_links from public.matrix_person_links'));
} finally { await db.close(); }

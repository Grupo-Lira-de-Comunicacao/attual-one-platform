import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const signalRoute = fs.readFileSync("app/api/integrations/matrix/signals/route.ts", "utf8");
const linkCallback = fs.readFileSync("app/api/integrations/matrix/links/route.ts", "utf8");
const userBridge = fs.readFileSync("app/api/storefront/[slug]/account/matrix-link/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/202609070002_matrix_person_links.sql", "utf8");

test("M4 signal inbox remains non-marketing and requires explicit person link", () => {
  assert.match(signalRoute, /marketing_allowed:\s*false/);
  assert.match(signalRoute, /external_action_allowed:\s*false/);
  assert.match(signalRoute, /matrix_person_links/);
  assert.match(signalRoute, /processingStatus/);
  assert.doesNotMatch(signalRoute, /sendEmail|sendWhatsapp|campaign/i);
});

test("M4 account bridge sends only opaque account reference to Matrix", () => {
  assert.match(userBridge, /external_account_ref:\s*ctx\.account\.id/);
  assert.match(userBridge, /pii_sent_to_matrix:\s*false/);
  assert.doesNotMatch(userBridge, /external_account_ref:\s*ctx\.user\.email/);
  assert.match(userBridge, /explicit_user_bridge/);
});

test("M4 link callback can revoke and suppress pending signals", () => {
  assert.match(linkCallback, /link_status:\s*"linked"\s*\|\s*"revoked"/);
  assert.match(linkCallback, /processing_status:\s*"suppressed"/);
  assert.match(linkCallback, /marketing_enabled:\s*false/);
  assert.match(linkCallback, /external_action_enabled:\s*false/);
});

test("M4 link tables are private from browser roles", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.matrix_person_links from public, anon, authenticated/);
  assert.match(migration, /revoke all on public\.matrix_person_link_audit from public, anon, authenticated/);
});

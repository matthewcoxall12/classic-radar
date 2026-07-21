import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("launch-visible member planners no longer execute the D1 compatibility adapter", async () => {
  const routes = await Promise.all([
    "app/api/member/alerts/route.ts",
    "app/api/member/roadbooks/route.ts",
    "app/api/member/roadbooks/events/route.ts",
    "app/api/member/trial/route.ts",
    "app/api/calendar/[token]/route.ts",
  ].map(read));

  for (const route of routes) {
    assert.doesNotMatch(route, /ensureDatabase|\.prepare\(|\bdb\./);
    assert.match(route, /supabase|createSupabaseServerClient/);
  }
});

test("trial and calendar RPCs are token-bound, entitlement-aware and explicitly granted", async () => {
  const baseMigration = await read("supabase/migrations/20260721195036_member_trial_calendar_entitlements.sql");
  const migration = await read("supabase/migrations/20260721213000_service_only_member_capabilities.sql");
  assert.match(migration, /create or replace function public\.start_managed_roadbook_trial\(p_user_id uuid\)/i);
  assert.match(migration, /private\.roadbook_trial_claims/i);
  assert.match(migration, /extensions\.digest\(i\.provider \|\| ':' \|\| i\.provider_id/i);
  assert.match(migration, /create or replace function public\.get_managed_calendar_feed\(p_calendar_token uuid\)/i);
  assert.match(migration, /p\.calendar_token = p_calendar_token/i);
  assert.match(migration, /grant execute on function public\.get_managed_calendar_feed\(uuid\) to service_role/i);
  assert.match(migration, /drop function public\.get_calendar_feed\(uuid\)/i);
  assert.match(migration, /subscription_expires_at > pg_catalog\.now\(\)/i);
  assert.match(baseMigration, /calendar_token uuid not null default gen_random_uuid\(\)/i);
});

test("shared roadbooks use the public token RPC without a server secret", async () => {
  const page = await read("app/roadbook/[token]/page.tsx");
  assert.match(page, /rpc\("get_shared_roadbook"/);
  assert.doesNotMatch(page, /createSupabaseAdminClient|SUPABASE_SECRET_KEY/);
});

test("Stripe stays fail-closed until its Supabase ledger migration exists", async () => {
  const billing = await read("lib/stripe-billing.ts");
  assert.match(billing, /const SUPABASE_BILLING_STORAGE_READY = false/);
  assert.match(billing, /missing\.push\("Supabase billing storage migration"\)/);
});

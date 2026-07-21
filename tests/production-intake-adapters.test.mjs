import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read(
  "supabase/migrations/20260721193808_production_intake_and_geocode.sql",
);

test("public intake routes use the server-only Supabase boundary", () => {
  for (const path of [
    "app/api/submissions/route.ts",
    "app/api/partners/route.ts",
    "app/api/privacy-requests/route.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /ensureDatabase/);
    assert.match(source, /createSupabaseAdminClient/);
    assert.match(source, /verifyTurnstileToken/);
    assert.ok(
      source.indexOf("verifyTurnstileToken") < source.indexOf('.from("'),
      `${path} must verify Turnstile before writing to Supabase`,
    );
  }
});

test("geocoding uses a private cache and an atomic global lease", () => {
  const source = read("app/api/geocode/route.ts");
  assert.doesNotMatch(source, /ensureDatabase/);
  assert.match(source, /\.from\("geocode_cache"\)/);
  assert.match(source, /\.rpc\(\s*"claim_geocode_lease"/);
  assert.match(migration, /create table if not exists private\.geocode_leases/);
  assert.match(
    migration,
    /grant execute on function public\.claim_geocode_lease\(bigint, integer\)\s+to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.claim_geocode_lease\(bigint, integer\)\s+to (?:anon|authenticated)/,
  );
});

test("backend-only intake tables are RLS protected from browser roles", () => {
  for (const table of [
    "event_submissions",
    "partner_enquiries",
    "privacy_requests",
    "geocode_cache",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant select, insert, update, delete on table public\\.${table} to service_role`,
      ),
    );
  }
});

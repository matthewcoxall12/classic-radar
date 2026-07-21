import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (path) => readFile(new URL(path, root), "utf8");

test("production discovery admin routes use Supabase rather than the throwing D1 adapter", async () => {
  const paths = [
    "app/api/admin/queue/route.ts",
    "app/api/admin/discovery/publish/route.ts",
    "app/api/admin/discovery/withdraw/route.ts",
    "app/api/admin/discovery/source/route.ts",
  ];
  for (const path of paths) {
    const source = await text(path);
    assert.match(source, /createSupabaseAdminClient/);
    assert.doesNotMatch(source, /ensureDatabase|event_candidates|motoring_events/);
  }
});

test("the review queue preserves approval and source gates before publication", async () => {
  const queue = await text("app/api/admin/queue/route.ts");
  const publish = await text("app/api/admin/discovery/publish/route.ts");
  assert.match(queue, /status === "approved" && !source\.is_active/);
  assert.match(queue, /\.from\("review_queue"\)/);
  assert.match(queue, /\.from\("events"\)/);
  assert.match(publish, /review\.status !== "approved"/);
  assert.match(publish, /publication\.ready/);
  assert.match(publish, /!source\?\.is_active/);
  assert.match(publish, /safe rollback failed/);
  assert.doesNotMatch(publish, /is_verified:\s*true/);
});

test("withdrawal hides the public event before returning it to review", async () => {
  const source = await text("app/api/admin/discovery/withdraw/route.ts");
  const eventUpdate = source.indexOf('.from("events")');
  const queueUpdate = source.lastIndexOf('.from("review_queue")');
  assert.ok(eventUpdate >= 0 && queueUpdate > eventUpdate);
  assert.match(source, /status: "review"/);
  assert.match(source, /status: "pending"/);
  assert.match(source, /reason\.length < 10/);
});

test("source suspension also hides linked public events", async () => {
  const source = await text("app/api/admin/discovery/source/route.ts");
  assert.match(source, /if \(!nextActive\)/);
  assert.match(source, /\.eq\("status", "published"\)/);
  assert.match(source, /linkedPublicEventsAffected/);
  assert.match(source, /trustLevel !== "unverified"/);
});

test("scheduled source selection respects cadence and failure backoff", async () => {
  const source = await text("supabase/functions/ingest-events/index.ts");
  assert.match(source, /function sourceDue/);
  assert.match(source, /six_hourly: 6/);
  assert.match(source, /HTTP_403\|HTTP_404\|CROSS_ORIGIN_REDIRECT\|getaddrinfo ENOTFOUND/);
  assert.match(source, /event_name.*workflow_dispatch/);
});

test("all six live source-catalogue migrations are represented locally", async () => {
  const paths = [
    "supabase/migrations/20260720114432_classicsgo_expand_event_sources.sql",
    "supabase/migrations/20260720114542_classicsgo_add_tested_event_sources.sql",
    "supabase/migrations/20260720114610_classicsgo_stage_delayed_event_sources.sql",
    "supabase/migrations/20260720171820_expand_event_sources.sql",
    "supabase/migrations/20260720171831_add_tested_event_sources.sql",
    "supabase/migrations/20260720171850_stage_delayed_event_sources.sql",
  ];
  for (const path of paths) await access(new URL(path, root));
});

test("unsupported source onboarding fails closed with an explicit service state", async () => {
  const source = await text("app/api/admin/discovery/endpoint/route.ts");
  assert.match(source, /DISCOVERY_SOURCE_ONBOARDING_PENDING/);
  assert.match(source, /status: 503/);
  assert.doesNotMatch(source, /ensureDatabase/);
});

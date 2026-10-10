import test from "node:test";
import assert from "node:assert/strict";
import { collectSitemapEvents, sitemapEventEntry } from "./sitemap-events.ts";

test("sitemap pagination includes thousands of events beyond discovery/database page caps", async () => {
  const rows = Array.from({ length: 1234 }, (_, index) => ({
    id: String(index).padStart(5, "0"), slug: `event-${index}`, updated_at: null,
  }));
  const events = await collectSitemapEvents(async (afterId, limit) =>
    rows.filter((row) => !afterId || row.id > afterId).slice(0, Math.min(75, limit)),
  );
  assert.deepEqual(events, rows);
});

test("sitemap fails on query/pagination errors rather than emitting incomplete results", async () => {
  await assert.rejects(collectSitemapEvents(async () => { throw new Error("Database unavailable"); }), /Database unavailable/);
  await assert.rejects(collectSitemapEvents(async () => [{ id: "same", slug: "event", updated_at: null }]), /did not advance/);
});

test("sitemap uses actual update timestamps and omits missing or invalid lastmod", () => {
  const base = new URL("https://classicsgo.com");
  assert.deepEqual(sitemapEventEntry({ id: "a", slug: "classic-meet", updated_at: "2026-10-10T10:00:00Z" }, base), {
    url: "https://classicsgo.com/events/classic-meet", lastModified: new Date("2026-10-10T10:00:00Z"),
  });
  for (const updated_at of [null, "invalid"]) {
    assert.deepEqual(sitemapEventEntry({ id: "b", slug: "old-event", updated_at }, base), { url: "https://classicsgo.com/events/old-event" });
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { consolidateCandidates, uniqueSourceCount } from "./merge.ts";

const source = (url: string) => ({ canonical_url: url, source_url: url });
const candidate = (id: string, key = "same-event") => ({
  event: { id, dedupe_key: key, title: "Classic meet", status: "review", description: "", confidence_score: 60 },
  sources: [source("https://club.example/meet")],
  matched: null
});

test("repeated new discoveries produce one event and one source per canonical URL", () => {
  const first = candidate("new-id-1");
  const second = candidate("new-id-2");
  second.sources.push(source("https://venue.example/meet"));
  second.event.description = "A longer description with venue details.";
  const [merged] = consolidateCandidates([first, second]);
  assert.equal(consolidateCandidates([first, second]).length, 1);
  assert.equal(merged.event.id, "new-id-1");
  assert.equal(merged.event.status, "review");
  assert.equal(merged.event.description, second.event.description);
  assert.equal(merged.sources.length, 2);
  assert.equal(uniqueSourceCount([], merged.sources.map((item) => item.canonical_url)), 2);
  assert.equal(first.sources.length, 1);
});

test("repeated matches retain publication and curated fields", () => {
  const first = candidate("existing-id");
  first.event.status = "published";
  first.event.title = "Curated event title";
  first.event.confidence_score = 95;
  const [merged] = consolidateCandidates([first, candidate("existing-id")]);
  assert.equal(merged.event.id, "existing-id");
  assert.equal(merged.event.status, "published");
  assert.equal(merged.event.title, "Curated event title");
  assert.equal(merged.event.confidence_score, 95);
});

test("different dates or places retain separate dedupe keys", () => {
  assert.equal(consolidateCandidates([candidate("one", "date-one"), candidate("two", "date-two")]).length, 2);
});

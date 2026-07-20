import assert from "node:assert/strict";
import test from "node:test";

import { eventSearchTerms, eventTextMatches, resolveEventSearch } from "./event-search.ts";

test("an untouched event page waits for search input", () => {
  assert.deepEqual(resolveEventSearch({}), {
    submitted: false,
    localSearch: false,
    radius: "50",
    effectiveRadius: "50",
    usedUkFallback: false
  });
});

test("a keyword-only quick search falls back to UK-wide results", () => {
  assert.deepEqual(resolveEventSearch({ q: "German", location: "", lat: "", lng: "", radius: "50", date: "30" }), {
    submitted: true,
    localSearch: false,
    radius: "50",
    effectiveRadius: "uk",
    usedUkFallback: true
  });
});

test("date and category filters work without a location", () => {
  const plan = resolveEventSearch({ date: "all", types: ["Autojumble"] });
  assert.equal(plan.submitted, true);
  assert.equal(plan.effectiveRadius, "uk");
  assert.equal(plan.usedUkFallback, true);
});

test("an explicit country-wide scope is retained", () => {
  assert.equal(resolveEventSearch({ radius: "europe" }).effectiveRadius, "europe");
  assert.equal(resolveEventSearch({ radius: "uk" }).usedUkFallback, false);
});

test("country-wide scope wins over a stale location field", () => {
  const plan = resolveEventSearch({ location: "London", radius: "uk" });
  assert.equal(plan.localSearch, false);
  assert.equal(plan.effectiveRadius, "uk");
});

test("a local search retains its mileage radius", () => {
  const town = resolveEventSearch({ location: "Gaydon", radius: "25" });
  const coordinates = resolveEventSearch({ lat: "52.19", lng: "-1.48", radius: "10" });
  assert.equal(town.localSearch, true);
  assert.equal(town.effectiveRadius, "25");
  assert.equal(coordinates.localSearch, true);
  assert.equal(coordinates.effectiveRadius, "10");
});

test("keyword matching normalises punctuation and supports multiple terms", () => {
  assert.deepEqual(eventSearchTerms(" Cars & Coffee!  German cars "), ["cars", "coffee", "german"]);
  assert.equal(eventTextMatches(["German Cars & Coffee", "Gaydon"], ["german", "coffee"]), true);
  assert.equal(eventTextMatches(["German Cars & Coffee", "Gaydon"], ["porsche", "coffee"]), false);
});

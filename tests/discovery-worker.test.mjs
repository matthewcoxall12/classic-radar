import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  eventCategory,
  eventLinks,
  extractCandidatesFromHtml,
  extractDate,
} from "../scripts/discover-events.mjs";

const nextYear = new Date().getUTCFullYear() + 1;

test("extractDate accepts real future UK and European dates", () => {
  assert.equal(extractDate(nextYear + "-08-09T09:30:00+01:00"), nextYear + "-08-09");
  assert.equal(extractDate("9 August " + nextYear), nextYear + "-08-09");
  assert.equal(extractDate("9 août " + nextYear), nextYear + "-08-09");
  assert.equal(extractDate("31/02/" + nextYear), null);
});

test("eventLinks remains on the registered source origin", () => {
  const html = [
    '<a href="/events/classic-rally">Classic rally</a>',
    '<a href="https://evil.example/events/classic-show">Classic show</a>',
    '<a href="/privacy">Classic privacy</a>',
  ].join("");
  assert.deepEqual(
    eventLinks(html, "https://official.example/events", 5),
    ["https://official.example/events/classic-rally"],
  );
});

test("event categories use the exact public filter taxonomy", () => {
  const examples = new Map([
    ["Summer Classic Car Show", "Classic car show"],
    ["Sunday Cars & Coffee", "Cars & coffee"],
    ["Local Club Meet", "Club meet"],
    ["Spring Autojumble", "Autojumble"],
    ["Cotswolds Classic Rally", "Rally / road run"],
    ["Goodwood Festival of Speed", "Motorsport"],
    ["Motor Museum Open Day", "Museum / venue event"],
    ["American Hot Rod Gathering", "American / hot rod"],
    ["Pre-War Vintage Weekend", "Vintage / pre-war"],
    ["Porsche Anniversary Show", "Marque-specific"],
  ]);
  for (const [title, expected] of examples) {
    assert.equal(eventCategory(title), expected, title);
  }
});

test("Schema.org Event extraction produces review-only provenance", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Heritage Vehicle Festival",
        "startDate": "${nextYear}-08-09T09:30:00+01:00",
        "endDate": "${nextYear}-08-10T16:00:00+01:00",
        "url": "https://official.example/events/heritage-festival",
        "description": "A public historic vehicle festival.",
        "location": {
          "@type": "Place",
          "name": "Heritage Park",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "1 Motor Way",
            "addressLocality": "Sampletown",
            "postalCode": "SO45 3HW",
            "addressCountry": "GB"
          }
        }
      }
    </script>`;
  const candidates = extractCandidatesFromHtml(
    html,
    "https://official.example/events/heritage-festival",
    {
      key: "official-example",
      name: "Official Example",
      url: "https://official.example/events",
      sourceType: "organiser",
      countryCode: "GB",
      region: "Hampshire",
    },
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].startDate, nextYear + "-08-09");
  assert.equal(candidates[0].town, "Sampletown");
  assert.equal(candidates[0].sources[0].method, "json-ld");
  assert.equal(candidates[0].sources[0].requiresReview, true);
});

test("unstructured detail pages stay low confidence and review-only", () => {
  const html = `
    <html><head>
      <meta property="og:title" content="Classic Cars and Coffee">
      <meta property="og:description" content="A local morning meet.">
      <meta property="og:url" content="https://official.example/events/cars-coffee">
    </head><body><h1>Classic Cars and Coffee</h1>
      <p>Join us on 9 August ${nextYear}.</p>
    </body></html>`;
  const [candidate] = extractCandidatesFromHtml(
    html,
    "https://official.example/events/cars-coffee",
    {
      key: "official-example",
      name: "Official Example",
      url: "https://official.example/events",
      sourceType: "organiser",
      countryCode: "GB",
      region: "Hampshire",
    },
  );
  assert.equal(candidate.confidenceScore, 62);
  assert.equal(candidate.sources[0].requiresReview, true);
});

test("ingestion function never auto-publishes a new machine candidate", async () => {
  const source = await readFile(
    new URL("../supabase/functions/ingest-events/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /const status = matched\?\.status === "published" \? "published" : "review"/,
  );
  assert.doesNotMatch(source, /score >= 75[^\n]+\? "published"/);
});

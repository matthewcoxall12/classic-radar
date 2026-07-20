import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { geocodeLocation, hasValidCoordinatePair } from "./geocoding.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("coordinate pairs reject empty, partial and out-of-range query values", () => {
  assert.equal(hasValidCoordinatePair("", ""), false);
  assert.equal(hasValidCoordinatePair("51.5", ""), false);
  assert.equal(hasValidCoordinatePair("91", "0"), false);
  assert.equal(hasValidCoordinatePair("51.501", "-0.142"), true);
  assert.equal(hasValidCoordinatePair("0", "0"), true);
});

test("rejects empty, URL and oversized location input without a network request", async () => {
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    throw new Error("unexpected request");
  }) as typeof fetch;

  assert.equal(await geocodeLocation(" "), null);
  assert.equal(await geocodeLocation("https://example.com/location"), null);
  assert.equal(await geocodeLocation("x".repeat(121)), null);
  assert.equal(requests, 0);
});

test("uses postcodes.io for a complete UK postcode and caches canonical variants", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(
      JSON.stringify({
        status: 200,
        result: {
          postcode: "SW1A 1AA",
          latitude: 51.501009,
          longitude: -0.141588,
          admin_district: "Westminster"
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  assert.deepEqual(await geocodeLocation("sw1a1aa"), {
    latitude: 51.501009,
    longitude: -0.141588,
    label: "SW1A 1AA, Westminster"
  });
  assert.deepEqual(await geocodeLocation("SW1A 1AA"), {
    latitude: 51.501009,
    longitude: -0.141588,
    label: "SW1A 1AA, Westminster"
  });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/api\.postcodes\.io\/postcodes\/SW1A%201AA$/);
});

test("uses an identified, Europe-limited Nominatim request for town searches", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return new Response(
      JSON.stringify([{ lat: "48.8566", lon: "2.3522", display_name: "Paris, Île-de-France, France" }]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  assert.deepEqual(await geocodeLocation("Paris, France"), {
    latitude: 48.8566,
    longitude: 2.3522,
    label: "Paris, Île-de-France, France"
  });

  const url = new URL(requestUrl);
  assert.equal(url.origin, "https://nominatim.openstreetmap.org");
  assert.equal(url.searchParams.get("q"), "Paris, France");
  assert.match(url.searchParams.get("countrycodes") ?? "", /(?:^|,)gb(?:,|$)/);
  assert.match(url.searchParams.get("countrycodes") ?? "", /(?:^|,)fr(?:,|$)/);
  assert.equal(url.searchParams.get("email"), "support@classicsgo.com");
  assert.match(requestHeaders?.get("User-Agent") ?? "", /ClassicsGo/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { resolveSupabasePublicConfig } from "./config.ts";

const productionUrl = "https://rnayhhsurmztrohtftqo.supabase.co";
const productionKey = "sb_publishable_x1iw7qogdYGSAO9Brsv9gg_dfKVL9mc";

test("uses the known ClassicsGo Supabase pair", () => {
  assert.deepEqual(resolveSupabasePublicConfig(productionUrl, productionKey), {
    url: productionUrl,
    publishableKey: productionKey
  });
});

test("falls back when Vercel contains stale public Supabase values", () => {
  assert.deepEqual(
    resolveSupabasePublicConfig("https://old-project.supabase.co", "old-key"),
    { url: productionUrl, publishableKey: productionKey }
  );
});

test("does not combine a valid project URL with a mismatched key", () => {
  assert.deepEqual(resolveSupabasePublicConfig(productionUrl, "stale-key"), {
    url: productionUrl,
    publishableKey: productionKey
  });
});

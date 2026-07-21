import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (path) => readFileSync(new URL(path, root), "utf8");

test("Node and pull-request verification are reproducible", () => {
  const packageJson = JSON.parse(text("package.json"));
  const workflow = text(".github/workflows/ci.yml");
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal(text(".node-version").trim(), "24.14.0");
  assert.equal(text(".nvmrc").trim(), "24.14.0");
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.match(workflow, /npm audit --audit-level=moderate/);
  assert.match(workflow, /npm test/);
});

test("production health and scheduled smoke monitoring cover core dependencies", () => {
  const health = text("app/api/health/route.ts");
  const monitor = text(".github/workflows/uptime-monitor.yml");
  assert.match(health, /AUTH_HASH_PEPPER/);
  assert.match(health, /\.from\("events"\)/);
  assert.match(health, /status: "unavailable".*503/s);
  assert.match(monitor, /\/api\/health/);
  assert.match(monitor, /\/sign-in/);
  assert.match(monitor, /\/api\/events\?limit=1/);
});

test("operations documentation describes only the current hosting stack", () => {
  const operations = [
    "README.md",
    "docs/AUTH_SETUP.md",
    "docs/BILLING_SETUP.md",
    "docs/DISCOVERY_ARCHITECTURE.md",
    "docs/DISCOVERY_INGEST.md",
    "docs/MONITORING_RUNBOOK.md",
    "docs/PRODUCTION_LAUNCH.md",
    "docs/UPGRADE_FILE_DIFF.md",
  ].map(text).join("\n");
  assert.doesNotMatch(
    operations,
    /Cloudflare (?:Worker|D1)|Sites runtime|GPT Sites|vinext|wrangler|chatgpt\.site/i,
  );
  assert.match(operations, /Vercel/);
  assert.match(operations, /Supabase/);
  assert.match(operations, /GitHub (?:Actions|OIDC)/);
});

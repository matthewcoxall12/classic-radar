import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const text = (path) => read(path).toString("utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const presentationFiles = [
  "app/account-deleted/page.tsx",
  "app/account/page.tsx",
  "app/admin/page.tsx",
  "app/check-email/page.tsx",
  "app/clubs/page.tsx",
  "app/events/[id]/event-detail.module.css",
  "app/events/[id]/page.tsx",
  "app/forgot-password/page.tsx",
  "app/globals.css",
  "app/layout.tsx",
  "app/membership/page.tsx",
  "app/page.tsx",
  "app/privacy-request/page.tsx",
  "app/reset-password/page.tsx",
  "app/sign-in/page.tsx",
  "app/sign-up/page.tsx",
  "app/submit-event/page.tsx",
  "app/terms/page.tsx",
  "components/admin-queue.module.css",
  "components/admin-queue.tsx",
  "components/discovery-source-registry.module.css",
  "components/event-finder.tsx",
  "components/member-portal.module.css",
  "components/member-portal.tsx",
  "components/membership-pricing.module.css",
  "components/membership-pricing.tsx",
  "components/partner-form.tsx",
  "components/privacy-request-form.tsx",
  "components/secondary-page-shell.tsx",
  "components/sign-in-panel.tsx",
  "components/submission-form.tsx",
  "components/turnstile-field.tsx",
].sort();

test("the migrated presentation is byte-identical to approved Sites v13", () => {
  const manifest = presentationFiles
    .map((path) => `${sha256(read(path))}  ${path}\n`)
    .join("");
  assert.equal(
    sha256(manifest),
    "4bde835c2f774d3ed4c6f5fa7e4832bc3b40393970b8484cbb03d83a2350915e",
  );
});

test("ClassicsGo purpose and name are explicit for users and Google branding", () => {
  const layout = text("app/layout.tsx");
  const finder = text("components/event-finder.tsx");
  assert.match(layout, /ClassicsGo \| Find classic car events near you/);
  assert.match(layout, /applicationName: APP_NAME/);
  assert.match(layout, /"@type": "WebSite"/);
  assert.match(finder, /Find classic car events/);
  assert.match(finder, /ClassicsGo/);
});

test("the Vercel app uses standard Next.js and Supabase, not Sites runtime shims", () => {
  const packageJson = JSON.parse(text("package.json"));
  assert.equal(packageJson.scripts.build, "next build");
  assert.ok(packageJson.dependencies.next);
  assert.ok(packageJson.dependencies["@supabase/ssr"]);
  assert.equal(packageJson.dependencies.vinext, undefined);
  assert.equal(packageJson.devDependencies?.vite, undefined);
  assert.doesNotMatch(text("lib/runtime-env.ts"), /Ticketmaster|Google Calendar/i);
  assert.doesNotMatch(text("lib/supabase-server.ts"), /SERVICE_ROLE|SECRET_KEY/);
  assert.match(text("lib/supabase-admin.ts"), /import "server-only"/);
});

test("the public catalogue is database-driven and the discovery agent runs six-hourly", () => {
  const events = text("lib/public-events.ts");
  const workflow = text(".github/workflows/discover-events.yml");
  assert.match(events, /\.from\("events"\)/);
  assert.doesNotMatch(events, /sample|demo|fixture/i);
  assert.match(workflow, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /ticketmaster|google.calendar/i);
});

test("production security headers and mutation origin checks are enforced", () => {
  const config = text("next.config.ts");
  const auth = text("lib/app-auth.ts");
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(auth, /origin !== expectedOrigin/);
  assert.match(auth, /CSRF_CHECK_FAILED/);
});

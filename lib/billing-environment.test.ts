import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBillingEnvironment } from "./billing-environment.ts";
const fixture = { BILLING_MODE: "test", VERCEL_ENV: "preview", VERCEL_URL: "classicsgo-qa.vercel.app", BILLING_TEST_USER_ID: "00000000-0000-4000-8000-000000000040" };
test("production cannot be switched to sandbox with environment flags or URLs", () => {
 const config = resolveBillingEnvironment({ ...fixture, VERCEL_ENV: "production" });
 assert.equal(config.live, true); assert.equal(config.valid, false); assert.equal(config.site, "https://classicsgo.com"); assert.equal(config.testUserId, "");
 assert.equal(resolveBillingEnvironment({ VERCEL_ENV: "production" }).valid, true);
 assert.equal(resolveBillingEnvironment({ VERCEL_ENV: "preview", BILLING_MODE: "live" }).valid, false);
 assert.equal(resolveBillingEnvironment({}).valid, false);
});
test("sandbox accepts only an explicit preview/development deployment and dedicated test account", () => {
 const config = resolveBillingEnvironment(fixture);
 assert.equal(config.valid, true); assert.equal(config.live, false); assert.equal(config.site, "https://classicsgo-qa.vercel.app");
 for (const extra of [{ VERCEL_URL: "classicsgo.com" }, { VERCEL_URL: "evil.example" }, { VERCEL_URL: "qa.vercel.app/path" }, { VERCEL_URL: "user@qa.vercel.app" }, { VERCEL_URL: "qa.vercel.app?x=1" }, { BILLING_TEST_USER_ID: "" }, { VERCEL_ENV: "" }]) assert.equal(resolveBillingEnvironment({ ...fixture, ...extra }).valid, false);
 assert.equal(resolveBillingEnvironment({ ...fixture, VERCEL_ENV: "development", BILLING_TEST_SITE_URL: "http://localhost:3000" }).valid, true);
 assert.equal(resolveBillingEnvironment({ ...fixture, VERCEL_ENV: "development", BILLING_TEST_SITE_URL: "https://classicsgo.com" }).valid, false);
});

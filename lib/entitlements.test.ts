import test from "node:test";
import assert from "node:assert/strict";
import { hasRoadbook } from "./entitlements.ts";
const now = Date.parse("2026-10-10T12:00:00Z");
test("free accounts cannot access Roadbook, admins and explicit early access can", () => {
  assert.equal(hasRoadbook(null, now), false);
  assert.equal(hasRoadbook({ tier: "free" }, now), false);
  assert.equal(hasRoadbook({ tier: "roadbook" }, now), true);
  assert.equal(hasRoadbook({ is_admin: true, tier: "free" }, now), true);
});
test("expired, canceled, unpaid and malformed entitlements fail closed", () => {
  for (const subscription_status of ["canceled", "unpaid", "past_due", "incomplete"]) assert.equal(hasRoadbook({ tier: "roadbook", subscription_status }, now), false);
  for (const subscription_expires_at of ["2026-10-10T12:00:00Z", "2026-01-01", "invalid"]) assert.equal(hasRoadbook({ tier: "roadbook", subscription_status: "active", subscription_expires_at }, now), false);
  assert.equal(hasRoadbook({ tier: "roadbook", subscription_status: "trialing" }, now), false);
  assert.equal(hasRoadbook({ tier: "roadbook", subscription_status: "trialing", subscription_expires_at: "2026-10-11T12:00:00Z" }, now), true);
});

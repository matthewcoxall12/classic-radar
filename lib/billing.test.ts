import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { subscriptionFromEvent, subscriptionSnapshot, validateRoadbookPrice, verifyStripeSignature } from "./billing.ts";

const secret = "whsec_unitFixtureOnly";
const timestamp = 1791626400;
const body = '{"id":"evt_fixture","livemode":true}';
const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
const signature = `t=${timestamp},v1=${digest}`;

test("Stripe signatures validate raw bytes, secret, timestamp and rotation without parsing", () => {
  assert.equal(verifyStripeSignature(body, signature, secret, timestamp * 1000), true);
  assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=${"0".repeat(64)},v1=${digest}`, secret, timestamp * 1000), true);
  for (const [payload, header, key, now] of [
    [body + " ", signature, secret, timestamp * 1000], [body, signature, "whsec_wrong", timestamp * 1000],
    [body, signature, secret, (timestamp + 301) * 1000], [body, signature, secret, (timestamp - 301) * 1000],
    [body, `t=${timestamp},t=${timestamp},v1=${digest}`, secret, timestamp * 1000],
    [body, `t=${timestamp},v1=bad`, secret, timestamp * 1000]
  ] as const) assert.equal(verifyStripeSignature(payload, header, key, now), false);
});

const annualPrice = { active: true, livemode: true, type: "recurring", currency: "gbp", unit_amount: 1500, billing_scheme: "per_unit", tax_behavior: "inclusive", recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } };
test("checkout refuses wrong currency, amount, plan interval, inactive or test prices", () => {
  assert.doesNotThrow(() => validateRoadbookPrice(annualPrice, "annual"));
  assert.doesNotThrow(() => validateRoadbookPrice({ ...annualPrice, livemode: false }, "annual", false));
  assert.throws(() => validateRoadbookPrice(annualPrice, "annual", false));
  assert.doesNotThrow(() => validateRoadbookPrice({ ...annualPrice, unit_amount: 200, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } }, "monthly"));
  assert.throws(() => validateRoadbookPrice(annualPrice, "monthly"));
  for (const override of [{ currency: "usd" }, { unit_amount: 120 }, { active: false }, { livemode: false }, { type: "one_time" }, { billing_scheme: "tiered" }, { recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } }]) {
    assert.throws(() => validateRoadbookPrice({ ...annualPrice, ...override }, "annual"));
  }
});

test("advertised Roadbook amounts must include tax rather than acquire additional tax at checkout", () => {
  for (const tax_behavior of ["exclusive", "unspecified", undefined, null]) {
    assert.throws(() => validateRoadbookPrice({ ...annualPrice, tax_behavior }, "annual"));
    assert.throws(() => validateRoadbookPrice({ ...annualPrice, unit_amount: 200, tax_behavior,
      recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } }, "monthly"));
  }
});

const subscription = { id: "sub_fixture", customer: "cus_fixture", created: timestamp - 10, status: "active", cancel_at_period_end: false, items: { data: [{ price: { id: "price_annual" }, quantity: 1, current_period_end: timestamp + 1000 }] } };
test("period-end cancellation keeps access until paid expiry, immediate cancellation and failed billing do not", () => {
  const now = timestamp * 1000;
  assert.equal(subscriptionSnapshot({ ...subscription, cancel_at_period_end: true }, ["price_annual"], now).grantsAccess, true);
  for (const status of ["canceled", "unpaid", "past_due", "incomplete", "incomplete_expired", "paused"]) assert.equal(subscriptionSnapshot({ ...subscription, status }, ["price_annual"], now).grantsAccess, false);
  assert.equal(subscriptionSnapshot(subscription, ["price_annual"], (timestamp + 1001) * 1000).grantsAccess, false);
  assert.equal(subscriptionSnapshot({ ...subscription, status: "trialing", trial_end: timestamp + 10 }, ["price_annual"], now).expiresAt, new Date((timestamp + 10) * 1000).toISOString());
});

test("subscription state fails closed for unexpected prices, quantity, periods and identity", () => {
  assert.throws(() => subscriptionSnapshot(subscription, ["price_other"]));
  for (const override of [{ id: "not-a-subscription" }, { created: undefined }, { status: "unknown" }, { items: { data: [{ price: "price_annual", quantity: 2 }] } }, { items: { data: [{ price: "price_annual", quantity: 1, current_period_end: null }] } }]) assert.throws(() => subscriptionSnapshot({ ...subscription, ...override }, ["price_annual"]));
});

test("invoice events resolve current and historical API subscription shapes", () => {
  assert.equal(subscriptionFromEvent("invoice.paid", { parent: { subscription_details: { subscription: "sub_current" } } }), "sub_current");
  assert.equal(subscriptionFromEvent("invoice.payment_failed", { subscription: "sub_legacy" }), "sub_legacy");
  assert.equal(subscriptionFromEvent("checkout.session.completed", { subscription: "sub_checkout" }), "sub_checkout");
  assert.equal(subscriptionFromEvent("customer.subscription.deleted", { id: "sub_deleted" }), "sub_deleted");
  assert.equal(subscriptionFromEvent("payment_intent.succeeded", { id: "pi_irrelevant" }), null);
});

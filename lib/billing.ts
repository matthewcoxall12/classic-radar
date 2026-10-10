import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_API_VERSION = "2026-09-30.endive";
export type StripeRecord = Record<string, unknown>;
export function record(value: unknown): StripeRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StripeRecord : {};
}
export function stripeId(value: unknown): string {
  return typeof value === "string" ? value : String(record(value).id ?? "");
}

/** Verify the untouched request bytes before parsing JSON; support key rotation. */
export function verifyStripeSignature(body: string, signature: string | null, secret: string, now = Date.now()): boolean {
  if (!signature || !secret.startsWith("whsec_") || signature.length > 4096) return false;
  const parts = signature.split(",").map(part => part.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "t");
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1] ?? "")) return false;
  const timestamp = Number(timestamps[0][1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return parts.some(([key, digest]) => key === "v1" && /^[a-f0-9]{64}$/i.test(digest ?? "") && timingSafeEqual(expected, Buffer.from(digest, "hex")));
}

export type BillingPlan = "annual" | "monthly";
export function roadbookCheckoutForm({ customer, userId, price, generation, site }: { customer: string; userId: string; price: string; generation: string; site: string }) {
  return new URLSearchParams({
    mode: "subscription", customer, client_reference_id: userId,
    "metadata[roadbook_price_id]": price, "metadata[checkout_generation]": generation,
    "line_items[0][price]": price, "line_items[0][quantity]": "1",
    "subscription_data[metadata][classicsgo_user_id]": userId,
    "subscription_data[metadata][product]": "roadbook",
    success_url: `${site}/membership?checkout=complete`, cancel_url: `${site}/membership?checkout=cancelled`,
    "consent_collection[terms_of_service]": "required", "billing_address_collection": "auto",
    // ClassicsGo sells membership directly; never inherit merchant-of-record
    // defaults or their separate fees from Stripe account onboarding.
    "managed_payments[enabled]": "false"
  });
}
export function validateRoadbookPrice(price: StripeRecord, plan: BillingPlan, live = true): void {
  const recurring = record(price.recurring);
  if (!price.active || price.livemode !== live || price.type !== "recurring" || price.currency !== "gbp" || price.unit_amount !== (plan === "annual" ? 1500 : 200)
    || recurring.interval !== (plan === "annual" ? "year" : "month") || recurring.interval_count !== 1 || recurring.usage_type !== "licensed"
    || price.billing_scheme !== "per_unit" || price.custom_unit_amount != null || price.tax_behavior !== "inclusive") throw new Error("The Roadbook price is not configured correctly.");
}

export function subscriptionSnapshot(subscription: StripeRecord, allowedPrices: string[], now = Date.now()) {
  const items = record(subscription.items);
  const data = Array.isArray(items.data) ? items.data.map(record) : [];
  if (items.has_more || data.length !== 1 || !allowedPrices.includes(stripeId(data[0].price)) || data[0].quantity !== 1) throw new Error("Unexpected Roadbook subscription items");
  const status = String(subscription.status ?? "");
  if (!["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"].includes(status)) throw new Error("Unexpected subscription status");
  const periodEnd = Number(data[0].current_period_end);
  const trialEnd = status === "trialing" ? Number(subscription.trial_end) : periodEnd;
  if (!Number.isFinite(periodEnd) || !Number.isFinite(trialEnd) || periodEnd <= 0 || trialEnd <= 0) throw new Error("Subscription period is missing");
  const expires = Math.min(periodEnd, trialEnd);
  if (!/^cus_[A-Za-z0-9]+$/.test(stripeId(subscription.customer)) || !/^sub_[A-Za-z0-9]+$/.test(stripeId(subscription.id))
    || !Number.isSafeInteger(subscription.created) || Number(subscription.created) <= 0) throw new Error("Subscription identity is missing");
  return { customerId: stripeId(subscription.customer), subscriptionId: stripeId(subscription.id), status,
    subscriptionCreated: Number(subscription.created),
    expiresAt: new Date(expires * 1000).toISOString(), cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    grantsAccess: ["active", "trialing"].includes(status) && expires * 1000 > now };
}

export function subscriptionFromEvent(type: string, object: StripeRecord): string | null {
  if (type.startsWith("customer.subscription.")) return stripeId(object.id) || null;
  if (type.startsWith("checkout.session.")) return stripeId(object.subscription) || null;
  if (type.startsWith("invoice.")) return stripeId(record(record(object.parent).subscription_details).subscription) || stripeId(object.subscription) || null;
  return null;
}

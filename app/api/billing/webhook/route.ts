import { record, subscriptionFromEvent, subscriptionSnapshot, verifyStripeSignature } from "@/lib/billing";
import { billingConfig, billingResponse, billingRpc, stripeRequest } from "@/lib/billing-server";

export const runtime = "nodejs";
const EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"]);
export async function POST(request: Request) {
  const config = billingConfig();
  if (!config.serverReady || !config.webhookSecret.startsWith("whsec_") || !config.annualPrice || !config.monthlyPrice) return billingResponse({ error: "Webhook is not configured." }, 503);
  if (Number(request.headers.get("content-length") || 0) > 1024 * 1024) return billingResponse({ error: "Request is too large." }, 413);
  const body = await request.text();
  if (Buffer.byteLength(body) > 1024 * 1024) return billingResponse({ error: "Request is too large." }, 413);
  if (!verifyStripeSignature(body, request.headers.get("stripe-signature"), config.webhookSecret)) return billingResponse({ error: "Invalid signature." }, 400);
  let event;
  try { event = record(JSON.parse(body)); } catch { return billingResponse({ error: "Invalid event." }, 400); }
  const type = String(event.type ?? "");
  if (event.livemode !== config.live) return billingResponse({ error: "Event mode does not match this billing deployment." }, 400);
  if (!/^evt_[A-Za-z0-9]+$/.test(String(event.id)) || !Number.isSafeInteger(event.created)) return billingResponse({ error: "Invalid event." }, 400);
  if (!EVENTS.has(type)) return billingResponse({ received: true, ignored: true });
  const subscriptionId = subscriptionFromEvent(type, record(record(event.data).object));
  if (!subscriptionId || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return billingResponse({ received: true, ignored: true });
  try {
    // Retrieve the current canonical state, rather than trusting an old webhook
    // snapshot or the Checkout success URL. Stripe may deliver out of order.
    const observedAt = new Date().toISOString();
    const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`);
    const snapshot = subscriptionSnapshot(subscription, config.allowedPrices);
    if (config.testMode && await billingRpc("billing_customer_for_user", { p_user_id: config.testUserId }) !== snapshot.customerId) return billingResponse({ error: "Sandbox customer is not allowlisted." }, 403);
    await billingRpc("billing_apply_subscription", {
      p_event_id: event.id, p_event_created: event.created, p_observed_at: observedAt,
      p_customer_id: snapshot.customerId, p_subscription_id: snapshot.subscriptionId,
      p_subscription_created: snapshot.subscriptionCreated,
      p_status: snapshot.status, p_expires_at: snapshot.expiresAt, p_cancel_at_period_end: snapshot.cancelAtPeriodEnd
    });
    return billingResponse({ received: true });
  } catch (error) {
    console.error("ClassicsGo billing webhook failed", { event: event.id, error: error instanceof Error ? error.message : "unknown" });
    return billingResponse({ error: "Subscription update could not be processed. Retry required." }, 500);
  }
}

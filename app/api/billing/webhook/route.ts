import {
  BillingConfigurationError,
  billingUnavailableResponse,
  claimStripeEvent,
  completeStripeEvent,
  getBillingConfig,
  markCheckoutSession,
  releaseStripeEvent,
  retrieveStripeSubscription,
  StripeApiError,
  syncCheckoutSession,
  syncSubscription,
  verifyStripeSignature,
  type StripeCheckoutSession,
  type StripeEvent,
  type StripeSubscription,
} from "@/lib/stripe-billing";

const MAX_WEBHOOK_BYTES = 1_000_000;
const checkoutEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);
const subscriptionEvents = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);
const expiredCheckoutEvents = new Set(["checkout.session.expired"]);

export async function POST(request: Request) {
  let claimedEventId: string | null = null;
  try {
    const config = getBillingConfig("webhook");
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_WEBHOOK_BYTES) {
      return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
      return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
    }

    const signature = request.headers.get("stripe-signature");
    if (
      !signature ||
      !config.webhookSecret ||
      !(await verifyStripeSignature(rawBody, signature, config.webhookSecret))
    ) {
      return Response.json(
        { error: "Webhook signature verification failed." },
        { status: 400 },
      );
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return Response.json({ error: "Webhook payload is not valid JSON." }, { status: 400 });
    }

    if (!event.id || !event.type || !event.data?.object) {
      return Response.json({ error: "Webhook event is incomplete." }, { status: 400 });
    }

    const claim = await claimStripeEvent(event);
    if (claim === "processed") {
      return Response.json({ received: true, handled: true, duplicate: true });
    }
    if (claim === "busy") {
      return Response.json(
        { received: true, handled: false, retry: true },
        { status: 503, headers: { "Retry-After": "10" } },
      );
    }
    claimedEventId = event.id;

    if (checkoutEvents.has(event.type)) {
      const session = event.data.object as StripeCheckoutSession;
      await syncCheckoutSession(
        session,
        config.secretKey,
      );
      await markCheckoutSession(session.id, "completed");
      await completeStripeEvent(event.id);
      return Response.json({ received: true, handled: true });
    }

    if (expiredCheckoutEvents.has(event.type)) {
      const session = event.data.object as StripeCheckoutSession;
      await markCheckoutSession(session.id, "expired");
      await completeStripeEvent(event.id);
      return Response.json({ received: true, handled: true });
    }

    if (subscriptionEvents.has(event.type)) {
      const delivered = event.data.object as StripeSubscription;
      if (!delivered.id) {
        throw new StripeApiError("Stripe subscription event is incomplete.", 400, null);
      }
      const current = await retrieveStripeSubscription(
        delivered.id,
        config.secretKey,
      );
      await syncSubscription(
        current,
        config.secretKey,
        event.created,
      );
      await completeStripeEvent(event.id);
      return Response.json({ received: true, handled: true });
    }

    await completeStripeEvent(event.id);
    return Response.json({ received: true, handled: false });
  } catch (error) {
    if (claimedEventId) {
      await releaseStripeEvent(claimedEventId).catch(() => undefined);
    }
    if (error instanceof BillingConfigurationError) {
      return billingUnavailableResponse(error);
    }
    if (error instanceof StripeApiError) {
      return Response.json(
        { error: "Stripe data could not be synchronized." },
        { status: 502 },
      );
    }
    return Response.json(
      { error: "The webhook could not be processed." },
      { status: 500 },
    );
  }
}

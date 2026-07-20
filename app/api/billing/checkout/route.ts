import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { MemberApiError, requireMember } from "@/lib/member-data";
import { checkRateLimit, readJsonBody, RequestError } from "@/lib/request-safety";
import {
  activateCheckoutSession,
  BillingConfigurationError,
  billingErrorResponse,
  billingSuccessResponse,
  billingUnavailableResponse,
  createCheckoutSession,
  createStripeCustomer,
  expireStripeCheckoutSession,
  failCheckoutReservation,
  getBillingConfig,
  saveStripeCustomer,
  reserveCheckoutSession,
  StripeApiError,
  type BillingPlan,
} from "@/lib/stripe-billing";

const plans = new Set<BillingPlan>(["monthly", "annual", "founding"]);
const subscribedStatuses = new Set(["active", "trialing", "past_due"]);

export async function POST(request: Request) {
  try {
    const { user, member } = await requireMember(request);

    const durableLimit = await checkDurableAuthRateLimit({
      request,
      scope: "billing-checkout-member",
      subject: user.memberId,
      includeIp: false,
      limit: 10,
      windowSeconds: 10 * 60,
    });
    if (!durableLimit.allowed) {
      return billingErrorResponse(
        429,
        "RATE_LIMITED",
        "Too many billing attempts. Please wait a few minutes.",
        { "Retry-After": String(durableLimit.retryAfter) },
      );
    }

    const limit = checkRateLimit(request, "billing-checkout", 10, 60 * 1000);
    if (!limit.allowed) {
      return billingErrorResponse(
        429,
        "RATE_LIMITED",
        "Too many billing attempts. Please wait a moment.",
        { "Retry-After": String(limit.retryAfter) },
      );
    }

    const payload = await readJsonBody(request, 2_000);
    const requestedPlan = payload.plan;
    if (typeof requestedPlan !== "string" || !plans.has(requestedPlan as BillingPlan)) {
      return billingErrorResponse(
        400,
        "INVALID_PLAN",
        "Choose a valid Roadbook membership plan.",
      );
    }

    const plan = requestedPlan as BillingPlan;
    const config = getBillingConfig("checkout", plan);
    if (
      member.stripe_subscription_id &&
      member.tier === "roadbook" &&
      member.subscription_status &&
      subscribedStatuses.has(member.subscription_status)
    ) {
      return billingErrorResponse(
        409,
        "ALREADY_SUBSCRIBED",
        "Your Roadbook membership is already active.",
      );
    }

    if (
      member.stripe_subscription_id &&
      member.subscription_status === "pending"
    ) {
      return billingErrorResponse(
        409,
        "MEMBERSHIP_CONFIRMING",
        "Your recent payment is still being confirmed. Refresh your account in a moment.",
      );
    }

    if (plan === "founding" && member.stripe_subscription_id) {
      return billingErrorResponse(
        409,
        "FOUNDING_OFFER_UNAVAILABLE",
        "The founding offer is available to first-time members only.",
      );
    }

    const reservation = await reserveCheckoutSession(user.email, plan);
    if (reservation.kind === "reuse") {
      return billingSuccessResponse({
        url: reservation.url,
        sessionId: reservation.sessionId,
        reused: true,
      });
    }
    if (reservation.kind === "busy") {
      return billingErrorResponse(
        409,
        "CHECKOUT_IN_PROGRESS",
        "A secure checkout is already being prepared. Please try again in a moment.",
        { "Retry-After": "3" },
      );
    }

    try {
      let customerId = member.stripe_customer_id;
      if (!customerId) {
        const customer = await createStripeCustomer({
          secretKey: config.secretKey,
          email: user.email.toLowerCase(),
          name: user.displayName,
        });
        customerId = customer.id;
        await saveStripeCustomer(user.email, customerId);
      }
      if (reservation.kind === "replace") {
        await expireStripeCheckoutSession(
          reservation.previousSessionId,
          config.secretKey,
          reservation.attemptToken,
        );
      }
      const session = await createCheckoutSession({
        config,
        customerId,
        email: user.email.toLowerCase(),
        plan,
        idempotencyKey: reservation.attemptToken,
        expiresAt: reservation.sessionExpiresAt,
      });
      await activateCheckoutSession({
        email: user.email,
        leaseToken: reservation.leaseToken,
        attemptToken: reservation.attemptToken,
        session,
        plan,
      });
      if (!session.url) {
        throw new StripeApiError("Stripe did not return a checkout URL.", 502, null);
      }
      return billingSuccessResponse({ url: session.url, sessionId: session.id });
    } catch (error) {
      await failCheckoutReservation(user.email, reservation.leaseToken).catch(
        () => undefined,
      );
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthSecurityError || error instanceof MemberApiError) {
      return billingErrorResponse(error.status, error.code, error.message);
    }
    if (error instanceof BillingConfigurationError) {
      return billingUnavailableResponse(error);
    }
    if (error instanceof RequestError) {
      return billingErrorResponse(error.status, "INVALID_REQUEST", error.message);
    }
    if (error instanceof StripeApiError) {
      return billingErrorResponse(
        502,
        "BILLING_PROVIDER_ERROR",
        "The secure checkout could not be started. Please try again.",
      );
    }
    return billingErrorResponse(
      503,
      "BILLING_UNAVAILABLE",
      "Billing is temporarily unavailable. Please try again soon.",
    );
  }
}

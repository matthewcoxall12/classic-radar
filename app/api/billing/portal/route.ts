import { requireFreshAuthentication } from "@/lib/app-auth";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { MemberApiError, requireMember } from "@/lib/member-data";
import { checkRateLimit } from "@/lib/request-safety";
import {
  BillingConfigurationError,
  billingErrorResponse,
  billingSuccessResponse,
  billingUnavailableResponse,
  createPortalSession,
  getBillingConfig,
  StripeApiError,
} from "@/lib/stripe-billing";

export async function POST(request: Request) {
  try {
    const { member, user } = await requireMember(request);
    requireFreshAuthentication(user);

    const durableLimit = await checkDurableAuthRateLimit({
      request,
      scope: "billing-portal-member",
      subject: user.memberId,
      includeIp: false,
      limit: 10,
      windowSeconds: 10 * 60,
    });
    if (!durableLimit.allowed) {
      return billingErrorResponse(
        429,
        "RATE_LIMITED",
        "Too many billing requests. Please wait a few minutes.",
        { "Retry-After": String(durableLimit.retryAfter) },
      );
    }

    const limit = checkRateLimit(request, "billing-portal", 20, 60 * 1000);
    if (!limit.allowed) {
      return billingErrorResponse(
        429,
        "RATE_LIMITED",
        "Too many billing requests. Please wait a moment.",
        { "Retry-After": String(limit.retryAfter) },
      );
    }

    const config = getBillingConfig("portal");
    if (!member.stripe_customer_id) {
      return billingErrorResponse(
        409,
        "NO_BILLING_PROFILE",
        "No billing profile exists for this account yet.",
      );
    }

    const session = await createPortalSession({
      config,
      customerId: member.stripe_customer_id,
    });
    return billingSuccessResponse({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof AuthSecurityError || error instanceof MemberApiError) {
      return billingErrorResponse(error.status, error.code, error.message);
    }
    if (error instanceof BillingConfigurationError) {
      return billingUnavailableResponse(error);
    }
    if (error instanceof StripeApiError) {
      return billingErrorResponse(
        502,
        "BILLING_PROVIDER_ERROR",
        "The billing portal could not be opened. Please try again.",
      );
    }
    return billingErrorResponse(
      503,
      "BILLING_UNAVAILABLE",
      "Billing is temporarily unavailable. Please try again soon.",
    );
  }
}

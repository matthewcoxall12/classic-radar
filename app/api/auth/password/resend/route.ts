import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
  requirePublicFormOrigin,
  siteOrigin,
} from "@/lib/auth-security";
import {
  normalizeAuthEmail,
  reportAuthDeliveryFailure,
  validateCaptchaToken,
} from "@/lib/password-auth";
import { readJsonBody, RequestError } from "@/lib/request-safety";
import {
  createSupabaseRouteClient,
  passwordAuthEnabled,
  SupabaseAuthConfigurationError,
} from "@/lib/supabase-auth";

export async function POST(request: Request) {
  try {
    requirePublicFormOrigin(request);
    if (!passwordAuthEnabled()) throw new SupabaseAuthConfigurationError();
    const body = await readJsonBody(request, 4_000);
    const email = normalizeAuthEmail(body.email);
    const captchaToken = validateCaptchaToken(body.captchaToken);
    const [ipLimit, accountLimit] = await Promise.all([
      checkDurableAuthRateLimit({
        request,
        scope: "password-confirm-resend-ip",
        limit: 10,
        windowSeconds: 60 * 60,
      }),
      checkDurableAuthRateLimit({
        request,
        scope: "password-confirm-resend-account",
        subject: email,
        includeIp: false,
        limit: 3,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many confirmation requests. Please wait and try again.",
          },
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(
              Math.max(ipLimit.retryAfter, accountLimit.retryAfter),
            ),
          },
        },
      );
    }

    const { client, config } = await createSupabaseRouteClient();
    if (!config.turnstileSiteKey) throw new SupabaseAuthConfigurationError();
    const { error } = await client.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${siteOrigin(request)}/auth/confirm`,
        captchaToken,
      },
    });
    if (error) reportAuthDeliveryFailure("signup-confirmation-resend", error);
    return Response.json(
      {
        ok: true,
        data: {
          message:
            "If that address is awaiting confirmation, a fresh email is on its way.",
        },
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const known = error instanceof RequestError || error instanceof AuthSecurityError;
    const setup = error instanceof SupabaseAuthConfigurationError;
    return Response.json(
      {
        ok: false,
        error: {
          code: setup
            ? "AUTH_SETUP_PENDING"
            : error instanceof AuthSecurityError
              ? error.code
              : "CONFIRMATION_RESEND_FAILED",
          message: setup
            ? error.message
            : known
              ? error.message
              : "The confirmation email is temporarily unavailable.",
        },
      },
      {
        status: setup ? 503 : known ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

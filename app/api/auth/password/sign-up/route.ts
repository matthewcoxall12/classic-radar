import { cookies } from "next/headers";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
  requirePublicFormOrigin,
  RETURN_COOKIE,
  siteOrigin,
} from "@/lib/auth-security";
import {
  cleanDisplayName,
  normalizeAuthEmail,
  reportAuthDeliveryFailure,
  validateCaptchaToken,
  validateNewPassword,
} from "@/lib/password-auth";
import { readJsonBody, RequestError } from "@/lib/request-safety";
import {
  bestEffortLocalSupabaseSignOut,
  createSupabaseRouteClient,
  passwordAuthEnabled,
  SupabaseAuthConfigurationError,
} from "@/lib/supabase-auth";

export async function POST(request: Request) {
  try {
    requirePublicFormOrigin(request);
    if (!passwordAuthEnabled()) throw new SupabaseAuthConfigurationError();
    const body = await readJsonBody(request, 6_000);
    const email = normalizeAuthEmail(body.email);
    const password = validateNewPassword(body.password);
    const name = cleanDisplayName(body.name);
    const captchaToken = validateCaptchaToken(body.captchaToken);
    if (body.termsAccepted !== true) {
      throw new RequestError("Accept the Terms and Privacy Policy to continue.", 400);
    }
    const returnTo = safeRelativeReturnPath(
      typeof body.returnTo === "string" ? body.returnTo : "/account",
    );

    const [ipLimit, accountLimit] = await Promise.all([
      checkDurableAuthRateLimit({
        request,
        scope: "password-signup-ip",
        limit: 10,
        windowSeconds: 60 * 60,
      }),
      checkDurableAuthRateLimit({
        request,
        scope: "password-signup-account",
        subject: email,
        includeIp: false,
        limit: 4,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many account requests. Please wait and try again.",
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

    (await cookies()).set(RETURN_COOKIE, returnTo, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });
    const { client, config } = await createSupabaseRouteClient();
    if (!config.turnstileSiteKey) throw new SupabaseAuthConfigurationError();
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${siteOrigin(request)}/auth/confirm`,
          captchaToken,
        },
      });
      if (error) {
        reportAuthDeliveryFailure("signup-confirmation", error);
        return Response.json(
          {
            ok: false,
            error: {
              code: "SIGN_UP_UNAVAILABLE",
              message: "We could not send the confirmation email. Please try again shortly.",
            },
          },
          { status: 502, headers: { "Cache-Control": "no-store" } },
        );
      }

      // A returned session means Confirm Email is disabled upstream. Never
      // silently weaken the production policy or create a ClassicsGo session.
      if (data.session) throw new SupabaseAuthConfigurationError();

      return Response.json(
        {
          ok: true,
          data: {
            redirectTo: "/check-email",
            message:
              "If this address can be registered, a confirmation email is on its way.",
          },
        },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      await bestEffortLocalSupabaseSignOut(client);
    }
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
              : "SIGN_UP_FAILED",
          message: setup
            ? error.message
            : known
              ? error.message
              : "Account creation is temporarily unavailable.",
        },
      },
      {
        status: setup ? 503 : known ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

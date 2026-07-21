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
    const returnTo = safeRelativeReturnPath(
      typeof body.returnTo === "string" ? body.returnTo : "/account",
    );
    const [ipLimit, accountLimit] = await Promise.all([
      checkDurableAuthRateLimit({
        request,
        scope: "password-forgot-ip",
        limit: 10,
        windowSeconds: 60 * 60,
      }),
      checkDurableAuthRateLimit({
        request,
        scope: "password-forgot-account",
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
            message: "Too many reset requests. Please wait and try again.",
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
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteOrigin(request)}/auth/recovery`,
      captchaToken,
    });
    if (error) reportAuthDeliveryFailure("password-recovery", error);

    return Response.json(
      {
        ok: true,
        data: {
          message:
            "If an email account exists for that address, a reset link is on its way.",
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
              : "PASSWORD_RESET_REQUEST_FAILED",
          message: setup
            ? error.message
            : known
              ? error.message
              : "Password recovery is temporarily unavailable.",
        },
      },
      {
        status: setup ? 503 : known ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

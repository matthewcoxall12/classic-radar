import {
  assertReauthenticationMember,
  assertReauthenticationPrincipal,
  createAppSession,
  resolveAuthPrincipal,
} from "@/lib/app-auth";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
  requirePublicFormOrigin,
} from "@/lib/auth-security";
import {
  normalizeAuthEmail,
  validateCaptchaToken,
  validateCurrentPassword,
} from "@/lib/password-auth";
import { readJsonBody, RequestError } from "@/lib/request-safety";
import {
  createSupabaseRouteClient,
  passwordAuthEnabled,
  principalFromSupabaseUser,
  SupabaseAuthConfigurationError,
} from "@/lib/supabase-auth";

export async function POST(request: Request) {
  try {
    requirePublicFormOrigin(request);
    if (!passwordAuthEnabled()) throw new SupabaseAuthConfigurationError();
    const body = await readJsonBody(request, 5_000);
    const email = normalizeAuthEmail(body.email);
    const password = validateCurrentPassword(body.password);
    const captchaToken = validateCaptchaToken(body.captchaToken);
    const returnTo = safeRelativeReturnPath(
      typeof body.returnTo === "string" ? body.returnTo : "/account",
    );

    const [ipLimit, accountLimit] = await Promise.all([
      checkDurableAuthRateLimit({
        request,
        scope: "password-signin-ip",
        limit: 20,
        windowSeconds: 15 * 60,
      }),
      checkDurableAuthRateLimit({
        request,
        scope: "password-signin-account",
        subject: email,
        includeIp: false,
        limit: 10,
        windowSeconds: 15 * 60,
      }),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many sign-in attempts. Please wait and try again.",
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
    const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (error || !data.user || !data.session) {
        return Response.json(
          {
            ok: false,
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Email or password not recognised. Please try again.",
            },
          },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      // The successful password grant is authoritative even when an OAuth-first
      // Supabase user still has Google recorded as their primary identity.
      const principal = principalFromSupabaseUser(data.user, "password");
      await assertReauthenticationPrincipal(principal);
      const user = await resolveAuthPrincipal(principal);
      await assertReauthenticationMember(user);
      await createAppSession(user, request);

    return Response.json(
        { ok: true, data: { redirectTo: returnTo } },
        { headers: { "Cache-Control": "no-store" } },
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
              : "EMAIL_SIGN_IN_FAILED",
          message: setup
            ? error.message
            : known
              ? error.message
              : "Email or password not recognised. Please try again.",
        },
      },
      {
        status: setup ? 503 : known ? error.status : 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

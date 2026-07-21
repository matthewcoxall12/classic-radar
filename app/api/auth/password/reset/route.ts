import { cookies } from "next/headers";
import {
  clearAppSessionCookies,
  revokeAllAppSessionsForIdentity,
} from "@/lib/app-auth";
import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
  requirePublicFormOrigin,
  verifyTurnstileToken,
} from "@/lib/auth-security";
import {
  clearPasswordRecoveryState,
  PASSWORD_RECOVERY_COOKIE,
  readPasswordRecoveryState,
  validateCaptchaToken,
  validateNewPassword,
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
    const body = await readJsonBody(request, 5_000);
    const password = validateNewPassword(body.password);
    if (body.passwordConfirmation !== password) {
      throw new RequestError("The two passwords do not match.", 400);
    }
    const captchaToken = validateCaptchaToken(body.captchaToken);
    await verifyTurnstileToken(request, captchaToken, "password_reset");
    const recoveryCookie = (await cookies()).get(PASSWORD_RECOVERY_COOKIE)?.value;
    const recovery = await readPasswordRecoveryState(recoveryCookie);
    if (!recovery) {
      throw new AuthSecurityError(
        401,
        "RECOVERY_EXPIRED",
        "That recovery link has expired. Request a new one.",
      );
    }
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "password-reset-complete",
      subject: recovery.userId,
      includeIp: false,
      limit: 4,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      throw new AuthSecurityError(
        429,
        "AUTH_RATE_LIMITED",
        "Too many password changes were attempted. Please wait and try again.",
      );
    }

    const { client, config } = await createSupabaseRouteClient();
    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data.user || data.user.id !== recovery.userId) {
      throw new AuthSecurityError(
        401,
        "RECOVERY_EXPIRED",
        "That recovery link has expired. Request a new one.",
      );
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    await revokeAllAppSessionsForIdentity(
      `${config.url}/auth/v1`,
      data.user.id,
    );
    await client.auth.signOut({ scope: "global" });
    clearAppSessionCookies(await cookies());
    await clearPasswordRecoveryState();
    return Response.json(
      { ok: true, data: { redirectTo: "/sign-in?notice=password_updated" } },
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
              : "PASSWORD_UPDATE_FAILED",
          message: setup
            ? error.message
            : known
              ? error.message
              : "The password could not be updated. Request a fresh recovery link.",
        },
      },
      {
        status: setup ? 503 : known ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

import { cookies } from "next/headers";
import {
  AccountClaimVerificationError,
  assertReauthenticationMember,
  assertReauthenticationPrincipal,
  createAppSession,
  resolveAuthPrincipal,
} from "@/lib/app-auth";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { AuthSecurityError, RETURN_COOKIE, siteOrigin } from "@/lib/auth-security";
import {
  bestEffortLocalSupabaseSignOut,
  bestEffortWelcomeEmail,
  createSupabaseRouteClient,
  principalFromSupabaseUser,
} from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const returnTo = safeRelativeReturnPath(
    cookieStore.get(RETURN_COOKIE)?.value ?? "/account",
  );
  cookieStore.set(RETURN_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  let authClient: Awaited<ReturnType<typeof createSupabaseRouteClient>>["client"] | null = null;
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code || code.length > 2048) throw new Error("Missing OAuth code.");
    const { client } = await createSupabaseRouteClient();
    authClient = client;
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.user || !data.session) {
      throw error ?? new Error("No verified user returned.");
    }
    const principal = principalFromSupabaseUser(data.user, "google");
    await assertReauthenticationPrincipal(principal);
    const user = await resolveAuthPrincipal(principal);
    const reauthenticated = await assertReauthenticationMember(user);
    await createAppSession(user, request);
    if (!reauthenticated) await bestEffortWelcomeEmail(client, data.user);
    return Response.redirect(`${siteOrigin(request)}${returnTo}`, 303);
  } catch (error) {
    if (authClient) await bestEffortLocalSupabaseSignOut(authClient);
    const code =
      error instanceof AccountClaimVerificationError
        ? "account_claim"
        : error instanceof AuthSecurityError && error.code === "ACCOUNT_DELETED"
          ? "account_deleted"
          : error instanceof AuthSecurityError && error.code.startsWith("REAUTH_")
            ? "reauth_failed"
            : "oauth_failed";
    const reauth = code === "reauth_failed" ? "&reauth=1" : "";
    return Response.redirect(
      `${siteOrigin(request)}/sign-in?error=${code}${reauth}&return_to=${encodeURIComponent(returnTo)}`,
      303,
    );
  }
}

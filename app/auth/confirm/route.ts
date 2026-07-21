import { cookies } from "next/headers";
import {
  createAppSession,
  resolveAuthPrincipal,
} from "@/lib/app-auth";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { RETURN_COOKIE, siteOrigin } from "@/lib/auth-security";
import {
  bestEffortWelcomeEmail,
  createSupabaseRouteClient,
  passwordAuthEnabled,
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
  try {
    if (!passwordAuthEnabled()) throw new Error("Email accounts are disabled.");
    const url = new URL(request.url);
    const tokenHash = url.searchParams.get("token_hash");
    if (
      !tokenHash ||
      tokenHash.length > 2_048 ||
      url.searchParams.get("type") !== "email"
    ) {
      throw new Error("Invalid confirmation link.");
    }
    const { client } = await createSupabaseRouteClient();
    const { data, error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });
      if (error || !data.user || !data.session) {
        throw error ?? new Error("No verified user returned.");
      }
      const principal = principalFromSupabaseUser(data.user, "email");
      const user = await resolveAuthPrincipal(principal);
      await createAppSession(user, request);
      await bestEffortWelcomeEmail(client, data.user);
    return Response.redirect(`${siteOrigin(request)}${returnTo}`, 303);
  } catch {
    return Response.redirect(
      `${siteOrigin(request)}/sign-in?error=email_confirmation_failed`,
      303,
    );
  }
}

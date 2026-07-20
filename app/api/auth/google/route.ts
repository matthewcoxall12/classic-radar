import { cookies } from "next/headers";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { RETURN_COOKIE, siteOrigin } from "@/lib/auth-security";
import {
  createSupabaseRouteClient,
  SupabaseAuthConfigurationError,
} from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const returnTo = safeRelativeReturnPath(
    new URL(request.url).searchParams.get("return_to") ?? "/account",
  );
  try {
    const cookieStore = await cookies();
    cookieStore.set(RETURN_COOKIE, returnTo, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    const { client } = await createSupabaseRouteClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteOrigin(request)}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) throw error ?? new Error("No OAuth URL returned.");
    return Response.redirect(data.url, 303);
  } catch (error) {
    const code =
      error instanceof SupabaseAuthConfigurationError
        ? "setup_pending"
        : "oauth_failed";
    return Response.redirect(
      `${siteOrigin(request)}/sign-in?error=${code}&return_to=${encodeURIComponent(returnTo)}`,
      303,
    );
  }
}

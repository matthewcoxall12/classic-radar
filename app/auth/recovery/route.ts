import { cookies } from "next/headers";
import { siteOrigin } from "@/lib/auth-security";
import {
  createPasswordRecoveryState,
  PASSWORD_RECOVERY_COOKIE,
} from "@/lib/password-auth";
import {
  createSupabaseRouteClient,
  passwordAuthEnabled,
} from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (!passwordAuthEnabled()) throw new Error("Email accounts are disabled.");
    const url = new URL(request.url);
    const tokenHash = url.searchParams.get("token_hash");
    if (
      !tokenHash ||
      tokenHash.length > 2_048 ||
      url.searchParams.get("type") !== "recovery"
    ) {
      throw new Error("Invalid recovery link.");
    }
    const { client } = await createSupabaseRouteClient();
    const { data, error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error || !data.user) throw error ?? new Error("No recovery user returned.");
    (await cookies()).set(
      PASSWORD_RECOVERY_COOKIE,
      await createPasswordRecoveryState(data.user.id),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      },
    );
    return Response.redirect(`${siteOrigin(request)}/reset-password`, 303);
  } catch {
    return Response.redirect(
      `${siteOrigin(request)}/forgot-password?error=recovery_expired`,
      303,
    );
  }
}

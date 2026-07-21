import {
  recordAuthEvent,
  requireAuthenticatedMutation,
  requireFreshAuthentication,
} from "@/lib/app-auth";
import { AuthSecurityError } from "@/lib/auth-security";
import { jsonMemberError, jsonOk, MemberApiError } from "@/lib/member-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function exportError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (/recent authentication required|authentication required/i.test(message)) {
    return new AuthSecurityError(
      401,
      "FRESH_AUTH_REQUIRED",
      "Please sign in again before downloading account data.",
    );
  }
  return new MemberApiError(
    503,
    "ACCOUNT_EXPORT_UNAVAILABLE",
    "Your account data could not be prepared. Please try again shortly.",
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedMutation(request);
    requireFreshAuthentication(user);
    let supabase;
    try {
      supabase = createSupabaseAdminClient();
    } catch {
      throw new MemberApiError(
        503,
        "ACCOUNT_EXPORT_UNAVAILABLE",
        "Your account data could not be prepared. Please try again shortly.",
      );
    }
    const { data, error } = await supabase.rpc("export_managed_account_data", {
      p_user_id: user.memberId,
    });
    if (error || !data) throw exportError(error);
    await recordAuthEvent(
      user.memberId,
      "account_exported",
      user.provider,
      user.sessionId,
    );
    return jsonOk({ export: data });
  } catch (error) {
    return jsonMemberError(error);
  }
}

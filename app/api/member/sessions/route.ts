import {
  recordAuthEvent,
  requireAuthenticatedMutation,
} from "@/lib/app-auth";
import { jsonMemberError, jsonOk, MemberApiError } from "@/lib/member-data";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedMutation(request);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) {
      throw new MemberApiError(
        503,
        "SESSION_REVOCATION_UNAVAILABLE",
        "Other signed-in sessions could not be revoked. Please try again.",
      );
    }
    await recordAuthEvent(
      user.memberId,
      "other_sessions_revoked",
      user.provider,
      user.sessionId,
    );
    return jsonOk({ revoked: true });
  } catch (error) {
    return jsonMemberError(error);
  }
}

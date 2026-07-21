import { cookies } from "next/headers";
import {
  clearAppSessionCookies,
  createDeletionReceipt,
  DELETION_RECEIPT_COOKIE,
  recordAuthEvent,
  requireAuthenticatedMutation,
  requireFreshAuthentication,
  signOutRedirect,
} from "@/lib/app-auth";
import { AuthSecurityError } from "@/lib/auth-security";
import {
  jsonMemberError,
  jsonOk,
  MemberApiError,
  readMemberJson,
} from "@/lib/member-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { clearSupabaseAuthCookies } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

function deletionError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (/recent authentication required|authentication required/i.test(message)) {
    return new AuthSecurityError(
      401,
      "FRESH_AUTH_REQUIRED",
      "Please sign in again before deleting this account.",
    );
  }
  if (/administrator accounts/i.test(message)) {
    return new MemberApiError(
      409,
      "ADMIN_ACCOUNT_REVIEW_REQUIRED",
      "Administrator accounts require a manual access transfer before deletion.",
    );
  }
  if (/cancel paid membership/i.test(message)) {
    return new MemberApiError(
      409,
      "BILLING_RELATIONSHIP_ACTIVE",
      "Cancel paid membership before deleting this account.",
    );
  }
  if (/confirmation phrase/i.test(message)) {
    return new MemberApiError(
      400,
      "CONFIRMATION_REQUIRED",
      "Type DELETE to confirm permanent account deletion.",
    );
  }
  return new MemberApiError(
    503,
    "ACCOUNT_DELETE_UNAVAILABLE",
    "The account could not be deleted. No account data was intentionally removed.",
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedMutation(request);
    requireFreshAuthentication(user);
    const body = await readMemberJson(request);
    if (body.confirmation !== "DELETE") {
      throw new MemberApiError(
        400,
        "CONFIRMATION_REQUIRED",
        "Type DELETE to confirm permanent account deletion.",
      );
    }

    const deletionId = `del_${crypto.randomUUID()}`;
    const receipt = await createDeletionReceipt(deletionId, false);
    let supabase;
    try {
      supabase = createSupabaseAdminClient();
    } catch {
      throw new MemberApiError(
        503,
        "ACCOUNT_DELETE_UNAVAILABLE",
        "The account could not be deleted because the secure account service is unavailable.",
      );
    }
    const { error } = await supabase.rpc("delete_managed_account", {
      p_user_id: user.memberId,
      p_confirmation: "DELETE",
    });
    if (error) throw deletionError(error);

    await recordAuthEvent(
      user.memberId,
      "account_deleted",
      user.provider,
      user.sessionId,
    );
    await clearSupabaseAuthCookies();
    const cookieStore = await cookies();
    clearAppSessionCookies(cookieStore);
    cookieStore.set(DELETION_RECEIPT_COOKIE, receipt, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
    return jsonOk({
      deleted: true,
      identityDeletionPending: false,
      providerCleanupPending: false,
      redirectTo: signOutRedirect("/account-deleted"),
    });
  } catch (error) {
    return jsonMemberError(error);
  }
}

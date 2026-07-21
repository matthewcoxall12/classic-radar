import {
  jsonMemberError,
  jsonOk,
  memberEntitlements,
  MemberApiError,
  publicMember,
  requireMember,
} from "@/lib/member-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { member, user } = await requireMember(request);
    if (
      member.tier !== "free" ||
      member.trial_started_at !== null ||
      member.stripe_subscription_id !== null
    ) {
      throw new MemberApiError(
        409,
        "TRIAL_UNAVAILABLE",
        "A free trial has already been used or this account already has membership.",
      );
    }

    const started = await createSupabaseAdminClient().rpc(
      "start_managed_roadbook_trial",
      { p_user_id: user.memberId },
    );
    if (started.error || !started.data) {
      if (
        started.error?.code === "P0001" ||
        /trial (?:already used|is unavailable)/i.test(started.error?.message ?? "")
      ) {
        throw new MemberApiError(
          409,
          "TRIAL_UNAVAILABLE",
          "This account is not eligible for another free trial.",
        );
      }
      throw started.error ?? new Error("The trial could not be started.");
    }

    const refreshed = await requireMember();
    return jsonOk(
      {
        trial: {
          started: true,
          expiresAt: refreshed.member.subscription_expires_at,
        },
        member: publicMember(refreshed.member),
        entitlements: memberEntitlements(refreshed.member),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonMemberError(error);
  }
}

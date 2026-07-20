import {
  jsonMemberError,
  jsonOk,
  memberEntitlements,
  MemberApiError,
  publicMember,
  requireMember,
} from "@/lib/member-data";
import { hmacIdentifier } from "@/lib/auth-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        `DELETE FROM account_deletion_tombstones
         WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .bind(now)
      .run();
    const previousAccount = await db
      .prepare(
        `SELECT id FROM account_deletion_tombstones
         WHERE email_hash = ? AND expires_at > ? LIMIT 1`,
      )
      .bind(
        await hmacIdentifier(`email:${member.email.trim().toLowerCase()}`),
        now,
      )
      .first<{ id: string }>();
    if (
      previousAccount ||
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

    const result = await db
      .prepare(
        `UPDATE members SET tier = 'roadbook', subscription_status = 'trialing',
          subscription_expires_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+14 days'),
          trial_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE email = ? AND tier = 'free' AND trial_started_at IS NULL
           AND stripe_subscription_id IS NULL`,
      )
      .bind(member.email)
      .run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new MemberApiError(
        409,
        "TRIAL_UNAVAILABLE",
        "This account is not eligible for another free trial.",
      );
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

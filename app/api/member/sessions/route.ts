import { jsonMemberError, jsonOk, requireMember } from "@/lib/member-data";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const { db, member, user } = await requireMember(request);
    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .prepare(
        `UPDATE auth_sessions SET revoked_at = ?
         WHERE member_id = ? AND revoked_at IS NULL AND expires_at > ?
           AND id <> ?`,
      )
      .bind(now, member.id, now, user.sessionId)
      .run();
    return jsonOk({ revoked: Number(result.meta.changes ?? 0) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

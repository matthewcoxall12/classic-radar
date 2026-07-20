import { ensureDatabase } from "@/lib/database";

const ADMIN_AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

export async function pruneExpiredAdminAuditRows() {
  const db = await ensureDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - ADMIN_AUDIT_RETENTION_SECONDS;
  const results = await db.batch([
    db
      .prepare(`DELETE FROM admin_queue_audit WHERE created_at < ?`)
      .bind(cutoff),
    db
      .prepare(`DELETE FROM event_candidate_review_audit WHERE created_at < ?`)
      .bind(cutoff),
    db
      .prepare(`DELETE FROM event_source_review_audit WHERE created_at < ?`)
      .bind(cutoff),
    db
      .prepare(`DELETE FROM event_withdrawal_audit WHERE created_at < ?`)
      .bind(cutoff),
  ]);
  return results.reduce(
    (count, result) => count + Number(result.meta.changes ?? 0),
    0,
  );
}

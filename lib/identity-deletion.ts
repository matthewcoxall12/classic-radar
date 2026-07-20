import { createClient } from "@supabase/supabase-js";
import { ensureDatabase } from "@/lib/database";
import { getRuntimeEnv } from "@/lib/runtime-env";

type DeletionJob = {
  id: string;
  issuer: string;
  subject: string;
  attempts: number;
};

const MAX_AUTOMATIC_ATTEMPTS = 8;
const RAW_JOB_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const COMPLETED_JOB_RETENTION_SECONDS = 24 * 60 * 60;
const MANUAL_ATTENTION_DELAY_SECONDS = 365 * 24 * 60 * 60;

function manualAttentionCode(code: string) {
  return `MANUAL_ATTENTION_${code}`;
}

function reportManualAttention(jobId: string, code: string) {
  console.error("Identity deletion requires manual attention", {
    jobId,
    code,
  });
}

function runtimeValue(name: "SUPABASE_URL" | "SUPABASE_SECRET_KEY") {
  const runtime = getRuntimeEnv() as Record<string, unknown> | undefined;
  const value = runtime?.[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  return typeof process !== "undefined" ? process.env[name]?.trim() ?? "" : "";
}

function adminClient() {
  const url = runtimeValue("SUPABASE_URL");
  const secret = runtimeValue("SUPABASE_SECRET_KEY");
  if (!url || !secret) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return {
    issuer: `${new URL(url).origin}/auth/v1`,
    client: createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export async function processPendingIdentityDeletions(limit = 5) {
  const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const db = await ensureDatabase();
  const now = Math.floor(Date.now() / 1000);
  const provider = adminClient();
  await db
    .prepare(
      `DELETE FROM identity_deletion_jobs
       WHERE (status = 'completed' AND completed_at < ?)
          OR unixepoch(created_at) <= ?`,
    )
    .bind(
      now - COMPLETED_JOB_RETENTION_SECONDS,
      now - RAW_JOB_RETENTION_SECONDS,
    )
    .run();
  const jobs = await db
    .prepare(
      `SELECT id, issuer, subject, attempts FROM identity_deletion_jobs
       WHERE status = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at ASC LIMIT ?`,
    )
    .bind(now, boundedLimit)
    .all<DeletionJob>();

  let completed = 0;
  let manualAttention = 0;
  for (const job of jobs.results) {
    if (!provider) {
      const attempts = job.attempts + 1;
      const needsAttention = attempts >= MAX_AUTOMATIC_ATTEMPTS;
      const errorCode = needsAttention
        ? manualAttentionCode("PROVIDER_SETUP_PENDING")
        : "PROVIDER_SETUP_PENDING";
      await db
        .prepare(
          `UPDATE identity_deletion_jobs
           SET attempts = ?, next_attempt_at = ?, last_error_code = ?,
             updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
        )
        .bind(
          attempts,
          now + (needsAttention ? MANUAL_ATTENTION_DELAY_SECONDS : 60 * 60),
          errorCode,
          job.id,
        )
        .run();
      if (needsAttention) {
        manualAttention += 1;
        reportManualAttention(job.id, errorCode);
      }
      continue;
    }
    if (job.issuer !== provider.issuer) {
      const errorCode = manualAttentionCode("PROVIDER_ISSUER_MISMATCH");
      await db
        .prepare(
          `UPDATE identity_deletion_jobs
           SET attempts = attempts + 1, next_attempt_at = ?, last_error_code = ?,
             updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
        )
        .bind(now + MANUAL_ATTENTION_DELAY_SECONDS, errorCode, job.id)
        .run();
      manualAttention += 1;
      reportManualAttention(job.id, errorCode);
      continue;
    }
    try {
      const { error } = await provider.client.auth.admin.deleteUser(job.subject, false);
      const status = error && "status" in error ? Number(error.status) : 0;
      if (error && status !== 404) throw error;
      await db
        .prepare(
          `UPDATE identity_deletion_jobs
           SET status = 'completed', attempts = attempts + 1,
             completed_at = ?, next_attempt_at = ?, last_error_code = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(now, now, job.id)
        .run();
      completed += 1;
    } catch {
      const attempts = job.attempts + 1;
      const needsAttention = attempts >= MAX_AUTOMATIC_ATTEMPTS;
      const errorCode = needsAttention
        ? manualAttentionCode("PROVIDER_DELETE_FAILED")
        : "PROVIDER_DELETE_FAILED";
      const delay = needsAttention
        ? MANUAL_ATTENTION_DELAY_SECONDS
        : Math.min(24 * 60 * 60, 60 * 2 ** Math.min(job.attempts, 10));
      await db
        .prepare(
          `UPDATE identity_deletion_jobs
           SET attempts = ?, next_attempt_at = ?, last_error_code = ?,
             updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
        )
        .bind(attempts, now + delay, errorCode, job.id)
        .run();
      if (needsAttention) {
        manualAttention += 1;
        reportManualAttention(job.id, errorCode);
      }
    }
  }

  await db.batch([
    db
      .prepare(
        `DELETE FROM account_deletion_tombstones
         WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .bind(now),
    db
      .prepare(`DELETE FROM auth_audit_events WHERE created_at < ?`)
      .bind(now - 365 * 24 * 60 * 60),
    db
      .prepare(
        `DELETE FROM auth_sessions
         WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`,
      )
      .bind(now - 30 * 24 * 60 * 60, now - 30 * 24 * 60 * 60),
    db
      .prepare(
        `DELETE FROM auth_rate_limits
         WHERE bucket_key <> 'geocode-global-lease' AND expires_at < ?`,
      )
      .bind(now),
    db.prepare(`DELETE FROM geocode_cache WHERE expires_at <= ?`).bind(now),
  ]);
  return { attempted: jobs.results.length, completed, manualAttention };
}

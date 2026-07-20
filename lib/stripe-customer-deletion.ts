import { ensureDatabase } from "@/lib/database";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  deleteStripeCustomer,
  StripeApiError,
} from "@/lib/stripe-billing";

const MAX_ATTEMPTS = 12;
const CLAIM_SECONDS = 10 * 60;
const ATTENTION_RAW_ID_RETENTION_SECONDS = 90 * 24 * 60 * 60;
const COMPLETED_RETENTION_SECONDS = 365 * 24 * 60 * 60;

type StripeCustomerDeletionJob = {
  id: string;
  customer_id: string;
  attempts: number;
};

function stripeSecretKey() {
  const runtime = getRuntimeEnv()?.STRIPE_SECRET_KEY;
  if (typeof runtime === "string" && runtime.trim()) return runtime.trim();
  if (typeof process !== "undefined") {
    return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  }
  return "";
}

function retryDelaySeconds(attempt: number) {
  return Math.min(24 * 60 * 60, 60 * 2 ** Math.min(attempt, 10));
}

function providerErrorCode(error: unknown) {
  if (!(error instanceof StripeApiError)) return "STRIPE_DELETE_FAILED";
  if (error.status === 401 || error.status === 403) {
    return "STRIPE_CREDENTIALS_REJECTED";
  }
  if (error.status === 429) return "STRIPE_RATE_LIMITED";
  if (error.status >= 500) return "STRIPE_PROVIDER_UNAVAILABLE";
  return "STRIPE_DELETE_REJECTED";
}

function isPermanentProviderError(error: unknown) {
  return (
    error instanceof StripeApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 409 &&
    error.status !== 429
  );
}

function reportManualAttention(jobId: string, code: string) {
  console.error("Stripe customer deletion requires manual attention", {
    jobId,
    code,
  });
}

export async function processPendingStripeCustomerDeletions(limit = 5) {
  const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const db = await ensureDatabase();
  const now = Math.floor(Date.now() / 1000);
  const secretKey = stripeSecretKey();
  const jobs = await db
    .prepare(
      `SELECT id, customer_id, attempts
       FROM stripe_customer_deletion_jobs
       WHERE status = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at ASC LIMIT ?`,
    )
    .bind(now, boundedLimit)
    .all<StripeCustomerDeletionJob>();

  let completed = 0;
  let attention = 0;
  for (const job of jobs.results) {
    // Claim with a compare-and-set lease. Concurrent workers may select the
    // same row, but only one is allowed to call Stripe during this window.
    const claimed = await db
      .prepare(
        `UPDATE stripe_customer_deletion_jobs
         SET next_attempt_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending' AND next_attempt_at <= ?`,
      )
      .bind(now + CLAIM_SECONDS, job.id, now)
      .run();
    if ((claimed.meta.changes ?? 0) !== 1) continue;

    try {
      if (!secretKey) {
        throw new StripeApiError(
          "Stripe customer deletion is not configured.",
          503,
          "STRIPE_SETUP_PENDING",
        );
      }
      await deleteStripeCustomer(job.customer_id, secretKey);
      await db
        .prepare(
          `UPDATE stripe_customer_deletion_jobs
           SET status = 'completed', customer_id = NULL,
             attempts = attempts + 1, completed_at = ?, attention_at = NULL,
             next_attempt_at = ?, last_error_code = NULL,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(now, now, job.id)
        .run();
      completed += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const needsAttention =
        attempts >= MAX_ATTEMPTS || isPermanentProviderError(error);
      const code = providerErrorCode(error);
      await db
        .prepare(
          `UPDATE stripe_customer_deletion_jobs
           SET status = ?, attempts = ?, next_attempt_at = ?,
             last_error_code = ?, attention_at = ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(
          needsAttention ? "attention" : "pending",
          attempts,
          needsAttention ? now : now + retryDelaySeconds(attempts),
          code,
          needsAttention ? now : null,
          job.id,
        )
        .run();
      if (needsAttention) {
        attention += 1;
        reportManualAttention(job.id, code);
      }
    }
  }

  await db.batch([
    db
      .prepare(
        `UPDATE stripe_customer_deletion_jobs
         SET customer_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE status = 'attention' AND customer_id IS NOT NULL
           AND attention_at IS NOT NULL AND attention_at < ?`,
      )
      .bind(now - ATTENTION_RAW_ID_RETENTION_SECONDS),
    db
      .prepare(
        `DELETE FROM stripe_customer_deletion_jobs
         WHERE status = 'completed' AND completed_at < ?`,
      )
      .bind(now - COMPLETED_RETENTION_SECONDS),
  ]);

  return { attempted: jobs.results.length, completed, attention };
}

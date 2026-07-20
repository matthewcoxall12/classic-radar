import { cookies } from "next/headers";
import {
  clearAppSessionCookies,
  createDeletionReceipt,
  DELETION_RECEIPT_COOKIE,
  identityPrivacyHash,
  memberPrivacyHashes,
  requireFreshAuthentication,
  signOutRedirect,
} from "@/lib/app-auth";
import {
  jsonMemberError,
  jsonOk,
  MemberApiError,
  readMemberJson,
  requireMember,
} from "@/lib/member-data";
import { hmacIdentifier } from "@/lib/auth-security";
import {
  BillingConfigurationError,
  expireStripeCheckoutSession,
  getBillingConfig,
  markCheckoutSession,
  retrieveStripeCheckoutSession,
  StripeApiError,
  syncCheckoutSession,
} from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

const ENDED_BILLING_STATUSES = new Set([
  "canceled",
  "cancelled",
  "expired",
  "incomplete_expired",
]);

function stripeReferenceId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim()
  ) {
    return value.id.trim();
  }
  return null;
}

function activeBillingError() {
  return new MemberApiError(
    409,
    "BILLING_RELATIONSHIP_ACTIVE",
    "Cancel the active subscription in billing first. Payment records that must be retained are handled separately.",
  );
}

function billingReviewError() {
  return new MemberApiError(
    409,
    "BILLING_REVIEW_REQUIRED",
    "We could not safely reconcile this account's billing records. Contact support before deleting the account.",
  );
}

function addStripeCustomerId(target: Set<string>, value: string | null) {
  if (value === null) return;
  const normalized = value.trim();
  if (!normalized) throw billingReviewError();
  target.add(normalized);
}

export async function POST(request: Request) {
  try {
    const { db, member, user } = await requireMember(request);
    requireFreshAuthentication(user);
    const body = await readMemberJson(request);
    if (body.confirmation !== "DELETE") {
      throw new MemberApiError(
        400,
        "CONFIRMATION_REQUIRED",
        "Type DELETE to confirm permanent account deletion.",
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const hasLiveSubscription = Boolean(
      member.stripe_subscription_id &&
      (!member.subscription_status || !ENDED_BILLING_STATUSES.has(member.subscription_status)),
    );
    const subscriptionRows = await db
      .prepare(
        `SELECT customer_id, status FROM stripe_subscriptions
         WHERE member_email = ?`,
      )
      .bind(member.email)
      .all<{ customer_id: string | null; status: string }>();
    if (
      hasLiveSubscription ||
      subscriptionRows.results.some(
        (subscription) => !ENDED_BILLING_STATUSES.has(subscription.status),
      )
    ) {
      throw activeBillingError();
    }

    const activeCheckout = await db
      .prepare(
        `SELECT session_id, state, lease_expires_at, session_expires_at
         FROM stripe_checkout_sessions
         WHERE member_email = ? AND (
           (state = 'open'
             AND (session_expires_at IS NULL OR session_expires_at > ?))
           OR (state IN ('creating', 'replacing')
             AND lease_expires_at IS NOT NULL AND lease_expires_at > ?)
         )
         LIMIT 1`,
      )
      .bind(member.email, now, now)
      .first<{
        session_id: string | null;
        state: string;
        lease_expires_at: number | null;
        session_expires_at: number | null;
      }>();
    if (
      activeCheckout &&
      (activeCheckout.state === "creating" || activeCheckout.state === "replacing")
    ) {
      throw new MemberApiError(
        409,
        "BILLING_CHECKOUT_IN_PROGRESS",
        "A billing checkout is still being prepared. Wait a moment, then try deleting the account again.",
      );
    }

    let checkoutCustomerId: string | null = null;
    if (activeCheckout?.state === "open") {
      if (!activeCheckout.session_id) throw billingReviewError();
      try {
        const config = getBillingConfig("portal");
        const checkout = await retrieveStripeCheckoutSession(
          activeCheckout.session_id,
          config.secretKey,
        );
        checkoutCustomerId = stripeReferenceId(checkout.customer);
        if (checkout.status === "open") {
          const expiredCheckout = await expireStripeCheckoutSession(
            checkout.id,
            config.secretKey,
            `account-deletion-${checkout.id}`,
          );
          checkoutCustomerId =
            stripeReferenceId(expiredCheckout.customer) ?? checkoutCustomerId;
          await markCheckoutSession(checkout.id, "expired");
        } else if (checkout.status === "expired") {
          await markCheckoutSession(checkout.id, "expired");
        } else if (checkout.status === "complete") {
          await syncCheckoutSession(checkout, config.secretKey);
          await markCheckoutSession(checkout.id, "completed");
          throw activeBillingError();
        } else {
          throw billingReviewError();
        }
      } catch (error) {
        if (error instanceof MemberApiError) throw error;
        if (error instanceof BillingConfigurationError) {
          throw new MemberApiError(
            503,
            "BILLING_UNAVAILABLE",
            "Billing verification is temporarily unavailable. Please try deleting the account again soon.",
          );
        }
        if (error instanceof StripeApiError) {
          throw new MemberApiError(
            502,
            "BILLING_PROVIDER_ERROR",
            "Stripe could not verify the pending checkout. Please try deleting the account again.",
          );
        }
        throw new MemberApiError(
          503,
          "BILLING_UNAVAILABLE",
          "Billing verification is temporarily unavailable. Please try deleting the account again soon.",
        );
      }
    }

    const stripeCustomerIds = new Set<string>();
    addStripeCustomerId(stripeCustomerIds, member.stripe_customer_id);
    addStripeCustomerId(stripeCustomerIds, checkoutCustomerId);
    for (const subscription of subscriptionRows.results) {
      addStripeCustomerId(stripeCustomerIds, subscription.customer_id);
    }
    if (stripeCustomerIds.size > 1) throw billingReviewError();
    const stripeCustomerId = stripeCustomerIds.values().next().value ?? null;

    const identities = await db
      .prepare(
        `SELECT issuer, subject, provider FROM auth_identities WHERE member_id = ?`,
      )
      .bind(member.id)
      .all<{ issuer: string; subject: string; provider: string }>();

    const hashes = await memberPrivacyHashes(user);
    const deletionId = `del_${crypto.randomUUID()}`;
    const deletionExpiresAt = now + 3 * 365 * 24 * 60 * 60;
    const stripeCustomerHash = stripeCustomerId
      ? await hmacIdentifier(`stripe-customer:${stripeCustomerId}`)
      : null;
    const identityHashes = new Set<string>([hashes.identityHash]);
    for (const identity of identities.results) {
      identityHashes.add(await identityPrivacyHash(identity.issuer, identity.subject));
    }
    const jobIds: string[] = [];
    const statements = [
      db
        .prepare(
          `INSERT INTO auth_audit_events (
             id, member_id, event_type, provider, session_id, created_at
           ) VALUES (?, ?, 'account_deleted', ?, ?, ?)`,
        )
        .bind(
          `aud_${crypto.randomUUID()}`,
          member.id,
          user.provider,
          user.sessionId,
          now,
        ),
      ...Array.from(identityHashes).map((identityHash, index) =>
        db
          .prepare(
            `INSERT INTO account_deletion_tombstones (
               id, member_hash, identity_hash, email_hash, expires_at
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            index === 0 ? deletionId : `del_${crypto.randomUUID()}`,
            hashes.memberHash,
            identityHash,
            hashes.emailHash,
            deletionExpiresAt,
          ),
      ),
      db
        .prepare(`DELETE FROM event_submissions WHERE email = ? COLLATE NOCASE`)
        .bind(member.email),
      db
        .prepare(
          `DELETE FROM partner_enquiries
           WHERE email = ? COLLATE NOCASE AND organisation_name <> 'Privacy request'`,
        )
        .bind(member.email),
      db
        .prepare(
          `UPDATE partner_enquiries
           SET contact_name = 'Deleted account',
             email = ?, website = '',
             message = 'Request content erased after verified account deletion.',
             status = 'closed', internal_notes = '',
             assigned_to = '', updated_at = CURRENT_TIMESTAMP
           WHERE email = ? COLLATE NOCASE AND organisation_name = 'Privacy request'`,
        )
        .bind(
          `deleted+${hashes.emailHash.slice(0, 20)}@invalid.example`,
          member.email,
        ),
      db
        .prepare(
          `UPDATE privacy_requests
           SET contact_name = 'Deleted account', email = ?,
             message = 'Request content erased after verified account deletion.',
             status = 'completed', internal_notes = '',
             assigned_to = '', updated_at = CURRENT_TIMESTAMP
           WHERE email = ? COLLATE NOCASE`,
        )
        .bind(
          `deleted+${hashes.emailHash.slice(0, 20)}@invalid.example`,
          member.email,
        ),
      ...(stripeCustomerId && stripeCustomerHash
        ? [
            db
              .prepare(
                `INSERT INTO stripe_customer_deletion_jobs (
                   id, customer_id, customer_hash, email_hash, next_attempt_at
                 ) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(customer_hash) DO UPDATE SET
                   id = excluded.id, customer_id = excluded.customer_id,
                   email_hash = excluded.email_hash, status = 'pending', attempts = 0,
                   next_attempt_at = excluded.next_attempt_at,
                   last_error_code = NULL, attention_at = NULL, completed_at = NULL,
                   created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
              )
              .bind(
                `scdj_${crypto.randomUUID()}`,
                stripeCustomerId,
                stripeCustomerHash,
                hashes.emailHash,
                now,
              ),
          ]
        : []),
      db.prepare(`DELETE FROM members WHERE id = ?`).bind(member.id),
    ];
    for (const identity of identities.results) {
      if (!identity.issuer.endsWith("/auth/v1")) continue;
      const jobId = `idj_${crypto.randomUUID()}`;
      jobIds.push(jobId);
      statements.splice(
        statements.length - 1,
        0,
        db
          .prepare(
            `INSERT INTO identity_deletion_jobs (
               id, issuer, subject, provider, email_hash, next_attempt_at
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(issuer, subject) DO UPDATE SET
               id = excluded.id, provider = excluded.provider,
               status = 'pending', attempts = 0,
               email_hash = excluded.email_hash,
               next_attempt_at = excluded.next_attempt_at,
               last_error_code = NULL, completed_at = NULL,
               created_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            jobId,
            identity.issuer,
            identity.subject,
            identity.provider,
            hashes.emailHash,
            now,
          ),
      );
    }
    const identityDeletionPending = jobIds.length > 0;
    const providerCleanupPending =
      identityDeletionPending || Boolean(stripeCustomerId);
    const receipt = await createDeletionReceipt(deletionId, providerCleanupPending);
    try {
      await db.batch(statements);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("members_billing_relationship_active")
      ) {
        throw new MemberApiError(
          409,
          "BILLING_RELATIONSHIP_ACTIVE",
          "Cancel the active subscription or checkout in billing first. Payment records that must be retained are handled separately.",
        );
      }
      throw error;
    }
    const cookieStore = await cookies();
    clearAppSessionCookies(cookieStore);
    cookieStore.set(DELETION_RECEIPT_COOKIE, receipt, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
    const completionPath = "/account-deleted";
    return jsonOk({
      deleted: true,
      identityDeletionPending,
      providerCleanupPending,
      redirectTo: signOutRedirect(completionPath),
    });
  } catch (error) {
    return jsonMemberError(error);
  }
}

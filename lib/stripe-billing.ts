import { ensureDatabase } from "@/lib/database";
import { hmacIdentifier } from "@/lib/auth-security";
import {
  getRuntimeEnv,
  type RuntimeBindings,
} from "@/lib/runtime-env";

const STRIPE_API_ORIGIN = "https://api.stripe.com";
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
// The Sites/D1 billing ledger has not yet been migrated to Supabase. Keep every
// billing entry point closed even if stale Stripe variables remain in Vercel.
const SUPABASE_BILLING_STORAGE_READY = false;

export type BillingPlan = "monthly" | "annual" | "founding";
export type BillingPurpose = "checkout" | "portal" | "webhook";

export type BillingConfig = {
  secretKey: string;
  webhookSecret: string | null;
  priceMonthly: string | null;
  priceAnnual: string | null;
  foundingCouponId: string | null;
  siteUrl: string;
};

type StripeObjectReference = string | { id?: string } | null;

type StripeCustomer = {
  id: string;
  email?: string | null;
  metadata?: Record<string, string>;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  status?: string;
  expires_at?: number;
  customer?: StripeObjectReference;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  client_reference_id?: string | null;
  subscription?: StripeObjectReference;
  payment_status?: string;
  metadata?: Record<string, string>;
};

export type StripeSubscription = {
  id: string;
  customer?: StripeObjectReference;
  status: string;
  current_period_end?: number;
  cancel_at?: number | null;
  ended_at?: number | null;
  metadata?: Record<string, string>;
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: { id?: string };
    }>;
  };
};

export type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data?: { object?: unknown };
};

type CheckoutReservationRow = {
  member_email: string;
  session_id: string | null;
  session_url: string | null;
  plan: BillingPlan;
  state: string;
  attempt_token: string | null;
  lease_token: string | null;
  lease_expires_at: number | null;
  session_expires_at: number | null;
};

export type CheckoutReservation =
  | { kind: "reuse"; sessionId: string; url: string }
  | { kind: "busy" }
  | {
      kind: "create";
      leaseToken: string;
      attemptToken: string;
      sessionExpiresAt: number;
    }
  | {
      kind: "replace";
      leaseToken: string;
      attemptToken: string;
      sessionExpiresAt: number;
      previousSessionId: string;
    };

export class BillingConfigurationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Billing setup is pending: ${missing.join(", ")}`);
    this.name = "BillingConfigurationError";
  }
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

function readBinding(name: keyof RuntimeBindings): string {
  const runtimeValue = getRuntimeEnv()?.[name];
  if (typeof runtimeValue === "string" && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  if (typeof process !== "undefined") {
    const processValue = process.env[name];
    if (typeof processValue === "string" && processValue.trim()) {
      return processValue.trim();
    }
  }

  return "";
}

export function getBillingConfig(
  purpose: BillingPurpose,
  plan?: BillingPlan,
): BillingConfig {
  const secretKey = readBinding("STRIPE_SECRET_KEY");
  const webhookSecret = readBinding("STRIPE_WEBHOOK_SECRET");
  const priceMonthly = readBinding("STRIPE_PRICE_MONTHLY");
  const priceAnnual = readBinding("STRIPE_PRICE_ANNUAL");
  const foundingCouponId = readBinding("STRIPE_FOUNDING_COUPON_ID");
  const rawSiteUrl = readBinding("SITE_URL");
  const missing: string[] = [];

  if (!SUPABASE_BILLING_STORAGE_READY) {
    missing.push("Supabase billing storage migration");
  }

  if (!secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!rawSiteUrl) missing.push("SITE_URL");
  if (purpose === "webhook" && !webhookSecret) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }
  if (purpose === "checkout") {
    if (plan === "monthly" && !priceMonthly) {
      missing.push("STRIPE_PRICE_MONTHLY");
    }
    if (plan === "annual" && !priceAnnual) {
      missing.push("STRIPE_PRICE_ANNUAL");
    }
    if (plan === "founding") {
      if (!priceAnnual) missing.push("STRIPE_PRICE_ANNUAL");
      if (!foundingCouponId) missing.push("STRIPE_FOUNDING_COUPON_ID");
    }
  }

  let siteUrl = "";
  if (rawSiteUrl) {
    try {
      const parsed = new URL(rawSiteUrl);
      const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
        throw new Error();
      }
      siteUrl = parsed.origin;
    } catch {
      missing.push("SITE_URL (valid HTTPS origin)");
    }
  }

  if (missing.length) throw new BillingConfigurationError(missing);

  return {
    secretKey,
    webhookSecret: webhookSecret || null,
    priceMonthly: priceMonthly || null,
    priceAnnual: priceAnnual || null,
    foundingCouponId: foundingCouponId || null,
    siteUrl,
  };
}

export function billingLaunchReady(): boolean {
  try {
    getBillingConfig("checkout", "monthly");
    getBillingConfig("checkout", "annual");
    getBillingConfig("checkout", "founding");
    getBillingConfig("webhook");
    return true;
  } catch {
    return false;
  }
}

export function billingPortalReady(): boolean {
  try {
    getBillingConfig("portal");
    return true;
  } catch {
    return false;
  }
}

export function getPlanPrice(config: BillingConfig, plan: BillingPlan): string {
  const price =
    plan === "monthly"
      ? config.priceMonthly
      : config.priceAnnual;

  if (!price) {
    const name =
      plan === "monthly" ? "STRIPE_PRICE_MONTHLY" : "STRIPE_PRICE_ANNUAL";
    throw new BillingConfigurationError([name]);
  }
  return price;
}

export function billingUnavailableResponse(_error: BillingConfigurationError) {
  void _error;
  return Response.json(
    {
      ok: false,
      error: {
        message: "Billing setup is pending. Please try again soon.",
        code: "BILLING_SETUP_PENDING",
      },
    },
    { status: 503 },
  );
}

export function billingErrorResponse(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers },
  );
}

export function billingSuccessResponse(data: Record<string, unknown>) {
  return Response.json({ ok: true, data });
}

async function parseStripeResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string; code?: string } })
    | null;

  if (!response.ok || !data) {
    throw new StripeApiError(
      data?.error?.message ?? "Stripe could not complete the billing request.",
      response.status,
      data?.error?.code ?? null,
    );
  }

  return data;
}

export async function stripePost<T>(
  path: string,
  secretKey: string,
  params: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(`${STRIPE_API_ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: params,
  });
  return parseStripeResponse<T>(response);
}

export async function stripeGet<T>(
  path: string,
  secretKey: string,
): Promise<T> {
  const response = await fetch(`${STRIPE_API_ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  return parseStripeResponse<T>(response);
}

export async function deleteStripeCustomer(
  customerId: string,
  secretKey: string,
): Promise<void> {
  const response = await fetch(
    `${STRIPE_API_ORIGIN}/v1/customers/${encodeURIComponent(customerId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secretKey}` },
    },
  );
  // Deletion is idempotent from the application's perspective. A missing
  // customer is already in the desired state.
  if (response.status === 404) return;
  await parseStripeResponse<{ id: string; deleted: boolean }>(response);
}

export async function saveStripeCustomer(
  email: string,
  customerId: string,
): Promise<void> {
  const db = await ensureDatabase();
  await db
    .prepare(
      `UPDATE members
       SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE email = ?`,
    )
    .bind(customerId, email.toLowerCase())
    .run();
}

async function checkoutReservationRow(email: string) {
  const db = await ensureDatabase();
  return db
    .prepare(
      `SELECT member_email, session_id, session_url, plan, state,
        attempt_token, lease_token, lease_expires_at, session_expires_at
       FROM stripe_checkout_sessions WHERE member_email = ?`,
    )
    .bind(email.toLowerCase())
    .first<CheckoutReservationRow>();
}

export async function reserveCheckoutSession(
  email: string,
  plan: BillingPlan,
): Promise<CheckoutReservation> {
  const normalizedEmail = email.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = now + 5 * 60;
  const attemptToken = crypto.randomUUID();
  // Stripe accepts an explicit Checkout expiry between 30 minutes and 24 hours.
  // Persisting it with the attempt keeps every idempotent retry byte-for-byte stable.
  const sessionExpiresAt = now + 23 * 60 * 60;
  const existing = await checkoutReservationRow(normalizedEmail);
  const recoverableSessionExpiresAt = existing?.session_expires_at;

  if (
    existing?.state === "open" &&
    (existing.session_expires_at ?? 0) > now &&
    existing.plan === plan &&
    existing.session_id &&
    existing.session_url
  ) {
    return {
      kind: "reuse",
      sessionId: existing.session_id,
      url: existing.session_url,
    };
  }

  const db = await ensureDatabase();
  if (
    existing?.state === "open" &&
    (existing.session_expires_at ?? 0) > now &&
    existing.session_id
  ) {
    const replacement = await db
      .prepare(
        `UPDATE stripe_checkout_sessions
         SET plan = ?, state = 'replacing', attempt_token = ?,
             lease_token = ?, lease_expires_at = ?, session_expires_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE member_email = ? AND state = 'open' AND session_id = ?
           AND COALESCE(session_expires_at, 0) > ?`,
      )
      .bind(
        plan,
        attemptToken,
        leaseToken,
        leaseExpiresAt,
        sessionExpiresAt,
        normalizedEmail,
        existing.session_id,
        now,
      )
      .run();
    if ((replacement.meta.changes ?? 0) > 0) {
      return {
        kind: "replace",
        leaseToken,
        attemptToken,
        sessionExpiresAt,
        previousSessionId: existing.session_id,
      };
    }
    return { kind: "busy" };
  }

  if (
    (existing?.state === "creating" || existing?.state === "replacing") &&
    (existing.lease_expires_at ?? 0) > now
  ) {
    return { kind: "busy" };
  }

  if (
    (existing?.state === "creating" || existing?.state === "replacing") &&
    existing.plan === plan &&
    existing.attempt_token &&
    typeof recoverableSessionExpiresAt === "number" &&
    recoverableSessionExpiresAt > now + 30 * 60 &&
    (existing.lease_expires_at ?? 0) <= now
  ) {
    const recovered = await db
      .prepare(
        `UPDATE stripe_checkout_sessions
         SET lease_token = ?, lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE member_email = ? AND state = ? AND plan = ?
           AND attempt_token = ?
           AND COALESCE(lease_expires_at, 0) <= ?
           AND session_expires_at = ?`,
      )
      .bind(
        leaseToken,
        leaseExpiresAt,
        normalizedEmail,
        existing.state,
        plan,
        existing.attempt_token,
        now,
        recoverableSessionExpiresAt,
      )
      .run();
    if ((recovered.meta.changes ?? 0) > 0) {
      if (existing.state === "replacing" && existing.session_id) {
        return {
          kind: "replace",
          leaseToken,
          attemptToken: existing.attempt_token,
          sessionExpiresAt: recoverableSessionExpiresAt,
          previousSessionId: existing.session_id,
        };
      }
      if (existing.state === "creating") {
        return {
          kind: "create",
          leaseToken,
          attemptToken: existing.attempt_token,
          sessionExpiresAt: recoverableSessionExpiresAt,
        };
      }
    }
    return { kind: "busy" };
  }

  const claimed = await db
    .prepare(
      `INSERT INTO stripe_checkout_sessions (
         member_email, plan, state, attempt_token, lease_token,
         lease_expires_at, session_expires_at
       ) VALUES (?, ?, 'creating', ?, ?, ?, ?)
       ON CONFLICT(member_email) DO UPDATE SET
         session_id = NULL,
         session_url = NULL,
         plan = excluded.plan,
         state = 'creating',
         attempt_token = excluded.attempt_token,
         lease_token = excluded.lease_token,
         lease_expires_at = excluded.lease_expires_at,
         session_expires_at = excluded.session_expires_at,
         updated_at = CURRENT_TIMESTAMP
       WHERE stripe_checkout_sessions.state IN ('completed', 'expired')
          OR (
            stripe_checkout_sessions.state IN ('creating', 'replacing')
            AND stripe_checkout_sessions.session_expires_at IS NOT NULL
            AND stripe_checkout_sessions.session_expires_at <= ?
          )
          OR (
            stripe_checkout_sessions.state = 'open'
            AND COALESCE(stripe_checkout_sessions.session_expires_at, 0) <= ?
          )
          OR (
            stripe_checkout_sessions.state = 'failed'
            AND stripe_checkout_sessions.session_expires_at IS NOT NULL
            AND stripe_checkout_sessions.session_expires_at <= ?
          )`,
    )
    .bind(
      normalizedEmail,
      plan,
      attemptToken,
      leaseToken,
      leaseExpiresAt,
      sessionExpiresAt,
      now,
      now,
      now,
    )
    .run();
  if ((claimed.meta.changes ?? 0) > 0) {
    return {
      kind: "create",
      leaseToken,
      attemptToken,
      sessionExpiresAt,
    };
  }

  const current = await checkoutReservationRow(normalizedEmail);
  if (
    current?.state === "open" &&
    (current.session_expires_at ?? 0) > now &&
    current.plan === plan &&
    current.session_id &&
    current.session_url
  ) {
    return {
      kind: "reuse",
      sessionId: current.session_id,
      url: current.session_url,
    };
  }
  return { kind: "busy" };
}

export async function activateCheckoutSession(input: {
  email: string;
  leaseToken: string;
  attemptToken: string;
  session: StripeCheckoutSession;
  plan: BillingPlan;
}): Promise<void> {
  if (!input.session.url) {
    throw new StripeApiError("Stripe did not return a checkout URL.", 502, null);
  }
  const db = await ensureDatabase();
  const result = await db
    .prepare(
      `UPDATE stripe_checkout_sessions
       SET session_id = ?, session_url = ?, plan = ?, state = 'open',
           lease_token = NULL, lease_expires_at = NULL,
           session_expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE member_email = ? AND lease_token = ? AND attempt_token = ?
         AND state IN ('creating', 'replacing')`,
    )
    .bind(
      input.session.id,
      input.session.url,
      input.plan,
      input.session.expires_at ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      input.email.toLowerCase(),
      input.leaseToken,
      input.attemptToken,
    )
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error("The checkout reservation expired before it could be saved.");
  }
}

export async function failCheckoutReservation(
  email: string,
  leaseToken: string,
): Promise<void> {
  const db = await ensureDatabase();
  await db
    .prepare(
      `UPDATE stripe_checkout_sessions
       SET state = 'failed', lease_token = NULL, lease_expires_at = NULL,
           session_expires_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE member_email = ? AND lease_token = ?
         AND state IN ('creating', 'replacing')`,
    )
    .bind(Math.floor(Date.now() / 1000), email.toLowerCase(), leaseToken)
    .run();
}

export async function markCheckoutSession(
  sessionId: string,
  state: "completed" | "expired",
): Promise<void> {
  const db = await ensureDatabase();
  await db
    .prepare(
      `UPDATE stripe_checkout_sessions
       SET state = ?, session_url = NULL,
           lease_token = NULL, lease_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
    )
    .bind(state, sessionId)
    .run();
}

export async function createStripeCustomer(input: {
  secretKey: string;
  email: string;
  name: string;
}): Promise<StripeCustomer> {
  const params = new URLSearchParams({
    email: input.email,
    name: input.name,
    "metadata[user_email]": input.email,
    "metadata[source]": "classic_motoring_events",
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.email.toLowerCase()),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return stripePost<StripeCustomer>(
    "/v1/customers",
    input.secretKey,
    params,
    `classic-motoring-customer-${hash}`,
  );
}

export async function createCheckoutSession(input: {
  config: BillingConfig;
  customerId: string;
  email: string;
  plan: BillingPlan;
  idempotencyKey: string;
  expiresAt: number;
}): Promise<StripeCheckoutSession> {
  const price = getPlanPrice(input.config, input.plan);
  const params = new URLSearchParams({
    mode: "subscription",
    customer: input.customerId,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${input.config.siteUrl}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.config.siteUrl}/membership?checkout=cancelled`,
    client_reference_id: input.email,
    "metadata[user_email]": input.email,
    "metadata[plan]": input.plan,
    "subscription_data[metadata][user_email]": input.email,
    "subscription_data[metadata][plan]": input.plan,
    billing_address_collection: "auto",
    expires_at: String(input.expiresAt),
  });

  if (input.plan === "founding") {
    if (!input.config.foundingCouponId) {
      throw new BillingConfigurationError(["STRIPE_FOUNDING_COUPON_ID"]);
    }
    params.set("discounts[0][coupon]", input.config.foundingCouponId);
  } else {
    params.set("allow_promotion_codes", "true");
  }

  return stripePost<StripeCheckoutSession>(
    "/v1/checkout/sessions",
    input.config.secretKey,
    params,
    `classic-motoring-checkout-${input.idempotencyKey}`,
  );
}

export async function expireStripeCheckoutSession(
  sessionId: string,
  secretKey: string,
  idempotencyKey: string,
): Promise<StripeCheckoutSession> {
  return stripePost<StripeCheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    secretKey,
    new URLSearchParams(),
    `classic-motoring-expire-${idempotencyKey}`,
  );
}

export async function createPortalSession(input: {
  config: BillingConfig;
  customerId: string;
}): Promise<{ id: string; url: string }> {
  return stripePost<{ id: string; url: string }>(
    "/v1/billing_portal/sessions",
    input.config.secretKey,
    new URLSearchParams({
      customer: input.customerId,
      return_url: `${input.config.siteUrl}/account`,
    }),
  );
}

function referenceId(value: StripeObjectReference | undefined): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function epochToIso(value: number | null | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function subscriptionPeriodEnd(subscription: StripeSubscription): string | null {
  const itemEnds =
    subscription.items?.data
      ?.map((item) => item.current_period_end)
      .filter((value): value is number => typeof value === "number") ?? [];
  const periodEnd =
    itemEnds.length > 0
      ? Math.max(...itemEnds)
      : subscription.current_period_end ??
        subscription.cancel_at ??
        subscription.ended_at;
  return epochToIso(periodEnd);
}

function hasRoadbookAccess(status: string, periodEnd?: string | null): boolean {
  if (status === "active") return true;
  if (status === "trialing") {
    if (!periodEnd) return true;
    const trialEnd = new Date(periodEnd).getTime();
    return Number.isFinite(trialEnd) && Date.now() < trialEnd;
  }
  if (status !== "past_due" || !periodEnd) return false;
  const end = new Date(periodEnd).getTime();
  return Number.isFinite(end) && Date.now() < end + 7 * 24 * 60 * 60 * 1000;
}

async function findMemberEmail(input: {
  email?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  checkoutSessionId?: string | null;
}): Promise<string | null> {
  const db = await ensureDatabase();

  // A persisted Checkout reservation is the strongest association because it
  // was created by an authenticated member before Stripe was contacted.
  if (input.checkoutSessionId) {
    const reservation = await db
      .prepare(
        `SELECT s.member_email AS email
         FROM stripe_checkout_sessions s
         JOIN members m ON m.email = s.member_email
         WHERE s.session_id = ? LIMIT 1`,
      )
      .bind(input.checkoutSessionId)
      .first<{ email: string }>();
    if (reservation?.email) return reservation.email;
  }

  if (input.customerId) {
    const member = await db
      .prepare("SELECT email FROM members WHERE stripe_customer_id = ? LIMIT 1")
      .bind(input.customerId)
      .first<{ email: string }>();
    if (member?.email) return member.email;
  }

  if (input.subscriptionId) {
    const member = await db
      .prepare("SELECT email FROM members WHERE stripe_subscription_id = ? LIMIT 1")
      .bind(input.subscriptionId)
      .first<{ email: string }>();
    if (member?.email) return member.email;
  }

  if (input.email) {
    const normalized = input.email.trim().toLowerCase();
    const member = await db
      .prepare("SELECT email FROM members WHERE email = ? COLLATE NOCASE LIMIT 1")
      .bind(normalized)
      .first<{ email: string }>();
    return member?.email ?? null;
  }

  return null;
}

async function stripeCustomerDeletionQueued(customerId: string | null) {
  if (!customerId) return false;
  const db = await ensureDatabase();
  const customerHash = await hmacIdentifier(`stripe-customer:${customerId}`);
  const queued = await db
    .prepare(
      `SELECT id FROM stripe_customer_deletion_jobs
       WHERE customer_hash = ? LIMIT 1`,
    )
    .bind(customerHash)
    .first<{ id: string }>();
  return Boolean(queued);
}

async function customerEmail(
  customerId: string | null,
  secretKey: string,
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const customer = await stripeGet<StripeCustomer>(
      `/v1/customers/${encodeURIComponent(customerId)}`,
      secretKey,
    );
    return customer.metadata?.user_email ?? customer.email ?? null;
  } catch (error) {
    // A queued account erasure may have already removed the Stripe customer.
    // Treat that terminal state as an unresolvable association, not a webhook
    // failure that Stripe should retry forever.
    if (error instanceof StripeApiError && error.status === 404) return null;
    throw error;
  }
}

export async function retrieveStripeSubscription(
  subscriptionId: string,
  secretKey: string,
): Promise<StripeSubscription> {
  return stripeGet<StripeSubscription>(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    secretKey,
  );
}

export async function retrieveStripeCheckoutSession(
  sessionId: string,
  secretKey: string,
): Promise<StripeCheckoutSession> {
  return stripeGet<StripeCheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    secretKey,
  );
}

export async function syncCheckoutSession(
  session: StripeCheckoutSession,
  secretKey: string,
): Promise<void> {
  const customerId = referenceId(session.customer);
  const subscriptionId = referenceId(session.subscription);
  if (await stripeCustomerDeletionQueued(customerId)) return;
  const suppliedEmail =
    session.metadata?.user_email ??
    session.client_reference_id ??
    session.customer_details?.email ??
    session.customer_email ??
    null;
  let email = await findMemberEmail({
      checkoutSessionId: session.id,
      email: suppliedEmail,
      customerId,
      subscriptionId,
    });
  if (!email) {
    const providerEmail = await customerEmail(customerId, secretKey);
    email = await findMemberEmail({ email: providerEmail });
  }

  if (!email) return;

  const db = await ensureDatabase();
  await db
    .prepare(
      `UPDATE members SET
         stripe_customer_id = COALESCE(stripe_customer_id, ?),
         stripe_subscription_id = COALESCE(stripe_subscription_id, ?),
         subscription_status = CASE
           WHEN ? IS NOT NULL
             AND (
               subscription_status IS NULL
               OR subscription_status IN ('expired', 'unpaid', 'canceled', 'cancelled')
             ) THEN 'pending'
           ELSE subscription_status
         END,
         updated_at = CURRENT_TIMESTAMP
       WHERE email = ?
         AND (? IS NULL OR stripe_customer_id IS NULL OR stripe_customer_id = ?)`,
    )
    .bind(
      customerId,
      subscriptionId,
      subscriptionId,
      email.toLowerCase(),
      customerId,
      customerId,
    )
    .run();
}

export async function refreshMemberStripeEntitlement(
  email: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const db = await ensureDatabase();
  const canonical = await db
    .prepare(
      `SELECT id, status, period_end
       FROM stripe_subscriptions
       WHERE member_email = ?
       ORDER BY
         CASE
           WHEN status = 'active' THEN 0
           WHEN status = 'trialing'
             AND (period_end IS NULL OR datetime(period_end) > datetime('now')) THEN 0
           WHEN status = 'past_due'
             AND period_end IS NOT NULL
             AND datetime(period_end, '+7 days') > datetime('now') THEN 1
           ELSE 2
         END,
         COALESCE(period_end, '') DESC,
         last_event_created DESC
       LIMIT 1`,
    )
    .bind(normalizedEmail)
    .first<{ id: string; status: string; period_end: string | null }>();

  if (!canonical) return;

  await db
    .prepare(
      `UPDATE members
       SET tier = ?, stripe_subscription_id = ?, subscription_status = ?,
           subscription_expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE email = ?`,
    )
    .bind(
      hasRoadbookAccess(canonical.status, canonical.period_end) ? "roadbook" : "free",
      canonical.id,
      canonical.status,
      canonical.period_end,
      normalizedEmail,
    )
    .run();
}

export async function syncSubscription(
  subscription: StripeSubscription,
  secretKey: string,
  eventCreated = 0,
): Promise<void> {
  const customerId = referenceId(subscription.customer);
  if (await stripeCustomerDeletionQueued(customerId)) return;
  const suppliedEmail = subscription.metadata?.user_email ?? null;
  let email = await findMemberEmail({
      email: suppliedEmail,
      customerId,
      subscriptionId: subscription.id,
    });
  if (!email) {
    const providerEmail = await customerEmail(customerId, secretKey);
    email = await findMemberEmail({ email: providerEmail });
  }

  if (!email) return;

  const normalizedEmail = email.toLowerCase();
  const periodEnd = subscriptionPeriodEnd(subscription);
  const lastEventCreated = Math.max(0, Math.trunc(eventCreated));
  const db = await ensureDatabase();
  await db.batch([
    db
      .prepare(
        `UPDATE members SET
           stripe_customer_id = COALESCE(stripe_customer_id, ?),
           updated_at = CURRENT_TIMESTAMP
         WHERE email = ?
           AND (? IS NULL OR stripe_customer_id IS NULL OR stripe_customer_id = ?)`,
      )
      .bind(customerId, normalizedEmail, customerId, customerId),
    db
      .prepare(
        `INSERT INTO stripe_subscriptions (
           id, member_email, customer_id, status, period_end, last_event_created
         )
         SELECT ?, m.email, ?, ?, ?, ?
         FROM members m
         WHERE m.email = ?
           AND (? IS NULL OR m.stripe_customer_id IS NULL OR m.stripe_customer_id = ?)
       ON CONFLICT(id) DO UPDATE SET
         member_email = excluded.member_email,
         customer_id = COALESCE(excluded.customer_id, stripe_subscriptions.customer_id),
         status = excluded.status,
         period_end = excluded.period_end,
         last_event_created = MAX(
           excluded.last_event_created,
           stripe_subscriptions.last_event_created
         ),
         updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscriptions.member_email = excluded.member_email`,
      )
      .bind(
        subscription.id,
        customerId,
        subscription.status,
        periodEnd,
        lastEventCreated,
        normalizedEmail,
        customerId,
        customerId,
      ),
  ]);

  await refreshMemberStripeEntitlement(normalizedEmail);
}

export type StripeEventClaim = "claimed" | "processed" | "busy";

export async function claimStripeEvent(event: StripeEvent): Promise<StripeEventClaim> {
  const db = await ensureDatabase();
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO stripe_webhook_events (
         id, event_type, event_created, status, attempts
       ) VALUES (?, ?, ?, 'processing', 1)`,
    )
    .bind(event.id, event.type, Math.max(0, Math.trunc(event.created ?? 0)))
    .run();

  if ((inserted.meta.changes ?? 0) > 0) return "claimed";

  const existing = await db
    .prepare(`SELECT status FROM stripe_webhook_events WHERE id = ?`)
    .bind(event.id)
    .first<{ status: string }>();
  if (existing?.status === "processed") return "processed";

  const reclaimed = await db
    .prepare(
      `UPDATE stripe_webhook_events
       SET status = 'processing', attempts = attempts + 1,
           started_at = CURRENT_TIMESTAMP, processed_at = NULL
       WHERE id = ? AND status = 'processing'
         AND started_at < datetime('now', '-10 minutes')`,
    )
    .bind(event.id)
    .run();
  return (reclaimed.meta.changes ?? 0) > 0 ? "claimed" : "busy";
}

export async function completeStripeEvent(eventId: string): Promise<void> {
  const db = await ensureDatabase();
  await db
    .prepare(
      `UPDATE stripe_webhook_events
       SET status = 'processed', processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(eventId)
    .run();
}

export async function releaseStripeEvent(eventId: string): Promise<void> {
  const db = await ensureDatabase();
  await db
    .prepare(
      `DELETE FROM stripe_webhook_events
       WHERE id = ? AND status = 'processing'`,
    )
    .bind(eventId)
    .run();
}

function hexBytes(value: string): ArrayBuffer | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const buffer = new ArrayBuffer(value.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return buffer;
}

export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const component of signatureHeader.split(",")) {
    const [key, value] = component.trim().split("=", 2);
    if (key === "t") timestamp = Number.parseInt(value, 10);
    if (key === "v1" && value) signatures.push(value);
  }

  if (
    timestamp === null ||
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS ||
    signatures.length === 0
  ) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedPayload = encoder.encode(`${timestamp}.${rawBody}`);

  for (const signature of signatures) {
    const bytes = hexBytes(signature);
    if (bytes && (await crypto.subtle.verify("HMAC", key, bytes, signedPayload))) {
      return true;
    }
  }

  return false;
}

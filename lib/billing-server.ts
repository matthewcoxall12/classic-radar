import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";
import { STRIPE_API_VERSION, type StripeRecord, validateRoadbookPrice } from "@/lib/billing";

import { resolveBillingEnvironment, stripeKeyMatchesMode } from "@/lib/billing-environment";
export function billingConfig() {
  const environment = resolveBillingEnvironment(process.env);
  const secret = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const databaseSecret = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const annualPrice = process.env.STRIPE_ROADBOOK_ANNUAL_PRICE_ID?.trim() ?? "";
  const monthlyPrice = process.env.STRIPE_ROADBOOK_MONTHLY_PRICE_ID?.trim() ?? "";
  const serverReady = environment.valid && stripeKeyMatchesMode(secret, environment.live) && !!databaseSecret;
  return { secret, webhookSecret, databaseSecret, annualPrice, monthlyPrice, ...environment, serverReady,
    checkoutReady: process.env.BILLING_ENABLED === "true" && serverReady && webhookSecret.startsWith("whsec_") && annualPrice !== monthlyPrice && [annualPrice, monthlyPrice].every(price => /^price_[A-Za-z0-9]+$/.test(price)),
    allowedPrices: [annualPrice, monthlyPrice, ...(process.env.STRIPE_ROADBOOK_LEGACY_PRICE_IDS ?? "").split(",")].map(value => value.trim()).filter(Boolean) };
}

export function billingDatabase() {
  const { databaseSecret } = billingConfig();
  if (!databaseSecret) throw new Error("Billing storage is not configured");
  return createSupabaseClient(supabaseUrl, databaseSecret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function billingRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await billingDatabase().rpc(name, args);
  if (error) throw new Error(`Billing storage failed (${error.code})`);
  return data;
}

export async function stripeRequest(path: string, form?: URLSearchParams, idempotencyKey?: string): Promise<StripeRecord> {
  const { secret, serverReady } = billingConfig();
  if (!serverReady) throw new Error("Billing is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": STRIPE_API_VERSION,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, body: form?.toString()
  });
  if (!response.ok) throw new Error(`Stripe request failed (${response.status})`);
  return await response.json() as StripeRecord;
}

export async function paidBillingReady(): Promise<boolean> {
  const config = billingConfig();
  if (!config.checkoutReady) return false;
  try {
    const [annual, monthly] = await Promise.all([stripeRequest(`prices/${encodeURIComponent(config.annualPrice)}`), stripeRequest(`prices/${encodeURIComponent(config.monthlyPrice)}`)]);
    validateRoadbookPrice(annual, "annual", config.live);
    validateRoadbookPrice(monthly, "monthly", config.live);
    await billingRpc("billing_customer_for_user", { p_user_id: "00000000-0000-4000-8000-000000000000" });
    return true;
  }
  catch { return false; }
}

export function validBillingOrigin(request: Request): boolean {
  const { site, valid } = billingConfig();
  return valid && new URL(request.url).origin === site && request.headers.get("origin") === site;
}

export function billingResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

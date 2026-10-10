import { createClient } from "@/lib/supabase/server";
import { hasRoadbook } from "@/lib/entitlements";
import { record, roadbookCheckoutForm, stripeId, validateRoadbookPrice } from "@/lib/billing";
import { billingConfig, billingResponse, billingRpc, stripeRequest, validBillingOrigin } from "@/lib/billing-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validBillingOrigin(request)) return billingResponse({ error: "Invalid request origin." }, 403);
  const config = billingConfig();
  if (!config.checkoutReady) return billingResponse({ error: "Paid membership is not available yet. Request early access instead." }, 503);
  let checkoutOwner = "";
  let checkoutLock = "";
  try {
    const raw = await request.text();
    if (raw.length > 200) return billingResponse({ error: "Invalid checkout request." }, 400);
    let plan;
    try { plan = record(JSON.parse(raw)).plan; } catch { return billingResponse({ error: "Invalid checkout request." }, 400); }
    if (plan !== "annual" && plan !== "monthly") return billingResponse({ error: "Choose annual or monthly Roadbook." }, 400);
    const price = plan === "annual" ? config.annualPrice : config.monthlyPrice;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email || !data.user.email_confirmed_at) return billingResponse({ error: "Please sign in again before joining Roadbook." }, 401);
    const user = data.user;
    if (config.testMode && user.id !== config.testUserId) return billingResponse({ error: "Sandbox checkout is restricted to the dedicated test account." }, 403);
    const { data: profile } = await supabase.from("profiles").select("tier,is_admin,subscription_status,subscription_expires_at").eq("id", user.id).single();
    if (!profile) return billingResponse({ error: "Your account could not be found. Please sign in again." }, 409);
    if (hasRoadbook(profile)) return billingResponse({ error: "Roadbook is already active on your account. Manage any subscription from Membership." }, 409);
    validateRoadbookPrice(await stripeRequest(`prices/${encodeURIComponent(price)}`), plan, config.live);
    let customer = String(await billingRpc("billing_customer_for_user", { p_user_id: user.id }) || "");
    if (!customer) {
      const created = await stripeRequest("customers", new URLSearchParams({ email: user.email!, "metadata[classicsgo_user_id]": user.id }), `classicsgo-customer-${user.id}`);
      customer = stripeId(created.id);
      await billingRpc("billing_bind_customer", { p_user_id: user.id, p_customer_id: customer });
    }
    const reservation = record(await billingRpc("billing_acquire_checkout", { p_user_id: user.id }));
    if (typeof reservation.lock_id !== "string" || typeof reservation.generation !== "string") return billingResponse({ error: "Another checkout request is in progress. Please wait a moment and try again." }, 409);
    checkoutOwner = user.id;
    checkoutLock = reservation.lock_id;
    let generation = reservation.generation;
    const subscriptions = await stripeRequest(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
    if (!Array.isArray(subscriptions.data)) throw new Error("Subscription response is invalid");
    if (subscriptions.has_more || subscriptions.data.some(value => !["canceled", "incomplete_expired"].includes(String(record(value).status)))) {
      return billingResponse({ error: "You already have a subscription or payment awaiting completion. Open billing management instead." }, 409);
    }
    const sessions = await stripeRequest(`checkout/sessions?customer=${encodeURIComponent(customer)}&limit=1`);
    if (!Array.isArray(sessions.data)) throw new Error("Checkout response is invalid");
    const latest = record(sessions.data[0]);
    if (latest.status === "open") {
      if (record(latest.metadata).roadbook_price_id === price && typeof latest.url === "string" && latest.url.startsWith("https://checkout.stripe.com/")) return billingResponse({ url: latest.url });
      // Switching plans replaces only an unpaid open Checkout session.
      await stripeRequest(`checkout/sessions/${encodeURIComponent(stripeId(latest.id))}/expire`, new URLSearchParams());
    }
    if (stripeId(latest.id) && record(latest.metadata).checkout_generation === generation) {
      generation = String(await billingRpc("billing_advance_checkout", { p_user_id: user.id, p_lock_id: checkoutLock }));
    }
    const session = await stripeRequest("checkout/sessions", roadbookCheckoutForm({ customer, userId: user.id, price, generation, site: config.site }), `classicsgo-checkout-${customer}-${generation}`);
    if (typeof session.url !== "string" || !session.url.startsWith("https://checkout.stripe.com/")) throw new Error("Checkout URL is missing");
    return billingResponse({ url: session.url });
  } catch (error) {
    console.error("ClassicsGo checkout failed", error instanceof Error ? error.message : "unknown");
    return billingResponse({ error: "Checkout could not start. No payment has been taken by ClassicsGo. Please try again or contact Matthew." }, 503);
  } finally {
    if (checkoutOwner && checkoutLock) {
      try { await billingRpc("billing_release_checkout", { p_user_id: checkoutOwner, p_lock_id: checkoutLock }); }
      catch { console.error("ClassicsGo checkout reservation will expire automatically"); }
    }
  }
}

import { createClient } from "@/lib/supabase/server";
import { billingConfig, billingResponse, billingRpc, stripeRequest, validBillingOrigin } from "@/lib/billing-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validBillingOrigin(request)) return billingResponse({ error: "Invalid request origin." }, 403);
  if (!billingConfig().serverReady) return billingResponse({ error: "Online billing management is not configured. Please contact Matthew." }, 503);
  try {
    const { data, error } = await (await createClient()).auth.getUser();
    if (error || !data.user) return billingResponse({ error: "Please sign in again to manage billing." }, 401);
    const config = billingConfig();
    if (config.testMode && data.user.id !== config.testUserId) return billingResponse({ error: "Sandbox billing is restricted to the dedicated test account." }, 403);
    const customer = await billingRpc("billing_customer_for_user", { p_user_id: data.user.id });
    if (!customer) return billingResponse({ error: "There is no Stripe membership linked to this account. Early access does not have a paid subscription." }, 404);
    const session = await stripeRequest("billing_portal/sessions", new URLSearchParams({ customer: String(customer), return_url: `${billingConfig().site}/membership` }));
    if (typeof session.url !== "string" || !session.url.startsWith("https://billing.stripe.com/")) throw new Error("Portal URL is missing");
    return billingResponse({ url: session.url });
  } catch (error) {
    console.error("ClassicsGo billing portal failed", error instanceof Error ? error.message : "unknown");
    return billingResponse({ error: "Billing management could not open. Please try again or contact Matthew." }, 503);
  }
}

export type RuntimeBindings = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  AUTH_PASSWORD_ENABLED?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  AUTH_HASH_PEPPER?: string;
  DISCOVERY_INGEST_SECRET?: string;
  ADMIN_EMAILS?: string;
  GEOCODER_BASE_URL?: string;
  GEOCODER_USER_AGENT?: string;
  GEOCODER_COUNTRY_CODES?: string;
  DISCOVERY_ENABLED?: string;
  DISCOVERY_QUERY_BATCH_SIZE?: string;
  FIRECRAWL_API_KEY?: string;
  EVENTBRITE_TOKEN?: string;
  EVENTBRITE_ORGANIZATION_IDS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_ANNUAL?: string;
  STRIPE_FOUNDING_COUPON_ID?: string;
  // Deprecated: a recurring founding Price cannot renew at the standard rate.
  STRIPE_PRICE_FOUNDING?: string;
  SITE_URL?: string;
};

export function getRuntimeEnv() {
  return typeof process === "undefined"
    ? undefined
    : (process.env as RuntimeBindings & NodeJS.ProcessEnv);
}

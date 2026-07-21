const productionUrl = "https://rnayhhsurmztrohtftqo.supabase.co";
const productionPublishableKey =
  "sb_publishable_x1iw7qogdYGSAO9Brsv9gg_dfKVL9mc";

export const SUPABASE_AUTH_COOKIE_NAME = "__Host-cme_supabase_auth";

export function supabasePublicConfig() {
  const configuredUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
  ).trim();
  const configuredKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    ""
  ).trim();

  // The publishable key is designed for browser use. Keep the production
  // project as a safe fallback so stale Vercel variables cannot point this app
  // at an unrelated database. RLS remains the data-security boundary.
  if (configuredUrl === productionUrl && configuredKey === productionPublishableKey) {
    return { url: configuredUrl, publishableKey: configuredKey };
  }
  return { url: productionUrl, publishableKey: productionPublishableKey };
}

export function supabaseSecretKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  ).trim();
}

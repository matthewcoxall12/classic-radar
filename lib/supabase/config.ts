// Supabase publishable keys are deliberately safe to use in browser code. RLS
// remains the security boundary; secret/service-role keys must never live here.
const productionSupabaseUrl = "https://rnayhhsurmztrohtftqo.supabase.co";
const productionSupabasePublishableKey =
  "sb_publishable_x1iw7qogdYGSAO9Brsv9gg_dfKVL9mc";

export function resolveSupabasePublicConfig(
  configuredUrl: string | undefined,
  configuredPublishableKey: string | undefined
) {
  const url = configuredUrl?.trim();
  const publishableKey = configuredPublishableKey?.trim();

  // Vercel may retain environment values from an older project. Only accept
  // the known ClassicsGo URL/key pair so a stale value cannot silently point
  // production at the wrong database or produce an Invalid API key response.
  if (url === productionSupabaseUrl && publishableKey === productionSupabasePublishableKey) {
    return { url, publishableKey };
  }

  return {
    url: productionSupabaseUrl,
    publishableKey: productionSupabasePublishableKey
  };
}

const supabaseConfig = resolveSupabasePublicConfig(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export const supabaseUrl = supabaseConfig.url;
export const supabasePublishableKey = supabaseConfig.publishableKey;

export const googleWebClientId =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "44587218549-a6vbktqgp84ert9hfobih9rg59mk84jp.apps.googleusercontent.com";

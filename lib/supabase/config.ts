// Supabase publishable keys are deliberately safe to use in browser code. RLS
// remains the security boundary; secret/service-role keys must never live here.
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rnayhhsurmztrohtftqo.supabase.co";

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_x1iw7qogdYGSAO9Brsv9gg_dfKVL9mc";

export const googleWebClientId =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "436264658887-u8v8p50r0c1gpq5ajeiipppc49d6oqh0.apps.googleusercontent.com";

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfig, supabaseSecretKey } from "@/lib/supabase-config";

export function createSupabaseAdminClient() {
  const secretKey = supabaseSecretKey();
  if (!secretKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(supabasePublicConfig().url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

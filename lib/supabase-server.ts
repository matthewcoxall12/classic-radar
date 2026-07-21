import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  SUPABASE_AUTH_COOKIE_NAME,
  supabasePublicConfig,
} from "@/lib/supabase-config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabasePublicConfig();
  return createServerClient(url, publishableKey, {
    cookieOptions: {
      name: SUPABASE_AUTH_COOKIE_NAME,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values: CookieToSet[]) => {
        try {
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components are read-only; Route Handlers can refresh cookies.
        }
      },
    },
  });
}

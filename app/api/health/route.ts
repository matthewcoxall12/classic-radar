import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function productionConfigurationIsReady() {
  const siteUrl = process.env.SITE_URL?.trim() ?? "";
  const pepper = process.env.AUTH_HASH_PEPPER?.trim() ?? "";
  return (
    siteUrl === "https://classicsgo.com" &&
    pepper.length >= 32 &&
    !/(?:replace|example|placeholder)/i.test(pepper)
  );
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id") ?? "local";

  try {
    if (!productionConfigurationIsReady()) {
      throw new Error("PRODUCTION_CONFIGURATION_INCOMPLETE");
    }

    const { url, publishableKey } = supabasePublicConfig();
    const supabase = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { error } = await supabase.from("events").select("id").limit(1);
    if (error) throw new Error("DATABASE_UNAVAILABLE");

    console.log(JSON.stringify({
      level: "info",
      message: "health check passed",
      route: "/api/health",
      requestId,
      durationMs: Date.now() - startedAt,
    }));
    return response({
      status: "ok",
      service: "classicsgo",
      checkedAt: new Date().toISOString(),
    }, 200);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "health check failed",
      route: "/api/health",
      requestId,
      reason: error instanceof Error ? error.message : "UNKNOWN",
      durationMs: Date.now() - startedAt,
    }));
    return response({ status: "unavailable" }, 503);
  }
}

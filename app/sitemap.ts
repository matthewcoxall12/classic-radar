import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { collectSitemapEvents, sitemapEventEntry } from "@/lib/sitemap-events";
import { siteUrl } from "@/lib/site";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

// Newly published/cancelled listings must not wait for a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const routes = ["", "/events", "/membership", "/clubs", "/about", "/contact", "/privacy", "/terms", "/photography"];
  // Anonymous RLS, without a signed-in viewer's cookies or a service-role key.
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const events = await collectSitemapEvents(async (afterId, limit) => {
    let query = supabase.from("events")
      .select("id,slug,updated_at")
      .in("status", ["published", "cancelled"])
      .order("id", { ascending: true })
      .limit(limit);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    // Do not publish a misleading partial sitemap on a database failure.
    if (error) throw new Error(`ClassicsGo sitemap query failed: ${error.message}`);
    return data ?? [];
  });
  return [
    // Omit lastmod where there is no reliable content modification timestamp.
    ...routes.map((route) => ({ url: new URL(route || "/", base).toString() })),
    ...events.map((event) => sitemapEventEntry(event, base)),
  ];
}

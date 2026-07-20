import type { MetadataRoute } from "next";
import { getEvents } from "@/lib/events";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const routes = ["", "/events", "/membership", "/clubs", "/about", "/contact", "/privacy", "/terms"];
  const events = await getEvents({ radius: "europe", date: "all" }, 1000);
  return [
    ...routes.map((route) => ({ url: new URL(route || "/", base).toString(), lastModified: now, changeFrequency: route === "" || route === "/events" ? "daily" as const : "monthly" as const, priority: route === "" ? 1 : route === "/events" ? 0.9 : 0.6 })),
    ...events.map((event) => ({ url: new URL(`/events/${event.slug}`, base).toString(), lastModified: new Date(event.updated_at || event.last_checked_at || now), changeFrequency: "weekly" as const, priority: 0.7 }))
  ];
}

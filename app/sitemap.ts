import type { MetadataRoute } from "next";
import { listIndexableEvents } from "@/lib/public-events";
import { publicSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function validLastModified(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? fallback : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicSiteUrl().origin;
  const updated = new Date("2026-07-19T00:00:00Z");
  const events = await listIndexableEvents(5_000);
  const pages: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: updated, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/membership`, lastModified: updated, changeFrequency: "monthly", priority: 0.8 },
    { url: `${origin}/clubs`, lastModified: updated, changeFrequency: "monthly", priority: 0.7 },
    { url: `${origin}/submit-event`, lastModified: updated, changeFrequency: "monthly", priority: 0.7 },
    { url: `${origin}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
  ];

  return [
    ...pages,
    ...events.map((event) => ({
      url: `${origin}/events/${event.id}`,
      lastModified: validLastModified(event.updatedAt, updated),
      changeFrequency: "weekly" as const,
      priority: event.featured ? 0.8 : 0.7,
    })),
  ];
}

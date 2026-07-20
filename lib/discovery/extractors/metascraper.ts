import type { RawEventFinding } from "@/lib/discovery/types";

function decode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attributes(tag: string) {
  const values: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    values[match[1].toLowerCase()] = decode(match[3]);
  }
  return values;
}

function metadata(html: string) {
  const values = new Map<string, string>();
  for (const match of html.slice(0, 500_000).matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content && !values.has(key)) values.set(key, attrs.content.trim());
  }
  return values;
}

function resolvedPageUrl(value: string | undefined, pageUrl: string) {
  try {
    const url = new URL(value || pageUrl, pageUrl);
    if (url.protocol !== "https:") return pageUrl;
    url.hash = "";
    return url.toString();
  } catch {
    return pageUrl;
  }
}

/**
 * Worker-safe metascraper rule layer. The upstream metascraper package depends
 * on native RE2 and cannot execute in a Cloudflare Worker, so this deterministic
 * OpenGraph/ordinary-meta adapter implements only the bounded event fields we
 * need and deliberately keeps this source at low confidence.
 */
export function extractMetascraperEvent(html: string, pageUrl: string): RawEventFinding[] {
  const meta = metadata(html);
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = meta.get("og:title") || meta.get("twitter:title") || titleTag;
  if (!title) return [];
  return [{
    title: decode(title.replace(/<[^>]+>/g, " ")),
    description: meta.get("og:description") || meta.get("description"),
    venue: meta.get("event:location") || meta.get("place:location"),
    town: meta.get("event:locality") || meta.get("place:locality"),
    postcode: meta.get("event:postal_code") || meta.get("place:postal_code"),
    startDate: meta.get("event:start_time") || meta.get("article:published_time"),
    endDate: meta.get("event:end_time"),
    officialUrl: resolvedPageUrl(meta.get("og:url"), pageUrl),
    sourceUrl: pageUrl,
    method: "opengraph",
    parserVersion: "worker-metascraper-v2",
  }];
}

import type { SearchQuery } from "../query-engine.ts";
import type { SearchProvider, SearchResult } from "./types.ts";

const sourceSeeds: Record<string, string[]> = {
  "bicesterheritage.co.uk": ["https://bicesterheritage.co.uk/events/"],
  "brooklandsmuseum.com": ["https://www.brooklandsmuseum.com/whats-on"],
  "beaulieu.co.uk": ["https://www.beaulieu.co.uk/events/"],
  "britishmotormuseum.co.uk": ["https://www.britishmotormuseum.co.uk/whats-on/"],
  "haynesmuseum.org": ["https://www.haynesmuseum.org/events"],
  "goodwood.com": ["https://www.goodwood.com/motorsport/"],
  "classicshowsuk.co.uk": ["https://classicshowsuk.co.uk/classic-car-shows-this-year/"],
  "classicandsportscar.com": ["https://www.classicandsportscar.com/calendar"],
  "retroridesevents.com": ["https://retroridesevents.com/"],
  "caffeineandmachine.com": ["https://caffeineandmachine.com/whats-on/"],
  "ace-cafe-london.com": ["https://london.acecafe.com/meets/"],
  "nationalmotormuseum.org.uk": ["https://nationalmotormuseum.org.uk/events/"]
};

const fallbackSeeds = [
  "https://classicshowsuk.co.uk/classic-car-shows-this-year/",
  "https://www.classicandsportscar.com/calendar",
  "https://www.britishmotormuseum.co.uk/whats-on/",
  "https://www.brooklandsmuseum.com/whats-on",
  "https://www.beaulieu.co.uk/events/",
  "https://bicesterheritage.co.uk/events/"
];

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

function extractLinks(html: string, base: string) {
  const links: SearchResult[] = [];
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1];
    const text = stripHtml(match[2]);
    if (!text || text.length < 5) continue;
    if (!/classic|vintage|heritage|car|vehicle|autojumble|coffee|meet|rally|scramble|show|event/i.test(text)) continue;
    links.push({
      title: text.slice(0, 140),
      url: absoluteUrl(href, base),
      snippet: text,
      provider: "direct-source"
    });
  }
  return links;
}

function domainsForQuery(query: SearchQuery) {
  const siteDomain = query.query.match(/site:([^\s]+)/)?.[1]?.replace(/^www\./, "");
  if (siteDomain && sourceSeeds[siteDomain]) return [siteDomain];
  if (query.sourceHint && sourceSeeds[query.sourceHint]) return [query.sourceHint];
  if (query.category === "source_target") return Object.keys(sourceSeeds).slice(0, 4);
  return [];
}

export class DirectSourceProvider implements SearchProvider {
  name = "direct-source";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const domains = domainsForQuery(query);
    const urls = domains.length ? domains.flatMap((domain) => sourceSeeds[domain] ?? []) : fallbackSeeds.slice(0, 2);
    const results: SearchResult[] = [];

    for (const url of urls.slice(0, 3)) {
      try {
        const response = await fetch(url, {
          headers: {
            "user-agent": "ClassicRadarBot/0.1 (+local development; respectful public event discovery)"
          }
        });
        if (!response.ok) continue;
        const html = await response.text();
        const text = stripHtml(html);
        results.push({
          title: pageTitle(html) ?? query.query,
          url,
          snippet: text.slice(0, 700),
          provider: this.name
        });
        results.push(...extractLinks(html, url).slice(0, 8));
      } catch {
        continue;
      }
    }

    return results.slice(0, 10);
  }
}

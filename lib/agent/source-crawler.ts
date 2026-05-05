import type { CandidateEvent } from "./event-extractor.ts";
import { extractCandidateFromSearchResult } from "./event-extractor.ts";
import type { SearchResult } from "./providers/types.ts";

export type SourceRegistryRow = {
  id: string;
  source_name: string;
  domain: string;
  start_url: string;
  source_type: string;
  priority_weight: number;
  requires_review?: boolean | null;
};

export type CrawlPage = {
  url: string;
  html: string;
  text: string;
  title: string;
};

export type CrawlResult = {
  source: SourceRegistryRow;
  pagesFetched: number;
  candidates: CandidateEvent[];
  errors: string[];
};

const eventKeywords = /classic|vintage|heritage|car|vehicle|autojumble|coffee|meet|rally|road run|scramble|show|event|motorsport|owners club/i;

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

function attr(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim();
}

function pageTitle(html: string) {
  return (
    attr(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.replace(/\s+/g, " ").trim() ??
    "Untitled event page"
  );
}

function pageDescription(html: string) {
  return (
    attr(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
    attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  );
}

function pageImage(html: string, baseUrl: string) {
  const image = attr(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return image ? absoluteUrl(image, baseUrl) : undefined;
}

function absoluteUrl(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

function sameDomain(url: string, domain: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === domain || hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function extractEventLinks(html: string, baseUrl: string, domain: string) {
  const links = new Map<string, string>();
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const url = absoluteUrl(match[1], baseUrl).split("#")[0];
    const label = stripHtml(match[2]);
    if (!sameDomain(url, domain)) continue;
    if (!eventKeywords.test(`${label} ${url}`)) continue;
    if (/login|account|basket|cart|privacy|terms|cookie|wp-json|feed/i.test(url)) continue;
    links.set(url, label);
  }
  return [...links.keys()];
}

function normaliseJsonLd(raw: unknown): unknown[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(normaliseJsonLd);
  if (typeof raw === "object") {
    const object = raw as Record<string, unknown>;
    if (Array.isArray(object["@graph"])) return normaliseJsonLd(object["@graph"]);
    return [object];
  }
  return [];
}

function extractJsonLdEvents(html: string, pageUrl: string): CandidateEvent[] {
  const candidates: CandidateEvent[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const items = normaliseJsonLd(JSON.parse(match[1]));
      for (const item of items) {
        const data = item as Record<string, unknown>;
        const type = Array.isArray(data["@type"]) ? data["@type"].join(" ") : String(data["@type"] ?? "");
        if (!/Event/i.test(type)) continue;
        const location = data.location as Record<string, unknown> | undefined;
        const address = location?.address as Record<string, unknown> | string | undefined;
        const addressText =
          typeof address === "string"
            ? address
            : address
              ? [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode].filter(Boolean).join(", ")
              : undefined;
        candidates.push({
          title: String(data.name ?? pageTitle(html)),
          description: String(data.description ?? pageDescription(html) ?? ""),
          sourceUrl: pageUrl,
          sourceTitle: pageTitle(html),
          dateText: String(data.startDate ?? ""),
          locationText: [location?.name, addressText].filter(Boolean).join(", "),
          bookingUrl: String(data.url ?? pageUrl),
          imageUrl: Array.isArray(data.image) ? String(data.image[0]) : data.image ? String(data.image) : pageImage(html, pageUrl)
        });
      }
    } catch {
      continue;
    }
  }
  return candidates;
}

function fallbackCandidate(page: CrawlPage): CandidateEvent | null {
  const dateText =
    attr(page.html, /<time[^>]+datetime=["']([^"']+)["']/i) ??
    page.text.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i)?.[0];
  const result: SearchResult = {
    title: page.title,
    url: page.url,
    snippet: pageDescription(page.html) ?? page.text.slice(0, 900),
    dateText,
    locationText: page.text.match(/[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}/i)?.[0],
    imageUrl: pageImage(page.html, page.url),
    provider: "source-crawler"
  };
  return extractCandidateFromSearchResult(result);
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ClassicRadarBot/1.0 (+https://classic-radar.local; public event discovery; respectful rate limited)"
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) throw new Error(`${url} is not HTML`);
  return response.text();
}

async function robotsAllows(source: SourceRegistryRow) {
  try {
    const robotsUrl = new URL("/robots.txt", source.start_url).toString();
    const robots = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) }).then((response) => (response.ok ? response.text() : ""));
    const disallows = robots
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^disallow:/i.test(line))
      .map((line) => line.replace(/^disallow:\s*/i, "").trim())
      .filter(Boolean);
    const path = new URL(source.start_url).pathname;
    return !disallows.some((disallow) => disallow !== "/" && path.startsWith(disallow));
  } catch {
    return true;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function crawlSource(source: SourceRegistryRow, options: { maxDetailPages?: number; politeDelayMs?: number } = {}): Promise<CrawlResult> {
  const errors: string[] = [];
  const candidates: CandidateEvent[] = [];
  let pagesFetched = 0;
  const maxDetailPages = options.maxDetailPages ?? 4;
  const politeDelayMs = options.politeDelayMs ?? 500;

  if (!(await robotsAllows(source))) {
    return { source, pagesFetched, candidates, errors: [`robots.txt disallows ${source.start_url}`] };
  }

  try {
    const html = await fetchText(source.start_url);
    pagesFetched += 1;
    const startPage: CrawlPage = { url: source.start_url, html, text: stripHtml(html), title: pageTitle(html) };
    candidates.push(...extractJsonLdEvents(html, source.start_url));
    const fallback = fallbackCandidate(startPage);
    if (fallback) candidates.push(fallback);

    const detailLinks = extractEventLinks(html, source.start_url, source.domain).slice(0, maxDetailPages);
    for (const link of detailLinks) {
      await delay(politeDelayMs);
      try {
        const detailHtml = await fetchText(link);
        pagesFetched += 1;
        const page: CrawlPage = { url: link, html: detailHtml, text: stripHtml(detailHtml), title: pageTitle(detailHtml) };
        candidates.push(...extractJsonLdEvents(detailHtml, link));
        const detailFallback = fallbackCandidate(page);
        if (detailFallback) candidates.push(detailFallback);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const uniqueCandidates = new Map<string, CandidateEvent>();
  for (const candidate of candidates) {
    uniqueCandidates.set(`${candidate.title}|${candidate.sourceUrl}`, candidate);
  }

  return { source, pagesFetched, candidates: [...uniqueCandidates.values()], errors };
}

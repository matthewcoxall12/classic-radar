import { extractStructuredEvents } from "@/lib/discovery/extractors";
import {
  discoveryQueryBatchSize,
  discoveryQueryStride,
  generateShardedDiscoveryQueries,
} from "@/lib/discovery/query-generator";
import type {
  DiscoveryEndpointRow,
  ProviderRunResult,
  RawEventFinding,
} from "@/lib/discovery/types";
import { validatePublicHttpsUrl } from "@/lib/discovery-payload";
import { getRuntimeEnv } from "@/lib/runtime-env";

const FIRECRAWL_ORIGIN = "https://api.firecrawl.dev";
const blockedSocialDomains = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "threads.net",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "snapchat.com",
] as const;
const eventExtractionSchema = {
  type: "object",
  properties: {
    events: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        properties: {
          externalId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          organiserName: { type: "string" },
          venue: { type: "string" },
          town: { type: "string" },
          postcode: { type: "string" },
          adminArea: { type: "string" },
          countryCode: { type: "string" },
          timezone: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          startTime: { type: "string" },
          category: { type: "string" },
          officialUrl: { type: "string" },
          price: { type: "string" },
          latitude: { type: "number" },
          longitude: { type: "number" },
          cancelled: { type: "boolean" },
        },
        required: ["title", "startDate", "venue", "town"],
      },
    },
  },
  required: ["events"],
} as const;

function apiKey() {
  const runtime = getRuntimeEnv() as Record<string, unknown> | undefined;
  const value = runtime?.FIRECRAWL_API_KEY;
  return typeof value === "string" ? value.trim() : "";
}

function allowedPublicPage(value: string) {
  const url = new URL(validatePublicHttpsUrl(value, "Firecrawl target"));
  const hostname = url.hostname.toLowerCase();
  if (blockedSocialDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new Error("SOCIAL_AUTOMATION_NOT_PERMITTED");
  }
  return url;
}

async function firecrawl<T>(path: string, body: Record<string, unknown>) {
  const key = apiKey();
  if (!key) throw new Error("FIRECRAWL_NOT_CONFIGURED");
  const response = await fetch(`${FIRECRAWL_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`FIRECRAWL_HTTP_${response.status}`);
  return (await response.json()) as T;
}

export async function firecrawlSearch(input: {
  query: string;
  countryCode: string;
  locale: string;
  limit: number;
}) {
  return firecrawl<Record<string, unknown>>("/v2/search", {
    query: input.query,
    limit: Math.max(1, Math.min(10, input.limit)),
    country: input.countryCode === "GB" ? "UK" : input.countryCode,
    ignoreInvalidURLs: true,
    timeout: 20_000,
    excludeDomains: [...blockedSocialDomains],
  });
}

export async function firecrawlScrape(targetUrl: string) {
  const url = allowedPublicPage(targetUrl);
  return firecrawl<Record<string, unknown>>("/v2/scrape", {
    url: url.toString(),
    formats: [
      "rawHtml",
      "links",
      { type: "json", schema: eventExtractionSchema },
    ],
    onlyMainContent: false,
    proxy: "basic",
    skipTlsVerification: false,
    storeInCache: false,
    removeBase64Images: true,
    blockAds: true,
    waitFor: 750,
    timeout: 20_000,
  });
}

export async function firecrawlMap(targetUrl: string, limit = 40) {
  const url = allowedPublicPage(targetUrl);
  return firecrawl<Record<string, unknown>>("/v2/map", {
    url: url.toString(),
    limit: Math.max(1, Math.min(100, limit)),
    search: "events calendar whats on classic historic motoring",
    sitemap: "include",
    includeSubdomains: false,
    ignoreQueryParameters: true,
    timeout: 20_000,
  });
}

export async function firecrawlStartCrawl(targetUrl: string, limit = 20) {
  const url = allowedPublicPage(targetUrl);
  return firecrawl<Record<string, unknown>>("/v2/crawl", {
    url: url.toString(),
    limit: Math.max(1, Math.min(50, limit)),
    maxDiscoveryDepth: 2,
    sitemap: "include",
    ignoreQueryParameters: true,
    allowExternalLinks: false,
    allowSubdomains: false,
    ignoreRobotsTxt: false,
    scrapeOptions: {
      formats: [
        "rawHtml",
        "links",
        { type: "json", schema: eventExtractionSchema },
      ],
      onlyMainContent: false,
      proxy: "basic",
      skipTlsVerification: false,
      storeInCache: false,
      removeBase64Images: true,
      blockAds: true,
      waitFor: 750,
    },
  });
}

export async function firecrawlPollCrawl(jobId: string) {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(jobId)) throw new Error("INVALID_FIRECRAWL_JOB");
  return firecrawlCrawlPage(`${FIRECRAWL_ORIGIN}/v2/crawl/${jobId}`, jobId);
}

async function firecrawlCrawlPage(pageUrl: string, jobId: string) {
  const key = apiKey();
  if (!key) throw new Error("FIRECRAWL_NOT_CONFIGURED");
  const url = new URL(pageUrl);
  if (
    url.origin !== FIRECRAWL_ORIGIN ||
    !url.pathname.startsWith(`/v2/crawl/${jobId}`) ||
    url.username ||
    url.password
  ) {
    throw new Error("FIRECRAWL_PAGE_REJECTED");
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`FIRECRAWL_HTTP_${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

function nextCrawlPage(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : null;
  const value = payload.next ?? data?.next;
  return typeof value === "string" ? value : "";
}

function resultList(payload: Record<string, unknown>) {
  const root = payload.data;
  if (Array.isArray(root)) return root;
  if (root && typeof root === "object") {
    const data = root as Record<string, unknown>;
    for (const value of [data.web, data.results, data.links, data.data]) {
      if (Array.isArray(value)) return value;
    }
  }
  for (const value of [payload.web, payload.results, payload.links]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function resultUrl(item: unknown) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === "object"
    ? record.metadata as Record<string, unknown>
    : null;
  const value = record.url ?? record.sourceURL ?? record.sourceUrl
    ?? metadata?.sourceURL ?? metadata?.sourceUrl ?? metadata?.url;
  return typeof value === "string" ? value : "";
}

function scrapeDocument(payload: Record<string, unknown>, fallbackUrl = "") {
  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : payload;
  return {
    html:
      typeof data.rawHtml === "string"
        ? data.rawHtml
        : typeof data.html === "string"
          ? data.html
          : "",
    url: resultUrl(data) || fallbackUrl,
    findings: findingsFromFirecrawlJson(data, resultUrl(data) || fallbackUrl),
  };
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function findingsFromFirecrawlJson(
  item: Record<string, unknown>,
  fallbackUrl: string,
): RawEventFinding[] {
  const json = item.json && typeof item.json === "object" && !Array.isArray(item.json)
    ? item.json as Record<string, unknown>
    : null;
  const events = Array.isArray(json?.events) ? json.events : [];
  return events.slice(0, 25).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const event = value as Record<string, unknown>;
    const title = textValue(event.title);
    const startDate = textValue(event.startDate);
    const venue = textValue(event.venue);
    const town = textValue(event.town);
    if (!title || !startDate || !venue || !town) return [];
    let officialUrl = fallbackUrl;
    try {
      if (typeof event.officialUrl === "string") {
        officialUrl = allowedPublicPage(event.officialUrl).toString();
      }
    } catch {
      officialUrl = fallbackUrl;
    }
    return [{
      externalId: textValue(event.externalId),
      title,
      description: textValue(event.description),
      organiserName: textValue(event.organiserName),
      venue,
      town,
      postcode: textValue(event.postcode),
      adminArea: textValue(event.adminArea),
      countryCode: textValue(event.countryCode),
      timezone: textValue(event.timezone),
      startDate,
      endDate: textValue(event.endDate),
      startTime: textValue(event.startTime),
      category: textValue(event.category),
      officialUrl,
      sourceUrl: fallbackUrl,
      price: textValue(event.price),
      latitude: numberValue(event.latitude),
      longitude: numberValue(event.longitude),
      cancelled: event.cancelled === true,
      method: "firecrawl" as const,
      parserVersion: "firecrawl-json-schema-v1",
      rawConfidence: 76,
    }];
  });
}

function findingsFromDocuments(
  documents: unknown[],
  fallbackUrl: string,
  limit: number,
  allowedOrigin: string,
) {
  const findings: RawEventFinding[] = [];
  for (const document of documents.slice(0, limit)) {
    const rawUrl = resultUrl(document) || fallbackUrl;
    let url: string;
    try {
      url = allowedPublicPage(rawUrl).toString();
      if (new URL(url).origin !== allowedOrigin) continue;
    } catch {
      continue;
    }
    const record = document && typeof document === "object" && !Array.isArray(document)
      ? document as Record<string, unknown>
      : {};
    const html = resultHtml(document);
    const extracted = [
      ...extractStructuredEvents(html, url),
      ...findingsFromFirecrawlJson(record, url),
    ];
    if (extracted.length) findings.push(...extracted);
    else {
      const fallback = fallbackFinding(document, url);
      if (fallback) findings.push(fallback);
    }
  }
  return findings;
}

function resultHtml(item: unknown) {
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  return typeof record.rawHtml === "string"
    ? record.rawHtml
    : typeof record.html === "string"
      ? record.html
      : "";
}

function fallbackFinding(item: unknown, url: string): RawEventFinding | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === "object"
    ? record.metadata as Record<string, unknown>
    : {};
  const titleValue = record.title ?? metadata.title;
  const descriptionValue = record.description ?? metadata.description;
  const title = typeof titleValue === "string" ? titleValue : "";
  if (!title) return null;
  return {
    title,
    description:
      typeof descriptionValue === "string"
        ? descriptionValue
        : typeof record.markdown === "string"
          ? record.markdown.slice(0, 1_500)
          : "",
    startDate: `${title} ${typeof descriptionValue === "string" ? descriptionValue : ""}`,
    officialUrl: url,
    sourceUrl: url,
    method: "firecrawl",
    parserVersion: "firecrawl-search-v2",
  };
}

export async function runFirecrawlSearch(
  endpoint: DiscoveryEndpointRow,
): Promise<ProviderRunResult> {
  const batchSize = discoveryQueryBatchSize();
  const queries = generateShardedDiscoveryQueries(
    endpoint.endpoint_url,
    endpoint.cursor,
    batchSize,
  );
  const findings: RawEventFinding[] = [];
  const recordsPerQuery = Math.max(1, Math.ceil(endpoint.max_records / queries.length));
  for (const query of queries) {
    const response = await firecrawlSearch({
      query: query.query,
      countryCode: query.countryCode,
      locale: query.locale,
      limit: recordsPerQuery,
    });
    for (const item of resultList(response).slice(0, Math.min(5, recordsPerQuery))) {
      const rawUrl = resultUrl(item);
      if (!rawUrl) continue;
      let url: string;
      try {
        url = allowedPublicPage(rawUrl).toString();
      } catch {
        continue;
      }
      const scraped = await firecrawlScrape(url);
      const data = scraped.data && typeof scraped.data === "object" && !Array.isArray(scraped.data)
        ? scraped.data as Record<string, unknown>
        : scraped;
      const html = resultHtml(data);
      const extracted = [
        ...extractStructuredEvents(html, url),
        ...findingsFromFirecrawlJson(data, url),
      ];
      if (extracted.length) {
        findings.push(
          ...extracted.map((finding) => ({
            ...finding,
            countryCode: finding.countryCode || query.countryCode,
            timezone: finding.timezone || query.timezone,
          })),
        );
      } else {
        const fallback = fallbackFinding(data, url) ?? fallbackFinding(item, url);
        if (fallback) {
          findings.push({
            ...fallback,
            countryCode: query.countryCode,
            timezone: query.timezone,
          });
        }
      }
    }
  }
  return {
    findings,
    queries,
    cursor: endpoint.cursor + discoveryQueryStride(endpoint.endpoint_url, queries.length),
  };
}

export async function runFirecrawlMap(
  endpoint: DiscoveryEndpointRow,
): Promise<ProviderRunResult> {
  const response = await firecrawlMap(endpoint.endpoint_url, endpoint.max_pages);
  const base = allowedPublicPage(endpoint.endpoint_url);
  const urls: string[] = [];
  for (const item of resultList(response)) {
    const raw = resultUrl(item);
    if (!raw) continue;
    try {
      const url = allowedPublicPage(raw);
      if (
        url.origin === base.origin &&
        /event|calendar|whats?-?on|motorsport|classic|historic/i.test(url.pathname)
      ) {
        urls.push(url.toString());
      }
    } catch {
      // Unsafe and cross-policy map entries are discarded.
    }
  }
  const findings: RawEventFinding[] = [];
  const uniqueUrls = [...new Set(urls)].sort();
  const pageCount = Math.min(3, endpoint.max_records, uniqueUrls.length);
  const start = uniqueUrls.length ? endpoint.cursor % uniqueUrls.length : 0;
  const selected = Array.from(
    { length: pageCount },
    (_, offset) => uniqueUrls[(start + offset) % uniqueUrls.length],
  );
  for (const url of selected) {
    const scraped = await firecrawlScrape(url);
    const data = scraped.data && typeof scraped.data === "object"
      ? scraped.data as Record<string, unknown>
      : scraped;
    const html = resultHtml(data);
    findings.push(
      ...extractStructuredEvents(html, url),
      ...findingsFromFirecrawlJson(data, url),
    );
  }
  return { findings, cursor: endpoint.cursor + Math.max(1, selected.length) };
}

export async function runFirecrawlScrape(
  endpoint: DiscoveryEndpointRow,
): Promise<ProviderRunResult> {
  const response = await firecrawlScrape(endpoint.endpoint_url);
  const document = scrapeDocument(response, endpoint.endpoint_url);
  const target = document.url || endpoint.endpoint_url;
  const normalizedTarget = allowedPublicPage(target).toString();
  const findings = [
    ...(document.html ? extractStructuredEvents(document.html, normalizedTarget) : []),
    ...document.findings.map((finding) => ({ ...finding, sourceUrl: normalizedTarget })),
  ];
  return { findings, cursor: endpoint.cursor + 1 };
}

function crawlJobId(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : null;
  const value = payload.id ?? payload.jobId ?? data?.id ?? data?.jobId;
  return typeof value === "string" ? value : "";
}

function crawlStatus(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : null;
  const value = payload.status ?? data?.status;
  return typeof value === "string" ? value.toLowerCase() : "processing";
}

export async function runFirecrawlCrawl(
  endpoint: DiscoveryEndpointRow,
  externalJobId?: string | null,
): Promise<ProviderRunResult> {
  if (!externalJobId) {
    const started = await firecrawlStartCrawl(endpoint.endpoint_url, endpoint.max_pages);
    const jobId = crawlJobId(started);
    if (!jobId) throw new Error("FIRECRAWL_JOB_ID_MISSING");
    return {
      findings: [],
      externalJobId: jobId,
      deferred: true,
      reason: "FIRECRAWL_CRAWL_RUNNING",
    };
  }

  const polled = await firecrawlPollCrawl(externalJobId);
  const status = crawlStatus(polled);
  if (["failed", "cancelled", "canceled"].includes(status)) {
    throw new Error(`FIRECRAWL_CRAWL_${status.toUpperCase()}`);
  }
  if (["queued", "scraping", "running", "processing"].includes(status)) {
    return {
      findings: [],
      externalJobId,
      deferred: true,
      reason: "FIRECRAWL_CRAWL_RUNNING",
    };
  }
  if (!["completed", "complete", "done"].includes(status)) {
    throw new Error("FIRECRAWL_CRAWL_STATUS_UNKNOWN");
  }
  const documents = [...resultList(polled)];
  let next = nextCrawlPage(polled);
  for (
    let page = 1;
    next && page < Math.min(5, endpoint.max_pages) && documents.length < endpoint.max_pages;
    page += 1
  ) {
    const continuation = await firecrawlCrawlPage(next, externalJobId);
    documents.push(...resultList(continuation));
    next = nextCrawlPage(continuation);
  }
  return {
    findings: findingsFromDocuments(
      documents,
      endpoint.endpoint_url,
      Math.min(endpoint.max_pages, endpoint.max_records),
      new URL(endpoint.endpoint_url).origin,
    ),
    cursor: endpoint.cursor + 1,
    externalJobId,
  };
}

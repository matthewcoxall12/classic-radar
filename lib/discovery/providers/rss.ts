import Parser from "rss-parser";
import { extractStructuredEvents } from "@/lib/discovery/extractors";
import type {
  DiscoveryEndpointRow,
  ProviderRunResult,
  RawEventFinding,
} from "@/lib/discovery/types";
import { fetchBoundedText } from "@/lib/discovery/providers/http";
import { validatePublicHttpsUrl } from "@/lib/discovery-payload";

export async function runRss(
  endpoint: DiscoveryEndpointRow,
): Promise<ProviderRunResult> {
  const response = await fetchBoundedText(endpoint.endpoint_url, {
    etag: endpoint.etag,
    lastModified: endpoint.last_modified,
    accept: "application/rss+xml,application/atom+xml,application/xml,text/xml",
    allowedOrigins: [new URL(endpoint.endpoint_url).origin],
    contentTypes: ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"],
  });
  if (response.notModified) {
    return { findings: [], etag: response.etag, lastModified: response.lastModified };
  }
  const parser = new Parser({ timeout: 10_000, maxRedirects: 0 });
  const feed = await parser.parseString(response.text);
  const origin = new URL(response.url).origin;
  const items = feed.items.slice(0, endpoint.max_records);
  const processed = await Promise.all(items.map(async (item, index) => {
    const rawLink = item.link || item.guid;
    if (!rawLink || !item.title) return [];
    let link: string;
    try {
      const resolved = new URL(rawLink, response.url);
      resolved.hash = "";
      link = validatePublicHttpsUrl(resolved.toString(), "RSS event URL");
    } catch {
      return [];
    }
    let structured: RawEventFinding[] = [];
    if (index < 5) {
      try {
        const page = await fetchBoundedText(link, {
          maxBytes: 1_500_000,
          allowedOrigins: [origin],
          contentTypes: ["text/html", "application/xhtml+xml"],
        });
        structured = extractStructuredEvents(page.text, page.url);
      } catch {
        // The RSS facts below remain useful when the linked page is off-origin.
      }
    }
    if (structured.length) return structured;
    const record = item as unknown as Record<string, unknown>;
    return [{
      externalId: item.guid || link,
      title: item.title,
      description: item.contentSnippet || item.content,
      venue: typeof record.venue === "string" ? record.venue : undefined,
      town: typeof record.town === "string" ? record.town : undefined,
      postcode: typeof record.postcode === "string" ? record.postcode : undefined,
      countryCode: endpoint.country_code,
      timezone: endpoint.timezone,
      startDate: `${item.title} ${item.contentSnippet || item.content || ""}`,
      officialUrl: link,
      sourceUrl: link,
      method: "rss",
      parserVersion: "rss-parser-v2",
    } satisfies RawEventFinding];
  }));
  const findings = processed.flat();
  return {
    findings,
    cursor: endpoint.cursor + 1,
    etag: response.etag,
    lastModified: response.lastModified,
  };
}

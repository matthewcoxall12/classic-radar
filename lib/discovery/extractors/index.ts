import type { RawEventFinding } from "@/lib/discovery/types";
import { extractJsonLdEvents } from "@/lib/discovery/extractors/jsonld";
import { extractMetascraperEvent } from "@/lib/discovery/extractors/metascraper";
import { extractMicrodataEvents } from "@/lib/discovery/extractors/microdata";

export function extractStructuredEvents(html: string, pageUrl: string): RawEventFinding[] {
  const layers = [
    ...extractJsonLdEvents(html, pageUrl),
    ...extractMicrodataEvents(html, pageUrl),
    ...extractMetascraperEvent(html, pageUrl),
  ];
  const unique = new Map<string, RawEventFinding>();
  for (const finding of layers) {
    const key = [
      finding.externalId ?? "",
      finding.title ?? "",
      finding.startDate ?? "",
      finding.officialUrl ?? finding.sourceUrl,
    ].join("|").toLocaleLowerCase("en");
    if (!unique.has(key)) unique.set(key, finding);
  }
  return [...unique.values()];
}

export {
  extractJsonLdEvents,
  extractMetascraperEvent,
  extractMicrodataEvents,
};

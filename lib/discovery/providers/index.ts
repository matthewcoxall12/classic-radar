import type { DiscoveryEndpointRow, ProviderRunResult } from "@/lib/discovery/types";
import { runEventbrite } from "@/lib/discovery/providers/eventbrite";
import {
  runFirecrawlCrawl,
  runFirecrawlMap,
  runFirecrawlScrape,
  runFirecrawlSearch,
} from "@/lib/discovery/providers/firecrawl";
import { runIcal } from "@/lib/discovery/providers/ical";
import { runRss } from "@/lib/discovery/providers/rss";

export async function runDiscoveryProvider(
  endpoint: DiscoveryEndpointRow,
  externalJobId?: string | null,
): Promise<ProviderRunResult> {
  switch (endpoint.adapter) {
    case "firecrawl_search":
      return runFirecrawlSearch(endpoint);
    case "firecrawl_map":
      return runFirecrawlMap(endpoint);
    case "firecrawl_crawl":
      return runFirecrawlCrawl(endpoint, externalJobId);
    case "firecrawl_scrape":
      return runFirecrawlScrape(endpoint);
    case "eventbrite":
      return runEventbrite(endpoint);
    case "ical":
      return runIcal(endpoint);
    case "rss":
      return runRss(endpoint);
  }
}

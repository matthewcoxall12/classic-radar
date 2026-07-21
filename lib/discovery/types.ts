import type {
  DiscoveryMethod,
  DiscoveryPermissionBasis,
  DiscoverySourceType,
  NormalizedDiscoveryPayload,
} from "@/lib/discovery-payload";
import type { DiscoveryQuery } from "@/lib/discovery/query-generator";

export type RawEventFinding = {
  externalId?: string;
  title?: string;
  description?: string;
  organiserName?: string;
  venue?: string;
  town?: string;
  postcode?: string;
  adminArea?: string;
  countryCode?: string;
  timezone?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  category?: string;
  officialUrl?: string;
  sourceUrl: string;
  price?: string;
  latitude?: number;
  longitude?: number;
  method: DiscoveryMethod;
  parserVersion: string;
  rawConfidence?: number;
  cancelled?: boolean;
};

export type DiscoverySourceDefinition = {
  key: string;
  name: string;
  type: DiscoverySourceType;
  canonicalUrl: string;
  permissionBasis: DiscoveryPermissionBasis;
};

export type DiscoveryEndpointAdapter =
  | "firecrawl_search"
  | "firecrawl_map"
  | "firecrawl_crawl"
  | "firecrawl_scrape"
  | "eventbrite"
  | "ical"
  | "rss";

export type DiscoveryEndpointRow = {
  id: string;
  source_id: string;
  source_key: string;
  source_name: string;
  source_type: DiscoverySourceType;
  canonical_url: string;
  permission_basis: DiscoveryPermissionBasis;
  source_status: string;
  adapter: DiscoveryEndpointAdapter;
  endpoint_url: string;
  schedule_hours: number;
  country_code: string;
  locale: string;
  timezone: string;
  max_pages: number;
  max_records: number;
  cursor: number;
  etag: string | null;
  last_modified: string | null;
  failure_count: number;
  next_run_at: number;
  lease_until: number;
};

export type NormalizedFinding = {
  payload: NormalizedDiscoveryPayload;
  parserVersion: string;
  confidenceBreakdown: Record<string, number | string | boolean>;
};

export type ProviderRunResult = {
  findings: RawEventFinding[];
  queries?: DiscoveryQuery[];
  cursor?: number;
  etag?: string | null;
  lastModified?: string | null;
  externalJobId?: string | null;
  deferred?: boolean;
  continuation?: boolean;
  reason?: string;
};

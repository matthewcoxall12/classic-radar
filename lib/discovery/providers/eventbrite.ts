import type {
  DiscoveryEndpointRow,
  ProviderRunResult,
  RawEventFinding,
} from "@/lib/discovery/types";
import { getRuntimeEnv } from "@/lib/runtime-env";

function runtimeValue(name: "EVENTBRITE_TOKEN" | "EVENTBRITE_ORGANIZATION_IDS") {
  const runtime = getRuntimeEnv() as Record<string, unknown> | undefined;
  const value = runtime?.[name];
  return typeof value === "string" ? value.trim() : "";
}

type EventbriteEvent = {
  id?: string;
  name?: { text?: string };
  description?: { text?: string };
  url?: string;
  start?: { local?: string; timezone?: string };
  end?: { local?: string };
  venue?: {
    name?: string;
    address?: {
      city?: string;
      region?: string;
      postal_code?: string;
      country?: string;
      latitude?: string;
      longitude?: string;
    };
  };
  organizer?: { name?: string };
  is_free?: boolean;
};

export async function runEventbrite(
  endpoint: DiscoveryEndpointRow,
): Promise<ProviderRunResult> {
  const token = runtimeValue("EVENTBRITE_TOKEN");
  const organizationIds = runtimeValue("EVENTBRITE_ORGANIZATION_IDS")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d{3,30}$/.test(value));
  if (!token || !organizationIds.length) {
    return { findings: [], deferred: true, reason: "EVENTBRITE_NOT_CONFIGURED" };
  }
  const organizationId = organizationIds[endpoint.cursor % organizationIds.length];
  const findings: RawEventFinding[] = [];
  let continuation = "";
  for (
    let page = 0;
    page < Math.min(3, endpoint.max_pages) && findings.length < endpoint.max_records;
    page += 1
  ) {
    const url = new URL(
      `https://www.eventbriteapi.com/v3/organizations/${organizationId}/events/`,
    );
    url.searchParams.set("status", "live");
    url.searchParams.set("time_filter", "current_future");
    url.searchParams.set("expand", "venue,organizer,ticket_availability");
    url.searchParams.set(
      "page_size",
      String(Math.max(1, Math.min(50, endpoint.max_records - findings.length))),
    );
    if (continuation) url.searchParams.set("continuation", continuation);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`EVENTBRITE_HTTP_${response.status}`);
    const payload = (await response.json()) as {
      events?: EventbriteEvent[];
      pagination?: { has_more_items?: boolean; continuation?: string };
    };
    for (const event of payload.events ?? []) {
      const address = event.venue?.address;
      if (!event.name?.text || !event.url || !event.start?.local || !event.venue?.name || !address?.city) continue;
      findings.push({
        externalId: event.id,
        title: event.name.text,
        description: event.description?.text,
        organiserName: event.organizer?.name,
        venue: event.venue.name,
        town: address.city,
        postcode: address.postal_code,
        adminArea: address.region,
        countryCode: address.country,
        timezone: event.start.timezone,
        startDate: event.start.local,
        endDate: event.end?.local,
        startTime: event.start.local,
        officialUrl: event.url,
        sourceUrl: event.url,
        price: event.is_free ? "Free" : undefined,
        latitude: Number.isFinite(Number(address.latitude)) ? Number(address.latitude) : undefined,
        longitude: Number.isFinite(Number(address.longitude)) ? Number(address.longitude) : undefined,
        method: "eventbrite",
        parserVersion: "eventbrite-organization-v3",
      });
      if (findings.length >= endpoint.max_records) break;
    }
    continuation = payload.pagination?.continuation ?? "";
    if (!payload.pagination?.has_more_items || !continuation) break;
  }
  return { findings, cursor: endpoint.cursor + 1 };
}

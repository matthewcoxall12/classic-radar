import microdata from "microdata-node";
import type { RawEventFinding } from "@/lib/discovery/types";

type MicrodataItem = {
  type?: string[];
  properties?: Record<string, unknown[]>;
};

function first(value: unknown): unknown {
  return Array.isArray(value) ? first(value[0]) : value;
}

function text(value: unknown): string | undefined {
  const item = first(value);
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (item && typeof item === "object") {
    const object = item as Record<string, unknown>;
    const properties = object.properties;
    const propertyValue = properties && typeof properties === "object"
      ? (properties as Record<string, unknown>).value
      : undefined;
    return text(propertyValue ?? object.value ?? object.name);
  }
  return undefined;
}

function nested(value: unknown) {
  const item = first(value);
  return item && typeof item === "object"
    ? ((item as Record<string, unknown>).properties as Record<string, unknown[]> | undefined) ?? {}
    : {};
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

export function extractMicrodataEvents(html: string, pageUrl: string): RawEventFinding[] {
  let parsed: { items?: MicrodataItem[] };
  try {
    parsed = microdata.toJson(html.slice(0, 2_000_000)) as { items?: MicrodataItem[] };
  } catch {
    return [];
  }
  return (parsed.items ?? [])
    .filter((item) => item.type?.some((type) => /schema\.org\/(?:Event|SportsEvent|ExhibitionEvent)$/i.test(type)))
    .map((item) => {
      const properties = item.properties ?? {};
      const location = nested(properties.location);
      const address = nested(location.address);
      const geo = nested(location.geo);
      const organiser = nested(properties.organizer);
      return {
        externalId: text(properties.identifier),
        title: text(properties.name),
        description: text(properties.description),
        organiserName: text(organiser.name),
        venue: text(location.name ?? properties.location),
        town: text(address.addressLocality),
        postcode: text(address.postalCode),
        adminArea: text(address.addressRegion),
        countryCode: text(address.addressCountry),
        startDate: text(properties.startDate),
        endDate: text(properties.endDate),
        startTime: text(properties.doorTime ?? properties.startDate),
        officialUrl: resolvedPageUrl(text(properties.url), pageUrl),
        sourceUrl: pageUrl,
        latitude: Number.isFinite(Number(text(geo.latitude))) ? Number(text(geo.latitude)) : undefined,
        longitude: Number.isFinite(Number(text(geo.longitude))) ? Number(text(geo.longitude)) : undefined,
        cancelled: /(?:event)?cancelled/i.test(text(properties.eventStatus) ?? ""),
        method: "microdata" as const,
        parserVersion: "microdata-node-v2",
      };
    });
}

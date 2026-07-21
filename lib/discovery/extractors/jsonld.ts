import type { RawEventFinding } from "@/lib/discovery/types";

const eventTypes = new Set([
  "Event",
  "SportsEvent",
  "ExhibitionEvent",
  "Festival",
  "SaleEvent",
]);

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return text(item.name ?? item["@value"] ?? item.value);
  }
  return undefined;
}

function typeNames(value: unknown) {
  return values(value)
    .map(text)
    .filter((item): item is string => Boolean(item))
    .map((item) => item.split(/[\/#]/).at(-1) ?? item);
}

function flatten(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [
    object,
    ...flatten(object["@graph"]),
    ...flatten(object.subEvent),
    ...flatten(object.event),
  ];
}

function scriptBodies(html: string) {
  const output: string[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(pattern)) output.push(match[1].trim());
  return output;
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

export function extractJsonLdEvents(html: string, pageUrl: string): RawEventFinding[] {
  const findings: RawEventFinding[] = [];
  for (const body of scriptBodies(html.slice(0, 2_000_000))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.replace(/^\s*<!--|-->\s*$/g, ""));
    } catch {
      continue;
    }
    for (const event of flatten(parsed)) {
      if (!typeNames(event["@type"]).some((type) => eventTypes.has(type))) continue;
      const location = typeof event.location === "object" && event.location
        ? event.location as Record<string, unknown>
        : {};
      const address = typeof location.address === "object" && location.address
        ? location.address as Record<string, unknown>
        : {};
      const geo = typeof location.geo === "object" && location.geo
        ? location.geo as Record<string, unknown>
        : {};
      const organiser = typeof event.organizer === "object" && event.organizer
        ? event.organizer as Record<string, unknown>
        : {};
      const offer = values(event.offers).find(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
      );
      const officialUrl = resolvedPageUrl(text(event.url ?? event["@id"]), pageUrl);
      findings.push({
        externalId: text(event.identifier ?? event["@id"]),
        title: text(event.name ?? event.headline),
        description: text(event.description),
        organiserName: text(organiser.name),
        venue: text(location.name ?? (typeof event.location === "string" ? event.location : undefined)),
        town: text(address.addressLocality),
        postcode: text(address.postalCode),
        adminArea: text(address.addressRegion),
        countryCode: text(address.addressCountry),
        startDate: text(event.startDate),
        endDate: text(event.endDate),
        startTime: text(event.doorTime ?? event.startDate),
        category: typeNames(event["@type"])[0],
        officialUrl,
        sourceUrl: pageUrl,
        price: offer ? text(offer.price) : undefined,
        latitude: Number.isFinite(Number(geo.latitude)) ? Number(geo.latitude) : undefined,
        longitude: Number.isFinite(Number(geo.longitude)) ? Number(geo.longitude) : undefined,
        cancelled: /(?:event)?cancelled/i.test(text(event.eventStatus) ?? ""),
        method: "json_ld",
        parserVersion: "jsonld-event-v2",
      });
    }
  }
  return findings;
}

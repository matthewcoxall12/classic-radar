import ICAL from "ical.js";
import type {
  DiscoveryEndpointRow,
  ProviderRunResult,
  RawEventFinding,
} from "@/lib/discovery/types";
import { fetchBoundedText } from "@/lib/discovery/providers/http";

function splitLocation(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const postcodeIndex = parts.findIndex((part) => /\d/.test(part) && part.length <= 16);
  return {
    venue: parts[0],
    town: parts.length > 1 ? parts[1] : "",
    postcode: postcodeIndex >= 0 ? parts[postcodeIndex] : "",
  };
}

function padded(value: number) {
  return String(value).padStart(2, "0");
}

function localDate(value: ICAL.Time | null | undefined) {
  if (!value) return undefined;
  return `${value.year}-${padded(value.month)}-${padded(value.day)}`;
}

function localTime(value: ICAL.Time | null | undefined) {
  if (!value || value.isDate) return undefined;
  return `${padded(value.hour)}:${padded(value.minute)}`;
}

function occurrenceEnd(event: ICAL.Event, start: ICAL.Time) {
  const end = start.clone();
  end.addDuration(event.duration);
  if (start.isDate && end.compare(start) > 0) end.day -= 1;
  return end;
}

function resolvedOfficialUrl(value: unknown, fallback: string) {
  try {
    const url = new URL(typeof value === "string" ? value : fallback, fallback);
    if (url.protocol !== "https:") return fallback;
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

export async function runIcal(
  endpoint: DiscoveryEndpointRow,
): Promise<ProviderRunResult> {
  const response = await fetchBoundedText(endpoint.endpoint_url, {
    etag: endpoint.etag,
    lastModified: endpoint.last_modified,
    accept: "text/calendar,application/ics;q=0.9,text/plain;q=0.7",
    allowedOrigins: [new URL(endpoint.endpoint_url).origin],
    contentTypes: ["text/calendar", "application/ics", "text/plain"],
  });
  if (response.notModified) {
    return { findings: [], etag: response.etag, lastModified: response.lastModified };
  }
  const root = new ICAL.Component(ICAL.parse(response.text));
  const findings: RawEventFinding[] = [];
  const now = new Date();
  const latest = new Date(now);
  latest.setUTCFullYear(latest.getUTCFullYear() + 3);
  const components = root.getAllSubcomponents("vevent");
  const startIndex = components.length ? endpoint.cursor % components.length : 0;
  let processedSeries = 0;
  for (const component of components.slice(startIndex)) {
    if (findings.length >= endpoint.max_records) break;
    if (processedSeries >= endpoint.max_records) break;
    processedSeries += 1;
    const event = new ICAL.Event(component);
    const status = String(component.getFirstPropertyValue("status") ?? "").toUpperCase();
    const cancelled = status === "CANCELLED";
    const location = splitLocation(event.location || "");
    const urlValue = component.getFirstPropertyValue("url");
    const officialUrl = resolvedOfficialUrl(urlValue, response.url);
    const starts: ICAL.Time[] = [];
    if (event.isRecurring()) {
      const iterator = event.iterator();
      for (let count = 0; count < 2_000 && starts.length < 4; count += 1) {
        const next = iterator.next();
        if (!next) break;
        const date = next.toJSDate();
        if (date > latest) break;
        if (date >= now) starts.push(next);
      }
    } else if (event.startDate?.toJSDate() >= now && event.startDate.toJSDate() <= latest) {
      starts.push(event.startDate);
    }
    for (const start of starts) {
      if (findings.length >= endpoint.max_records) break;
      const startDate = localDate(start);
      if (!startDate) continue;
      const end = occurrenceEnd(event, start);
      findings.push({
        externalId: `${event.uid || "event"}:${startDate}`,
        title: event.summary,
        description: event.description,
        venue: location.venue,
        town: location.town,
        postcode: location.postcode,
        countryCode: endpoint.country_code,
        timezone: endpoint.timezone,
        startDate,
        endDate: end.compare(start) >= 0 ? localDate(end) : undefined,
        startTime: localTime(start),
        officialUrl,
        sourceUrl: response.url,
        cancelled,
        method: "ical",
        parserVersion: "icaljs-v2",
      });
    }
  }
  const completedSweep = components.length === 0 || startIndex + processedSeries >= components.length;
  return {
    findings,
    cursor: endpoint.cursor + Math.max(1, processedSeries),
    etag: completedSweep ? response.etag : null,
    lastModified: completedSweep ? response.lastModified : null,
    continuation: !completedSweep,
  };
}

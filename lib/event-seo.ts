import type { PublicMotoringEvent } from "@/lib/public-events";
import { safeOfficialUrl } from "@/lib/public-events";

const simpleTime = /^([01]\d|2[0-3]):([0-5]\d)/;

function offsetFor(date: string, timeZone: string) {
  const anchor = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(anchor.valueOf())) return null;

  const offsetName = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
  })
    .formatToParts(anchor)
    .find((part) => part.type === "timeZoneName")?.value;

  if (!offsetName || offsetName === "GMT") return "+00:00";
  const offset = offsetName.match(/^GMT([+-]\d{2}:\d{2})$/)?.[1];
  return offset ?? null;
}

export function eventStartIso(event: PublicMotoringEvent) {
  const match = event.startTime.match(simpleTime);
  let offset: string | null = null;
  try {
    offset = offsetFor(event.startDate, event.timezone || "Europe/London");
  } catch {
    offset = null;
  }
  if (!match || !offset) return event.startDate;
  return `${event.startDate}T${match[1]}:${match[2]}:00${offset}`;
}

export function buildEventStructuredData(
  event: PublicMotoringEvent,
  pageUrl: URL,
) {
  const officialUrl = safeOfficialUrl(event.officialUrl);
  const imageUrl = new URL(event.image, pageUrl);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${pageUrl.toString()}#event`,
    name: event.title,
    description: event.description,
    url: pageUrl.toString(),
    image: imageUrl.toString(),
    startDate: eventStartIso(event),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue,
      address: {
        "@type": "PostalAddress",
        addressLocality: event.town,
        postalCode: event.postcode,
        addressCountry: event.countryCode,
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: event.latitude,
        longitude: event.longitude,
      },
    },
  };

  if (event.endDate) data.endDate = event.endDate;
  if (officialUrl) data.sameAs = officialUrl;
  if (event.price.trim().toLowerCase().startsWith("free")) {
    data.isAccessibleForFree = true;
  }

  return data;
}

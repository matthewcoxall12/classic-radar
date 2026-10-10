import type { ClassicEvent } from "./types.ts";
import { eventImageUrl } from "./event-photography.ts";
import { absoluteUrl, contactEmail, siteDescription, siteName } from "./site.ts";
import { eventTimes } from "./event-timing.ts";

const schema = "https://schema.org/";
export const websiteId = absoluteUrl("/#website");
export const publisherId = absoluteUrl("/#organization");

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function text(value?: string | null) { return value?.trim() || undefined; }
function publicUrl(value?: string | null) {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
}

function validDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Convert a local wall-clock time using the event's IANA zone, including DST.
// Unknown times stay date-only. Ambiguous/nonexistent DST times also stay date-only
// rather than inventing which occurrence the organiser intended.
export function eventSchemaDate(date: string, time?: string | null, zone?: string) {
  if (!validDate(date)) return undefined;
  const matched = time?.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?$/);
  if (!matched) return date;
  const local = `${date}T${matched[1]}:${matched[2]}:${matched[3] || "00"}`;
  if (!zone) return local;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    const localValue = (instant: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    };
    const wall = Date.parse(`${local}Z`);
    const offsets = new Set([-36, 0, 36].map(hours => {
      const instant = wall + hours * 3600000;
      return (Date.parse(`${localValue(instant)}Z`) - instant) / 60000;
    }));
    const valid = [...offsets].filter(offset => localValue(wall - offset * 60000) === local);
    if (valid.length !== 1) return date;
    const offset = valid[0];
    const magnitude = Math.abs(offset);
    return `${local}${offset < 0 ? "-" : "+"}${String(Math.floor(magnitude / 60)).padStart(2, "0")}:${String(magnitude % 60).padStart(2, "0")}`;
  } catch {
    // Google's fallback is the event location's timezone; never assume UTC.
    return local;
  }
}

export function eventAdmission(priceText?: string | null, country = "GB") {
  const value = priceText?.trim();
  if (!value) return undefined;
  if (/^(?:free|free entry|free admission|admission free)[.!]?$/i.test(value)) {
    return { price: 0, ...(country === "GB" ? { priceCurrency: "GBP" } : {}) };
  }
  // Ranges, "from", donations, concessions and extra fees cannot safely be
  // turned into a single ticket offer from prose alone.
  if (country !== "GB") return undefined;
  const amount = value.match(/^(?:£\s*|GBP\s+)(\d+(?:\.\d{1,2})?)(?:\s*(?:per person|pp|entry|admission))?$/i);
  return amount ? { price: Number(amount[1]), priceCurrency: "GBP" } : undefined;
}

type RatingSummary = { count: number; average: number | null; unavailable: boolean };
export function eventStructuredData(event: ClassicEvent, rating?: RatingSummary | null) {
  const times = eventTimes(event);
  // Legacy imports defaulted every country to London. For foreign listings
  // with that default, let Google infer the zone from the physical location.
  const zone = event.country_code !== "GB" && event.timezone === "Europe/London"
    ? undefined : event.timezone || (event.country_code === "GB" ? "Europe/London" : undefined);
  const startDate = eventSchemaDate(event.start_date, times.start, zone);
  // A "venue changed — check organiser" placeholder is not a location. Keep
  // its useful WebPage, but don't claim event eligibility without an address.
  if (!["published", "cancelled"].includes(event.status) || !text(event.title) || !startDate ||
    ![event.address, event.town, event.postcode].some(value => text(value)) ||
    /\b(?:members[ -]only|invitation[ -]only|private event)\b/i.test([event.title, event.description, event.price_text].join(" "))) return null;
  const url = absoluteUrl(`/events/${encodeURIComponent(event.slug)}`);
  const image = eventImageUrl(event);
  const admission = eventAdmission(event.price_text, event.country_code);
  const booking = publicUrl(event.booking_url);
  const endDate = event.end_date || times.end ? eventSchemaDate(event.end_date || event.start_date, times.end, zone) : undefined;
  const validEnd = endDate && (endDate.length === 10 || startDate.length === 10
    ? endDate.slice(0, 10) >= event.start_date : Date.parse(endDate) >= Date.parse(startDate));
  const hasCoordinates = event.latitude != null && event.longitude != null &&
    Number.isFinite(event.latitude) && Math.abs(event.latitude) <= 90 &&
    Number.isFinite(event.longitude) && Math.abs(event.longitude) <= 180;
  return {
    "@type": "Event", "@id": `${url}#event`, url, name: event.title,
    description: text(event.description), startDate,
    endDate: validEnd ? endDate : undefined,
    eventAttendanceMode: `${schema}OfflineEventAttendanceMode`,
    eventStatus: `${schema}${event.status === "cancelled" ? "EventCancelled" : "EventScheduled"}`,
    mainEntityOfPage: { "@id": `${url}#webpage` },
    location: {
      "@type": "Place", name: text(event.venue_name),
      address: {
        "@type": "PostalAddress", streetAddress: text(event.address),
        addressLocality: text(event.town), addressRegion: text(event.county),
        postalCode: text(event.postcode), addressCountry: text(event.country_code),
      },
      geo: hasCoordinates ? { "@type": "GeoCoordinates", latitude: event.latitude, longitude: event.longitude } : undefined,
    },
    image: image ? [absoluteUrl(image)] : undefined,
    organizer: text(event.organiser_name) ? {
      "@type": "Organization", name: text(event.organiser_name), url: publicUrl(event.organiser_url),
    } : undefined,
    isAccessibleForFree: admission ? admission.price === 0 : undefined,
    offers: admission && event.status !== "cancelled" ? { "@type": "Offer", ...admission, url: booking } : undefined,
    aggregateRating: rating && !rating.unavailable && Number.isInteger(rating.count) && rating.count > 0 &&
      rating.average != null && Number.isFinite(rating.average) && rating.average >= 1 && rating.average <= 5 ? {
        "@type": "AggregateRating", ratingValue: rating.average, reviewCount: rating.count, bestRating: 5, worstRating: 1,
      } : undefined,
  };
}

export function eventPageStructuredData(event: ClassicEvent, rating?: RatingSummary | null) {
  const url = absoluteUrl(`/events/${encodeURIComponent(event.slug)}`);
  const detail = eventStructuredData(event, rating);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", "@id": `${url}#webpage`, url, name: event.title,
        inLanguage: "en-GB", isPartOf: { "@id": websiteId },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: detail ? { "@id": `${url}#event` } : undefined,
      },
      {
        "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Events", item: absoluteUrl("/events") },
          { "@type": "ListItem", position: 3, name: event.title, item: url },
        ],
      },
      ...(detail ? [detail] : []),
    ],
  };
}

export function siteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization", "@id": publisherId, name: siteName,
        url: absoluteUrl("/"), email: contactEmail,
        logo: { "@type": "ImageObject", url: absoluteUrl("/branding/classicsgo-logo-v2-512.png"), width: 512, height: 512 },
        contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: contactEmail, url: absoluteUrl("/contact") },
      },
      {
        "@type": "WebSite", "@id": websiteId, name: siteName,
        alternateName: "ClassicsGo classic car events", url: absoluteUrl("/"),
        description: siteDescription, inLanguage: "en-GB", publisher: { "@id": publisherId },
      },
    ],
  };
}

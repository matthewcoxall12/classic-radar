import type { SearchResult } from "@/lib/agent/providers/types";

export type CandidateEvent = {
  title: string;
  description?: string;
  sourceUrl: string;
  sourceTitle?: string;
  dateText?: string;
  locationText?: string;
  eventType?: string;
  bookingUrl?: string;
  imageUrl?: string;
};

export type ParsedDate = {
  start_date: string;
  start_time?: string;
  end_date?: string;
};

export type NormalisedEvent = {
  title: string;
  description?: string;
  event_type: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  venue_name?: string;
  town?: string;
  county?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
  booking_url?: string;
  image_url?: string;
};

const monthMap: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
};

const locationHints: Record<string, Partial<NormalisedEvent>> = {
  bicester: { town: "Bicester", county: "Oxfordshire", latitude: 51.9159, longitude: -1.1401 },
  weybridge: { town: "Weybridge", county: "Surrey", latitude: 51.3536, longitude: -0.4656 },
  newark: { town: "Newark", county: "Nottinghamshire", latitude: 53.1007, longitude: -0.7584 },
  shrewsbury: { town: "Shrewsbury", county: "Shropshire", latitude: 52.7073, longitude: -2.7553 },
  cirencester: { town: "Cirencester", county: "Gloucestershire", latitude: 51.7175, longitude: -1.9682 }
};

function cleanTitle(title: string) {
  return title
    .replace(/\b(Facebook|Eventbrite|Tickets|TicketSource|Ticket Tailor|What's On|What’s On)\b/gi, "")
    .replace(/\s+[-|]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function parseDateText(dateText: string): ParsedDate | null {
  const iso = dateText.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return { start_date: `${iso[1]}-${iso[2]}-${iso[3]}` };
  const exact = dateText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i);
  if (!exact) return null;
  const day = exact[1].padStart(2, "0");
  const month = monthMap[exact[2].toLowerCase()];
  return { start_date: `${exact[3]}-${month}-${day}` };
}

export function extractLocationText(text: string): string | null {
  const postcode = text.match(/[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}/i)?.[0];
  if (postcode) return postcode.toUpperCase();
  const known = Object.keys(locationHints).find((town) => new RegExp(`\\b${town}\\b`, "i").test(text));
  return known ?? null;
}

export function inferEventType(text: string) {
  if (/autojumble/i.test(text)) return "Autojumble";
  if (/cars?\s*(and|&)\s*coffee|breakfast car meet/i.test(text)) return "Cars & coffee";
  if (/road run/i.test(text)) return "Rally / road run";
  if (/rally/i.test(text)) return "Rally / road run";
  if (/museum|open day|venue event/i.test(text)) return "Museum / venue event";
  if (/club meet|owners club|register/i.test(text)) return "Club meet";
  if (/american|hot rod|custom/i.test(text)) return "American / hot rod";
  if (/vintage|pre-war|heritage vehicle/i.test(text)) return "Vintage / pre-war";
  return "Classic car show";
}

export function extractCandidateFromSearchResult(result: SearchResult): CandidateEvent | null {
  const text = [result.title, result.snippet, result.dateText, result.locationText].filter(Boolean).join(" ");
  if (!/classic|vintage|heritage|autojumble|cars?\s*(and|&)\s*coffee|road run|vehicle|motor museum|rally/i.test(text)) return null;

  return {
    title: cleanTitle(result.title),
    description: result.snippet,
    sourceUrl: result.url,
    sourceTitle: result.title,
    dateText: result.dateText ?? text,
    locationText: result.locationText ?? extractLocationText(text) ?? undefined,
    eventType: inferEventType(text),
    bookingUrl: result.url,
    imageUrl: result.imageUrl
  };
}

export function normaliseCandidate(candidate: CandidateEvent): NormalisedEvent {
  const parsedDate = candidate.dateText ? parseDateText(candidate.dateText) : null;
  const fullText = [candidate.title, candidate.description, candidate.locationText].filter(Boolean).join(" ");
  const postcode = fullText.match(/[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}/i)?.[0]?.toUpperCase();
  const locationKey = Object.keys(locationHints).find((town) => new RegExp(`\\b${town}\\b`, "i").test(fullText));
  const hint = locationKey ? locationHints[locationKey] : {};

  return {
    title: candidate.title,
    description: candidate.description,
    event_type: candidate.eventType ?? inferEventType(fullText),
    ...parsedDate,
    venue_name: /bicester heritage/i.test(fullText)
      ? "Bicester Heritage"
      : /brooklands museum/i.test(fullText)
        ? "Brooklands Museum"
        : /newark showground/i.test(fullText)
          ? "Newark Showground"
          : undefined,
    postcode,
    ...hint,
    booking_url: candidate.bookingUrl,
    image_url: candidate.imageUrl
  };
}

import type { AdminQueueItem } from "@/lib/operations-queue";
import { publicationFields, type DiscoveryCategory } from "@/lib/discovery-payload";
import { shortReference } from "@/lib/operations-queue";

export type ReviewQueueRow = {
  id: string;
  candidate_key: string;
  proposed_event: Record<string, unknown>;
  source_url: string;
  reason: string;
  confidence_score: number;
  status: "pending" | "approved" | "rejected" | "merged";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventSourceLink = {
  event_id: string;
  provider: string;
  source_url: string;
  canonical_url: string;
};

export type SourceRegistryRow = {
  id: string;
  source_key: string;
  source_name: string;
  source_type: string;
  start_url: string;
  requires_review: boolean;
  is_active: boolean;
  notes: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export type EditableDiscoveryCandidate = Omit<
  NonNullable<AdminQueueItem["editableCandidate"]>,
  "category"
> & { category: DiscoveryCategory };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function eventTypeToAdminCategory(value: unknown): DiscoveryCategory {
  const eventType = text(value).toLowerCase();
  if (eventType.includes("autojumble") || eventType.includes("swap")) return "Autojumble";
  if (eventType.includes("rally") || eventType.includes("road run") || eventType.includes("tour")) return "Run";
  if (
    eventType.includes("motorsport") ||
    eventType.includes("race") ||
    eventType.includes("hill")
  ) return "Motorsport";
  if (eventType.includes("meet") || eventType.includes("coffee") || eventType.includes("club")) return "Meet";
  if (eventType.includes("show") || eventType.includes("museum") || eventType.includes("vintage")) return "Show";
  return "Other";
}

export function adminCategoryToEventType(value: string) {
  const categories: Record<string, string> = {
    Show: "Classic car show",
    Meet: "Club meet",
    Autojumble: "Autojumble",
    Motorsport: "Motorsport",
    Run: "Rally / road run",
  };
  return categories[value] ?? "Classic car show";
}

export function proposedEventId(proposedEvent: Record<string, unknown>) {
  const id = text(proposedEvent.id);
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id : null;
}

export function proposalToEditableCandidate(
  proposedEvent: Record<string, unknown>,
  sourceUrl: string,
): EditableDiscoveryCandidate {
  const bookingUrl = text(proposedEvent.booking_url);
  const organiserUrl = text(proposedEvent.organiser_url);
  const startTime = optionalText(proposedEvent.start_time)?.slice(0, 5) ?? null;
  return {
    title: text(proposedEvent.title),
    description: text(proposedEvent.description),
    organiserName: text(proposedEvent.organiser_name),
    venue: text(proposedEvent.venue_name) || text(proposedEvent.address),
    town: text(proposedEvent.town),
    postcode: text(proposedEvent.postcode),
    countryCode: text(proposedEvent.country_code).toUpperCase() || "GB",
    adminArea: text(proposedEvent.county),
    timezone: text(proposedEvent.timezone) || "Europe/London",
    startDate: text(proposedEvent.start_date),
    endDate: optionalText(proposedEvent.end_date),
    startTime,
    category: eventTypeToAdminCategory(proposedEvent.event_type),
    officialUrl: bookingUrl || organiserUrl || sourceUrl,
    price: text(proposedEvent.price_text),
    latitude: optionalNumber(proposedEvent.latitude),
    longitude: optionalNumber(proposedEvent.longitude),
  };
}

export function editableCandidateToEventPatch(
  candidate: EditableDiscoveryCandidate,
  proposedEvent: Record<string, unknown>,
) {
  return {
    ...proposedEvent,
    title: candidate.title,
    description: candidate.description,
    organiser_name: candidate.organiserName || null,
    venue_name: candidate.venue,
    town: candidate.town,
    postcode: candidate.postcode || null,
    country_code: candidate.countryCode,
    county: candidate.adminArea || null,
    timezone: candidate.timezone,
    start_date: candidate.startDate,
    end_date: candidate.endDate,
    start_time: candidate.startTime,
    event_type: adminCategoryToEventType(candidate.category),
    booking_url: candidate.officialUrl,
    price_text: candidate.price || null,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  };
}

function displayStatus(row: ReviewQueueRow, linkedEventStatus?: string | null) {
  return row.status === "merged" || linkedEventStatus === "published"
    ? "published"
    : row.status;
}

export function reviewRowToAdminItem(
  row: ReviewQueueRow,
  sourceLink: EventSourceLink | null,
  source: SourceRegistryRow | null,
  linkedEventStatus?: string | null,
): AdminQueueItem {
  const candidate = proposalToEditableCandidate(row.proposed_event, row.source_url);
  const status = displayStatus(row, linkedEventStatus);
  const publication = publicationFields({
    id: row.id,
    ...candidate,
    status,
    reviewRequired: status !== "approved",
    publishedEventId: status === "published" ? proposedEventId(row.proposed_event) : null,
  });
  if (!source?.is_active && publication.ready) {
    publication.ready = false;
    publication.missing.push("active reviewed source");
  }
  return {
    kind: "discovery",
    id: row.id,
    reference: shortReference("discovery", row.id),
    title: candidate.title || "Untitled discovery candidate",
    subtitle: `${candidate.category} · ${candidate.venue || "Venue needed"}, ${candidate.town || "Town needed"}`,
    contactName: candidate.organiserName || source?.source_name || "Source review",
    email: "",
    status,
    internalNotes: row.reason,
    assignedTo: "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewRequired: status !== "approved" && status !== "published",
    publication,
    editableCandidate: candidate,
    sourceReview: source
      ? {
          id: source.id,
          updatedAt: source.updated_at,
          status: source.is_active ? "active" : "paused",
          trustLevel: "unverified",
        }
      : undefined,
    fields: [
      source ? { label: "Source", value: source.source_name } : null,
      source ? { label: "Source type", value: source.source_type } : null,
      { label: "Confidence", value: `${row.confidence_score}/100` },
      source?.last_error ? { label: "Last source error", value: source.last_error } : null,
      { label: "Observed", value: row.created_at },
      {
        label: "Source page",
        value: sourceLink?.canonical_url || row.source_url,
        url: sourceLink?.canonical_url || row.source_url,
      },
    ].filter((field): field is { label: string; value: string; url?: string } => Boolean(field)),
  };
}

export function reviewStatusForDatabase(value: string) {
  if (value === "published") return "merged" as const;
  if (value === "reviewing") return "pending" as const;
  if (["pending", "approved", "rejected", "merged"].includes(value)) {
    return value as ReviewQueueRow["status"];
  }
  return null;
}

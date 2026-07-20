export type EventRow = Record<string, unknown>;

const PRESERVE_WHEN_PRESENT = [
  "venue_name", "address", "town", "county", "postcode", "latitude", "longitude", "price_text",
  "booking_url", "organiser_name", "organiser_url", "image_url", "start_time", "end_date", "end_time"
] as const;

function present(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim().length > 0);
}

export function mergeExistingEvent(incoming: EventRow, existing: EventRow): EventRow {
  const merged: EventRow = { ...incoming };
  if (present(existing.title)) merged.title = existing.title;
  if (present(existing.slug)) merged.slug = existing.slug;
  if (present(existing.dedupe_key)) merged.dedupe_key = existing.dedupe_key;
  if (present(existing.timezone)) merged.timezone = existing.timezone;

  const incomingDescription = String(incoming.description ?? "").trim();
  const existingDescription = String(existing.description ?? "").trim();
  merged.description = incomingDescription.length > existingDescription.length ? incomingDescription : existingDescription;

  for (const field of PRESERVE_WHEN_PRESENT) {
    if (present(existing[field])) merged[field] = existing[field];
  }
  if (present(existing.event_type) && existing.event_type !== "Classic car show") merged.event_type = existing.event_type;

  const existingStatus = String(existing.status ?? "");
  if (["published", "cancelled", "rejected"].includes(existingStatus)) merged.status = existingStatus;
  merged.is_verified = Boolean(existing.is_verified) || Boolean(incoming.is_verified);
  merged.confidence_score = Math.max(Number(existing.confidence_score ?? 0), Number(incoming.confidence_score ?? 0));
  merged.booking_required = Boolean(existing.booking_required) || Boolean(incoming.booking_required);
  merged.source_count = Math.max(Number(existing.source_count ?? 0), Number(incoming.source_count ?? 0));
  return merged;
}

export function uniqueSourceCount(existingUrls: string[], incomingUrls: string[]): number {
  return new Set([...existingUrls, ...incomingUrls].filter(Boolean)).size;
}


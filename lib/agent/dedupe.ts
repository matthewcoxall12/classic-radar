import type { NormalisedEvent } from "./event-extractor.ts";

export type ExistingEventForDedupe = {
  id: string;
  title: string;
  start_date?: string | null;
  town?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confidence_score?: number | null;
};

export type DuplicateMatch = {
  event: ExistingEventForDedupe;
  score: number;
  reason: string;
};

export function normaliseTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(2026|classic|car|cars|show|event|events|meet|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleSimilarity(a: string, b: string) {
  const aTokens = new Set(normaliseTitle(a).split(/\s+/).filter(Boolean));
  const bTokens = new Set(normaliseTitle(b).split(/\s+/).filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
}

function distanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadiusMiles = 3958.7613;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function findPotentialDuplicate(candidate: NormalisedEvent, existingEvents: ExistingEventForDedupe[]): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;

  for (const event of existingEvents) {
    const similarity = titleSimilarity(candidate.title, event.title);
    const sameDate = Boolean(candidate.start_date && event.start_date === candidate.start_date);
    const sameTown = Boolean(candidate.town && event.town && candidate.town.toLowerCase() === event.town.toLowerCase());
    const closeCoordinates = Boolean(
      sameDate &&
        candidate.latitude &&
        candidate.longitude &&
        event.latitude &&
        event.longitude &&
        distanceMiles({ latitude: candidate.latitude, longitude: candidate.longitude }, { latitude: event.latitude, longitude: event.longitude }) <= 5
    );

    const reason =
      similarity >= 0.82 && sameDate
        ? "High title similarity and same date."
        : sameDate && sameTown && similarity >= 0.65
          ? "Same date, same town and similar title."
          : closeCoordinates && similarity >= 0.65
            ? "Same date, nearby coordinates and similar title."
            : "";

    if (reason && (!best || similarity > best.score)) best = { event, score: similarity, reason };
  }

  return best;
}

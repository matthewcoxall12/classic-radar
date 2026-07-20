export type EventSearchQuery = {
  [key: string]: string | string[] | undefined;
};

const SEARCH_KEYS = ["q", "location", "lat", "lng", "radius", "date", "types"] as const;

export type EventSearchPlan = {
  submitted: boolean;
  localSearch: boolean;
  radius: string;
  effectiveRadius: string;
  usedUkFallback: boolean;
};

export function resolveEventSearch(query: EventSearchQuery): EventSearchPlan {
  const submitted = SEARCH_KEYS.some((key) => Object.hasOwn(query, key));
  const radius = typeof query.radius === "string" ? query.radius : "50";
  const countryWide = radius === "uk" || radius === "europe";
  const hasCoordinates = validCoordinatePair(query.lat, query.lng);
  const localSearch = !countryWide && Boolean(
    (typeof query.location === "string" && query.location.trim()) || hasCoordinates
  );
  const usedUkFallback = submitted && !localSearch && !countryWide;

  return {
    submitted,
    localSearch,
    radius,
    effectiveRadius: usedUkFallback ? "uk" : radius,
    usedUkFallback
  };
}

export function eventSearchTerms(value?: string) {
  return [...new Set(
    String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("en-GB")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  )].slice(0, 8);
}

export function eventTextMatches(values: Array<string | null | undefined>, terms: string[]) {
  if (!terms.length) return true;
  const searchable = eventSearchTerms(values.filter(Boolean).join(" ")).join(" ");
  return terms.every((term) => searchable.includes(term));
}

function validCoordinatePair(latitude: string | string[] | undefined, longitude: string | string[] | undefined) {
  if (typeof latitude !== "string" || typeof longitude !== "string") return false;
  if (!latitude.trim() || !longitude.trim()) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

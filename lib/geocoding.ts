type GeocodedLocation = { latitude: number; longitude: number; label: string };

type NominatimResult = {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
};

type PostcodesIoResult = {
  postcode?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  admin_district?: unknown;
  region?: unknown;
  country?: unknown;
};

type PostcodesIoResponse = {
  status?: unknown;
  result?: PostcodesIoResult | null;
};

const MAX_QUERY_LENGTH = 120;
const POSITIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 500;
const NOMINATIM_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 8_000;
const APP_USER_AGENT = "ClassicsGo/1.0 (+https://classicsgo.com; support@classicsgo.com)";
const EUROPE_COUNTRY_CODES = [
  "ad", "al", "at", "ba", "be", "bg", "by", "ch", "cy", "cz", "de", "dk", "ee", "es", "fi", "fr", "gb",
  "gr", "hr", "hu", "ie", "is", "it", "li", "lt", "lu", "lv", "mc", "md", "me", "mk", "mt", "nl", "no",
  "pl", "pt", "ro", "rs", "se", "si", "sk", "sm", "tr", "ua", "va", "xk"
].join(",");

const UK_POSTCODE_PATTERN = /^(?:GIR\s?0AA|[A-PR-UWYZ][A-HK-Y]?\d[\dA-HJKPSTUW]?\s?\d[ABD-HJLNP-UW-Z]{2})$/i;

type CacheEntry = {
  expiresAt: number;
  value: GeocodedLocation | null;
};

const locationCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<GeocodedLocation | null>>();
let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimRequestStartedAt = 0;

function normaliseQuery(input?: string | null) {
  if (typeof input !== "string" || input.length > MAX_QUERY_LENGTH) return null;
  const query = input
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) return null;
  if (/^(?:https?:\/\/|www\.)/i.test(query)) return null;
  return query;
}

function canonicalUkPostcode(query: string) {
  if (!UK_POSTCODE_PATTERN.test(query)) return null;
  const compact = query.replace(/\s+/g, "").toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function coordinateValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

export function hasValidCoordinatePair(latitude?: string | null, longitude?: string | null) {
  return validCoordinate(coordinateValue(latitude), coordinateValue(longitude));
}

function textValue(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 240) : null;
}

function readCache(key: string) {
  const cached = locationCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    locationCache.delete(key);
    return undefined;
  }
  // Refresh insertion order so the size bound behaves like a small LRU cache.
  locationCache.delete(key);
  locationCache.set(key, cached);
  return cached.value;
}

function writeCache(key: string, value: GeocodedLocation | null) {
  if (locationCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = locationCache.keys().next().value;
    if (oldest) locationCache.delete(oldest);
  }
  locationCache.set(key, {
    expiresAt: Date.now() + (value ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    value
  });
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchNominatim(url: URL) {
  const request = nominatimQueue.catch(() => undefined).then(async () => {
    const remaining = NOMINATIM_INTERVAL_MS - (Date.now() - lastNominatimRequestStartedAt);
    if (remaining > 0) await wait(remaining);
    lastNominatimRequestStartedAt = Date.now();
    return fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-GB,en;q=0.8",
        "User-Agent": APP_USER_AGENT
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: Math.floor(POSITIVE_CACHE_TTL_MS / 1_000) }
    });
  });
  nominatimQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function lookupUkPostcode(postcode: string): Promise<GeocodedLocation | null | undefined> {
  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, {
      headers: { Accept: "application/json", "User-Agent": APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: Math.floor(POSITIVE_CACHE_TTL_MS / 1_000) }
    });
    if (response.status === 404) return null;
    if (!response.ok) return undefined;

    const body = (await response.json()) as PostcodesIoResponse;
    if (body.status !== 200 || !body.result) return null;
    const latitude = coordinateValue(body.result.latitude);
    const longitude = coordinateValue(body.result.longitude);
    if (!validCoordinate(latitude, longitude)) return null;

    const canonical = textValue(body.result.postcode) ?? postcode;
    const area = textValue(body.result.admin_district) ?? textValue(body.result.region) ?? textValue(body.result.country);
    return { latitude, longitude, label: area ? `${canonical}, ${area}` : canonical };
  } catch {
    // Falling back to Nominatim keeps postcode search available during a postcodes.io outage.
    return undefined;
  }
}

async function lookupNominatim(query: string): Promise<GeocodedLocation | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", EUROPE_COUNTRY_CODES);
    url.searchParams.set("email", "support@classicsgo.com");

    const response = await fetchNominatim(url);
    if (!response.ok) return null;

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return null;
    const result = body[0] as NominatimResult | undefined;
    const latitude = coordinateValue(result?.lat);
    const longitude = coordinateValue(result?.lon);
    if (!validCoordinate(latitude, longitude)) return null;
    return { latitude, longitude, label: textValue(result?.display_name) ?? query };
  } catch {
    return null;
  }
}

export async function geocodeLocation(input?: string | null): Promise<GeocodedLocation | null> {
  const query = normaliseQuery(input);
  if (!query) return null;

  const postcode = canonicalUkPostcode(query);
  const cacheKey = `${postcode ? "postcode" : "place"}:${(postcode ?? query).toLocaleLowerCase("en-GB")}`;
  const cached = readCache(cacheKey);
  if (cached !== undefined) return cached;

  const existingRequest = inFlight.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const postcodeResult = postcode ? await lookupUkPostcode(postcode) : undefined;
    const result = postcodeResult === undefined ? await lookupNominatim(postcode ?? query) : postcodeResult;
    writeCache(cacheKey, result);
    return result;
  })();

  inFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inFlight.delete(cacheKey);
  }
}

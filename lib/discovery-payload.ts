export const DISCOVERY_BODY_LIMIT = 12_000;

const SUPPORTED_DISCOVERY_COUNTRY_CODES = [
  "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "CH",
  "AT", "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "SK", "HU", "SI",
  "HR", "RO", "BG", "GR", "EE", "LV", "LT", "MT", "CY", "TR", "RS",
  "BA", "AL", "ME", "MK", "AD", "MC", "SM", "LI",
] as const;

const sourceTypes = [
  "organizer_feed",
  "partner_api",
  "calendar",
  "structured_data",
  "social_api",
  "licensed_search",
  "manual_import",
] as const;
const permissionBases = [
  "organizer_authorized",
  "partner_contract",
  "public_web_permitted",
  "platform_api",
  "manual_review",
] as const;
const discoveryMethods = [
  "organizer_feed",
  "partner_api",
  "ical",
  "json_ld",
  "rss",
  "social_api",
  "licensed_search",
  "firecrawl",
  "eventbrite",
  "microdata",
  "opengraph",
  "manual_import",
] as const;
const categories = [
  "Show",
  "Meet",
  "Autojumble",
  "Motorsport",
  "Run",
  "Other",
] as const;
const observedFieldNames = [
  "title",
  "description",
  "organiserName",
  "venue",
  "town",
  "postcode",
  "countryCode",
  "adminArea",
  "timezone",
  "startDate",
  "endDate",
  "startTime",
  "category",
  "officialUrl",
  "price",
  "latitude",
  "longitude",
] as const;

export type DiscoverySourceType = (typeof sourceTypes)[number];
export type DiscoveryPermissionBasis = (typeof permissionBases)[number];
export type DiscoveryMethod = (typeof discoveryMethods)[number];
export type DiscoveryCategory = (typeof categories)[number];
export type DiscoveryObservedField = (typeof observedFieldNames)[number];

export type NormalizedDiscoveryPayload = {
  schemaVersion: 1 | 2;
  idempotencyKey: string;
  source: {
    key: string;
    name: string;
    type: DiscoverySourceType;
    canonicalUrl: string;
    permissionBasis: DiscoveryPermissionBasis;
  };
  candidate: {
    title: string;
    description: string;
    organiserName: string;
    venue: string;
    town: string;
    postcode: string;
    countryCode: string;
    adminArea: string;
    timezone: string;
    startDate: string;
    endDate: string | null;
    startTime: string | null;
    category: DiscoveryCategory;
    officialUrl: string;
    price: string;
    latitude: number | null;
    longitude: number | null;
  };
  provenance: {
    sourceUrl: string;
    externalId: string | null;
    contentHash: string;
    method: DiscoveryMethod;
    confidence: number;
    observedFields: DiscoveryObservedField[];
    observedAt: string;
  };
};

export type DiscoveryIds = {
  sourceId: string;
  candidateId: string;
  provenanceId: string;
  dedupeKey: string;
  idempotencyHash: string;
};

export class DiscoveryPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryPayloadError";
  }
}

const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const htmlLike = /<\s*\/?\s*[a-z][^>]*>|&(?:lt|gt|#0*60|#x0*3c);/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function record(value: unknown, label: string, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DiscoveryPayloadError(`${label} must be an object.`);
  }
  const output = value as Record<string, unknown>;
  for (const key of Object.keys(output)) {
    if (!keys.includes(key)) {
      throw new DiscoveryPayloadError(`${label} contains an unsupported field.`);
    }
  }
  return output;
}

function cleanText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  options: { optional?: boolean; rejectHtml?: boolean } = {},
) {
  if (value === undefined && options.optional) return "";
  if (typeof value !== "string") {
    throw new DiscoveryPayloadError(`${label} must be text.`);
  }
  const cleaned = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (cleaned.length < minimum || cleaned.length > maximum) {
    throw new DiscoveryPayloadError(
      `${label} must be between ${minimum} and ${maximum} characters.`,
    );
  }
  if (controlCharacters.test(cleaned)) {
    throw new DiscoveryPayloadError(`${label} contains unsafe characters.`);
  }
  if (options.rejectHtml && htmlLike.test(cleaned)) {
    throw new DiscoveryPayloadError(`${label} must contain facts, not HTML.`);
  }
  return cleaned;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  label: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new DiscoveryPayloadError(`${label} is not supported.`);
  }
  return value as T[number];
}

function parsedDate(value: unknown, label: string) {
  if (typeof value !== "string" || !datePattern.test(value)) {
    throw new DiscoveryPayloadError(`${label} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DiscoveryPayloadError(`${label} is not a real calendar date.`);
  }
  return { value, date };
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function safeHttpsUrl(value: unknown, label: string) {
  if (typeof value !== "string" || value.length < 10 || value.length > 1_500) {
    throw new DiscoveryPayloadError(`${label} must be a public HTTPS URL.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DiscoveryPayloadError(`${label} must be a public HTTPS URL.`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    hostname.length > 253 ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(hostname) ||
    hostname.includes(":") ||
    /^\d+(?:\.\d+){3}$/.test(hostname) ||
    !hostname.split(".").every(
      (part) =>
        part.length >= 1 &&
        part.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part),
    )
  ) {
    throw new DiscoveryPayloadError(`${label} must be a public HTTPS URL.`);
  }
  url.hostname = hostname;
  if (url.port === "443") url.port = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase().replace(/[-.]/g, "_");
    if (
      /(?:^|_)(?:token|key|secret|signature|sig|credential|password|auth|authorization|session|jwt|code)(?:_|$)/.test(
        normalizedKey,
      )
    ) {
      throw new DiscoveryPayloadError(`${label} must not contain credentials or signed access parameters.`);
    }
    if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/.test(normalizedKey)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export function validatePublicHttpsUrl(value: unknown, label = "URL") {
  return safeHttpsUrl(value, label);
}

function optionalNumber(value: unknown, label: string, minimum: number, maximum: number) {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DiscoveryPayloadError(`${label} is outside its valid range.`);
  }
  return value;
}

function normalizePostcode(value: string) {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  if (compact.length < 5) return value.toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function validateDiscoveryPayload(
  input: unknown,
  now = new Date(),
): NormalizedDiscoveryPayload {
  const root = record(input, "Request", [
    "schemaVersion",
    "idempotencyKey",
    "source",
    "candidate",
    "provenance",
  ]);
  if (root.schemaVersion !== 1 && root.schemaVersion !== 2) {
    throw new DiscoveryPayloadError("schemaVersion must be 1 or 2.");
  }
  const idempotencyKey = cleanText(root.idempotencyKey, "idempotencyKey", 8, 200);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(idempotencyKey)) {
    throw new DiscoveryPayloadError("idempotencyKey contains unsupported characters.");
  }

  const rawSource = record(root.source, "source", [
    "key",
    "name",
    "type",
    "canonicalUrl",
    "permissionBasis",
  ]);
  const sourceKey = cleanText(rawSource.key, "source.key", 3, 100).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(sourceKey)) {
    throw new DiscoveryPayloadError("source.key contains unsupported characters.");
  }
  const sourceType = enumValue(rawSource.type, "source.type", sourceTypes);
  const canonicalUrl = safeHttpsUrl(rawSource.canonicalUrl, "source.canonicalUrl");

  const rawCandidate = record(root.candidate, "candidate", [
    ...observedFieldNames,
  ]);
  const start = parsedDate(rawCandidate.startDate, "candidate.startDate");
  const today = utcDay(now);
  const latest = new Date(today);
  latest.setUTCFullYear(latest.getUTCFullYear() + 3);
  if (start.date < today || start.date > latest) {
    throw new DiscoveryPayloadError("candidate.startDate must be within the next three years.");
  }
  let endDate: string | null = null;
  if (rawCandidate.endDate !== undefined) {
    const end = parsedDate(rawCandidate.endDate, "candidate.endDate");
    const durationDays = Math.round((end.date.getTime() - start.date.getTime()) / 86_400_000);
    if (durationDays < 0 || durationDays > 90) {
      throw new DiscoveryPayloadError("candidate.endDate must be on or within 90 days of the start date.");
    }
    endDate = end.value;
  }
  let startTime: string | null = null;
  if (rawCandidate.startTime !== undefined) {
    if (typeof rawCandidate.startTime !== "string" || !timePattern.test(rawCandidate.startTime)) {
      throw new DiscoveryPayloadError("candidate.startTime must use 24-hour HH:MM.");
    }
    startTime = rawCandidate.startTime;
  }
  const latitude = optionalNumber(rawCandidate.latitude, "candidate.latitude", -90, 90);
  const longitude = optionalNumber(rawCandidate.longitude, "candidate.longitude", -180, 180);
  if ((latitude === null) !== (longitude === null)) {
    throw new DiscoveryPayloadError("candidate coordinates must include latitude and longitude together.");
  }

  const rawCountryCode = rawCandidate.countryCode === undefined && root.schemaVersion === 1
    ? "GB"
    : cleanText(rawCandidate.countryCode, "candidate.countryCode", 2, 2).toUpperCase();
  const countryCode = rawCountryCode === "UK" ? "GB" : rawCountryCode;
  if (!SUPPORTED_DISCOVERY_COUNTRY_CODES.includes(
    countryCode as (typeof SUPPORTED_DISCOVERY_COUNTRY_CODES)[number],
  )) {
    throw new DiscoveryPayloadError("candidate.countryCode must be a supported UK or European ISO alpha-2 code.");
  }
  const timezone = rawCandidate.timezone === undefined && root.schemaVersion === 1
    ? "Europe/London"
    : cleanText(rawCandidate.timezone, "candidate.timezone", 3, 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now);
  } catch {
    throw new DiscoveryPayloadError("candidate.timezone must be a valid IANA timezone.");
  }
  const postcode = cleanText(rawCandidate.postcode, "candidate.postcode", 0, 16, {
    optional: true,
  });

  const candidate = {
    title: cleanText(rawCandidate.title, "candidate.title", 3, 160, { rejectHtml: true }),
    description: cleanText(rawCandidate.description, "candidate.description", 0, 1_500, {
      optional: true,
      rejectHtml: true,
    }),
    organiserName: cleanText(rawCandidate.organiserName, "candidate.organiserName", 0, 160, {
      optional: true,
      rejectHtml: true,
    }),
    venue: cleanText(rawCandidate.venue, "candidate.venue", 2, 180, { rejectHtml: true }),
    town: cleanText(rawCandidate.town, "candidate.town", 2, 120, { rejectHtml: true }),
    postcode: countryCode === "GB" ? normalizePostcode(postcode) : postcode.toUpperCase(),
    countryCode,
    adminArea: cleanText(rawCandidate.adminArea, "candidate.adminArea", 0, 120, {
      optional: true,
      rejectHtml: true,
    }),
    timezone,
    startDate: start.value,
    endDate,
    startTime,
    category:
      rawCandidate.category === undefined
        ? ("Other" as const)
        : enumValue(rawCandidate.category, "candidate.category", categories),
    officialUrl: safeHttpsUrl(rawCandidate.officialUrl, "candidate.officialUrl"),
    price: cleanText(rawCandidate.price, "candidate.price", 0, 100, {
      optional: true,
      rejectHtml: true,
    }),
    latitude,
    longitude,
  };

  const rawProvenance = record(root.provenance, "provenance", [
    "sourceUrl",
    "externalId",
    "contentHash",
    "method",
    "confidence",
    "observedFields",
    "observedAt",
  ]);
  const sourceUrl = safeHttpsUrl(rawProvenance.sourceUrl, "provenance.sourceUrl");
  if (new URL(sourceUrl).origin !== new URL(canonicalUrl).origin) {
    throw new DiscoveryPayloadError("provenance.sourceUrl must use the registered source origin.");
  }
  const method = enumValue(rawProvenance.method, "provenance.method", discoveryMethods);
  const methodCompatibility: Record<DiscoverySourceType, readonly DiscoveryMethod[]> = {
    organizer_feed: ["organizer_feed", "ical", "json_ld", "rss", "microdata", "opengraph"],
    partner_api: ["partner_api", "eventbrite"],
    calendar: ["ical"],
    structured_data: ["json_ld", "rss", "microdata", "opengraph", "firecrawl"],
    social_api: ["social_api"],
    licensed_search: ["licensed_search", "firecrawl"],
    manual_import: ["manual_import"],
  };
  if (!methodCompatibility[sourceType].includes(method)) {
    throw new DiscoveryPayloadError("provenance.method does not match source.type.");
  }
  if (!Array.isArray(rawProvenance.observedFields) || rawProvenance.observedFields.length > observedFieldNames.length) {
    throw new DiscoveryPayloadError("provenance.observedFields must be a bounded list.");
  }
  const observedFields = rawProvenance.observedFields.map((field) =>
    enumValue(field, "provenance.observedFields", observedFieldNames),
  );
  if (new Set(observedFields).size !== observedFields.length) {
    throw new DiscoveryPayloadError("provenance.observedFields cannot contain duplicates.");
  }
  for (const required of ["title", "startDate", "officialUrl"] as const) {
    if (!observedFields.includes(required)) {
      throw new DiscoveryPayloadError(`provenance.observedFields must include ${required}.`);
    }
  }
  if (typeof rawProvenance.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(rawProvenance.contentHash)) {
    throw new DiscoveryPayloadError("provenance.contentHash must be a lowercase SHA-256 hash.");
  }
  if (!Number.isInteger(rawProvenance.confidence) || Number(rawProvenance.confidence) < 0 || Number(rawProvenance.confidence) > 100) {
    throw new DiscoveryPayloadError("provenance.confidence must be an integer from 0 to 100.");
  }
  let observedAt = now.toISOString();
  if (rawProvenance.observedAt !== undefined) {
    if (typeof rawProvenance.observedAt !== "string" || rawProvenance.observedAt.length > 40) {
      throw new DiscoveryPayloadError("provenance.observedAt must be an ISO timestamp.");
    }
    const parsed = new Date(rawProvenance.observedAt);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getTime() > now.getTime() + 5 * 60_000 ||
      parsed.getTime() < now.getTime() - 366 * 86_400_000
    ) {
      throw new DiscoveryPayloadError("provenance.observedAt is outside the accepted window.");
    }
    observedAt = parsed.toISOString();
  }

  return {
    schemaVersion: root.schemaVersion,
    idempotencyKey,
    source: {
      key: sourceKey,
      name: cleanText(rawSource.name, "source.name", 2, 160, { rejectHtml: true }),
      type: sourceType,
      canonicalUrl,
      permissionBasis: enumValue(
        rawSource.permissionBasis,
        "source.permissionBasis",
        permissionBases,
      ),
    },
    candidate,
    provenance: {
      sourceUrl,
      externalId: cleanText(rawProvenance.externalId, "provenance.externalId", 0, 200, {
        optional: true,
      }) || null,
      contentHash: rawProvenance.contentHash,
      method,
      confidence: Number(rawProvenance.confidence),
      observedFields,
      observedAt,
    },
  };
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function fingerprintText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function discoveryIds(
  payload: NormalizedDiscoveryPayload,
): Promise<DiscoveryIds> {
  const sourceHash = await sha256Hex(`source:v1:${payload.source.key}`);
  const dedupeKey = await sha256Hex(
    [
      "candidate:v1",
      fingerprintText(payload.candidate.title),
      payload.candidate.startDate,
      fingerprintText(payload.candidate.venue),
      fingerprintText(payload.candidate.town),
      payload.candidate.countryCode,
      payload.candidate.postcode.replace(/\s+/g, "").toLowerCase(),
    ].join("|"),
  );
  const idempotencyHash = await sha256Hex(
    `observation:v1:${payload.source.key}:${payload.idempotencyKey}`,
  );
  return {
    sourceId: `src_${sourceHash.slice(0, 32)}`,
    candidateId: `can_${dedupeKey.slice(0, 32)}`,
    provenanceId: `prv_${idempotencyHash.slice(0, 32)}`,
    dedupeKey,
    idempotencyHash,
  };
}

export function validateAdminCandidateFields(input: unknown, now = new Date()) {
  const candidate =
    input && typeof input === "object" && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : input;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const values = candidate as Record<string, unknown>;
    for (const key of ["endDate", "startTime", "latitude", "longitude"] as const) {
      if (values[key] === null || values[key] === "") delete values[key];
    }
  }
  return validateDiscoveryPayload(
    {
      schemaVersion: 1,
      idempotencyKey: "admin-editor:validated",
      source: {
        key: "admin-editor",
        name: "Administrator event editor",
        type: "manual_import",
        canonicalUrl: "https://classicsgo.com/admin",
        permissionBasis: "manual_review",
      },
      candidate,
      provenance: {
        sourceUrl: "https://classicsgo.com/admin",
        contentHash: "0".repeat(64),
        method: "manual_import",
        confidence: 100,
        observedFields: ["title", "startDate", "officialUrl"],
        observedAt: now.toISOString(),
      },
    },
    now,
  ).candidate;
}

export type PublishCandidate = NormalizedDiscoveryPayload["candidate"] & {
  id: string;
  status: string;
  publishedEventId?: string | null;
  reviewRequired?: boolean;
};

export function publicationFields(candidate: PublishCandidate, now = new Date()) {
  const missing: string[] = [];
  if (candidate.status !== "approved") missing.push("editorial approval");
  if (candidate.reviewRequired) missing.push("review of the latest observation");
  if (candidate.description.trim().length < 10) missing.push("description");
  if (!candidate.startTime || !timePattern.test(candidate.startTime)) missing.push("start time");
  if (!candidate.price.trim()) missing.push("price/admission");
  if (candidate.category === "Other" || !categories.includes(candidate.category)) missing.push("supported category");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .-]{1,15}$/u.test(candidate.postcode)) {
    missing.push("valid postal code");
  }
  if (
    candidate.latitude === null ||
    candidate.longitude === null ||
    candidate.latitude < -90 ||
    candidate.latitude > 90 ||
    candidate.longitude < -180 ||
    candidate.longitude > 180
  ) {
    missing.push("valid coordinates");
  }
  if (!/^[A-Z]{2}$/.test(candidate.countryCode)) missing.push("country code");
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate.timezone }).format(now);
  } catch {
    missing.push("valid timezone");
  }
  try {
    safeHttpsUrl(candidate.officialUrl, "official URL");
  } catch {
    missing.push("public official URL");
  }
  try {
    const start = parsedDate(candidate.startDate, "start date");
    if (start.date < utcDay(now)) missing.push("future start date");
    if (candidate.endDate) {
      const end = parsedDate(candidate.endDate, "end date");
      if (end.date < start.date || end.date.getTime() - start.date.getTime() > 90 * 86_400_000) {
        missing.push("valid end date");
      }
    }
  } catch {
    missing.push("valid event dates");
  }
  if (!candidate.title.trim()) missing.push("title");
  if (!candidate.venue.trim()) missing.push("venue");
  if (!candidate.town.trim()) missing.push("town");

  const categoryImages: Record<Exclude<DiscoveryCategory, "Other">, string> = {
    Show: "/images/event-country-show.png",
    Meet: "/images/event-paddock.png",
    Autojumble: "/images/event-autojumble.png",
    Motorsport: "/images/event-paddock.png",
    Run: "/images/hero-roadster.png",
  };
  const safeCandidateId = candidate.id
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  const eventId = `discovered-${safeCandidateId}`;
  return {
    ready: missing.length === 0,
    missing: [...new Set(missing)],
    eventId,
    image:
      candidate.category === "Other"
        ? "/images/event-country-show.png"
        : categoryImages[candidate.category],
  };
}

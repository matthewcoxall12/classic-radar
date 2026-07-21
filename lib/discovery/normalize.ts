import * as chrono from "chrono-node";
import type { DiscoveryObservedField } from "@/lib/discovery-payload";
import { sha256Hex, validateDiscoveryPayload } from "@/lib/discovery-payload";
import { scoreExtractionConfidence } from "@/lib/discovery/confidence";
import { SUPPORTED_DISCOVERY_COUNTRY_CODES } from "@/lib/discovery/geography";
import type {
  DiscoverySourceDefinition,
  NormalizedFinding,
  RawEventFinding,
} from "@/lib/discovery/types";

const datePattern = /^\d{4}-\d{2}-\d{2}/;
const timePattern = /(?:^|T|\s)([01]\d|2[0-3]):([0-5]\d)/;
const countryAliases: Record<string, string> = {
  uk: "GB", "united kingdom": "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  ireland: "IE", france: "FR", germany: "DE", deutschland: "DE", italy: "IT", italia: "IT",
  spain: "ES", españa: "ES", portugal: "PT", netherlands: "NL", "the netherlands": "NL",
  belgium: "BE", luxembourg: "LU", switzerland: "CH", austria: "AT", denmark: "DK",
  sweden: "SE", norway: "NO", finland: "FI", iceland: "IS", poland: "PL", czechia: "CZ",
  "czech republic": "CZ", slovakia: "SK", hungary: "HU", slovenia: "SI", croatia: "HR",
  romania: "RO", bulgaria: "BG", greece: "GR", estonia: "EE", latvia: "LV", lithuania: "LT",
  malta: "MT", cyprus: "CY", türkiye: "TR", turkey: "TR", serbia: "RS",
  "bosnia and herzegovina": "BA", albania: "AL", montenegro: "ME", "north macedonia": "MK",
  andorra: "AD", monaco: "MC", "san marino": "SM", liechtenstein: "LI",
};
const supportedCountryCodes = new Set<string>(SUPPORTED_DISCOVERY_COUNTRY_CODES);
const countryTimezones: Record<string, string> = {
  GB: "Europe/London", IE: "Europe/Dublin", FR: "Europe/Paris", DE: "Europe/Berlin",
  IT: "Europe/Rome", ES: "Europe/Madrid", PT: "Europe/Lisbon", NL: "Europe/Amsterdam",
  BE: "Europe/Brussels", LU: "Europe/Luxembourg", CH: "Europe/Zurich", AT: "Europe/Vienna",
  DK: "Europe/Copenhagen", SE: "Europe/Stockholm", NO: "Europe/Oslo", FI: "Europe/Helsinki",
  IS: "Atlantic/Reykjavik", PL: "Europe/Warsaw", CZ: "Europe/Prague", SK: "Europe/Bratislava",
  HU: "Europe/Budapest", SI: "Europe/Ljubljana", HR: "Europe/Zagreb", RO: "Europe/Bucharest",
  BG: "Europe/Sofia", GR: "Europe/Athens", EE: "Europe/Tallinn", LV: "Europe/Riga",
  LT: "Europe/Vilnius", MT: "Europe/Malta", CY: "Asia/Nicosia", TR: "Europe/Istanbul",
  RS: "Europe/Belgrade", BA: "Europe/Sarajevo", AL: "Europe/Tirane", ME: "Europe/Podgorica",
  MK: "Europe/Skopje", AD: "Europe/Andorra", MC: "Europe/Monaco", SM: "Europe/San_Marino",
  LI: "Europe/Vaduz",
};

function clean(value: string | undefined, maximum: number) {
  return (value ?? "")
    .normalize("NFC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function isoDate(value: string | undefined, now: Date, locale: string) {
  const text = clean(value, 250);
  const exact = text.match(datePattern)?.[0];
  if (exact) return exact;
  const language = locale.toLowerCase().split("-")[0];
  const localized = (chrono as unknown as Record<
    string,
    { parseDate?: typeof chrono.parseDate }
  >)[language];
  const parsed = language === "en"
    ? chrono.en.GB.parseDate(text, now, { forwardDate: true })
    : localized?.parseDate?.(text, now, { forwardDate: true }) ??
      chrono.parseDate(text, now, { forwardDate: true });
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function eventTime(value: string | undefined) {
  const match = clean(value, 100).match(timePattern);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

function category(value: string | undefined, title: string) {
  const text = `${value ?? ""} ${title}`.toLowerCase();
  if (/autojumble|teilemarkt|bourse d['’]échanges|mostra scambio/.test(text)) return "Autojumble";
  if (/motorsport|race|racing|rally|hill ?climb|grand prix/.test(text)) return "Motorsport";
  if (/tour|run|drive|road trip/.test(text)) return "Run";
  if (/meet|gathering|cars and coffee|breakfast|treffen|raduno|sraz|zlot/.test(text)) return "Meet";
  if (/show|concours|exhibition|salon|festival/.test(text)) return "Show";
  return "Other";
}

function observedFields(candidate: Record<string, unknown>) {
  const fields: DiscoveryObservedField[] = [];
  for (const [key, value] of Object.entries(candidate)) {
    if (value !== undefined && value !== null && value !== "") {
      fields.push(key as DiscoveryObservedField);
    }
  }
  return fields;
}

export async function normalizeFinding(
  finding: RawEventFinding,
  source: DiscoverySourceDefinition,
  context: { countryCode: string; locale: string; timezone: string; now?: Date },
): Promise<NormalizedFinding | null> {
  const now = context.now ?? new Date();
  const title = clean(finding.title, 160);
  const startDate = isoDate(finding.startDate, now, context.locale);
  const venue = clean(finding.venue, 180);
  const town = clean(finding.town, 120);
  const officialUrl = finding.officialUrl || finding.sourceUrl;
  if (!title || !startDate || !venue || !town || !officialUrl) return null;

  const rawCountry = clean(finding.countryCode, 80);
  const upperCountry = rawCountry.toUpperCase();
  const aliasedCountry = countryAliases[rawCountry.toLocaleLowerCase("en")];
  const contextCountry = context.countryCode.toUpperCase() === "UK"
    ? "GB"
    : context.countryCode.toUpperCase();
  const countryCode = supportedCountryCodes.has(upperCountry === "UK" ? "GB" : upperCountry)
    ? upperCountry === "UK" ? "GB" : upperCountry
    : aliasedCountry && supportedCountryCodes.has(aliasedCountry)
      ? aliasedCountry
      : supportedCountryCodes.has(contextCountry)
        ? contextCountry
        : "GB";
  const candidate = {
    title,
    description: clean(finding.description, 1_500),
    organiserName: clean(finding.organiserName, 160),
    venue,
    town,
    postcode: clean(finding.postcode, 16),
    countryCode,
    adminArea: clean(finding.adminArea, 120),
    timezone:
      clean(finding.timezone, 80) ||
      countryTimezones[countryCode] ||
      context.timezone,
    startDate,
    endDate: isoDate(finding.endDate, now, context.locale) ?? undefined,
    startTime: eventTime(finding.startTime || finding.startDate),
    category: category(finding.category, title),
    officialUrl,
    price: clean(finding.price, 100),
    latitude: finding.latitude,
    longitude: finding.longitude,
  };
  const contentHash = await sha256Hex(JSON.stringify(candidate));
  const confidence = scoreExtractionConfidence(finding);
  const externalIdentity = clean(finding.externalId, 500) || contentHash;
  const externalKey = (await sha256Hex(externalIdentity)).slice(0, 32);
  const payload = validateDiscoveryPayload(
    {
      schemaVersion: 2,
      idempotencyKey: `${source.key}:${externalKey}:${contentHash.slice(0, 16)}`,
      source,
      candidate,
      provenance: {
        sourceUrl: finding.sourceUrl,
        externalId: finding.externalId,
        contentHash,
        method: finding.method,
        confidence: confidence.score,
        observedFields: observedFields(candidate),
        observedAt: now.toISOString(),
      },
    },
    now,
  );
  return {
    payload,
    parserVersion: finding.parserVersion,
    confidenceBreakdown: confidence.breakdown,
  };
}

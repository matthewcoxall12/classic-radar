#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const DEFAULT_INGEST_URL =
  "https://rnayhhsurmztrohtftqo.supabase.co/functions/v1/ingest-events";
const USER_AGENT =
  "ClassicsGo-Discovery/1.0 (+https://classicsgo.com; support@classicsgo.com)";
const MAX_BYTES = 2_000_000;
const EVENT_WORDS =
  /\b(classic|vintage|historic|heritage|retro|motor|motoring|car|cars|vehicle|vehicles|autojumble|rally|road run|hillclimb|hill climb|concours|auto|automobile|show|meet|festival|race|racing)\b/i;
const STRONG_MOTORING_WORDS =
  /\b(classic(?:\s+car)?|vintage(?:\s+(?:car|vehicle|motor))?|historic(?:\s+(?:car|vehicle|motor|racing))|retro(?:\s+(?:car|vehicle|motor))?|motorsport|motoring|motorbike|motorcycle|cars?|vehicles?|autojumble|auto\s+jumble|concours|hill\s*climb|hillclimb|road\s+run|road\s+rally|rally|racing|race|drag\s+racing|hot\s+rod|owners?\s+club)\b/i;
const GENERIC_TITLES =
  /^(events?|what(?:'|’)s on|calendar|home|welcome|motorsport|motoring events?|latest events?|all racing|i am visitor|at a glance|car clubs?|museum|news|hospitality)$/i;
const NON_EVENT_PATH =
  /\/(?:about|account|basics|basket|blog|car-clubs?|cart|cookie|faq|guide|hospitality|intro|login|news|privacy|style-guide|terms|visitor|visitors)(?:\/|$)/i;
const PRIVATE_IPV4 =
  /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const TIMEZONES = {
  GB: "Europe/London",
  IE: "Europe/Dublin",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  IT: "Europe/Rome",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  DK: "Europe/Copenhagen",
  CH: "Europe/Zurich",
};
const MONTHS = new Map(
  [
    ["jan", 1], ["january", 1], ["janvier", 1], ["januar", 1], ["gennaio", 1], ["enero", 1],
    ["feb", 2], ["february", 2], ["fevrier", 2], ["februar", 2], ["febbraio", 2], ["febrero", 2],
    ["mar", 3], ["march", 3], ["mars", 3], ["marz", 3], ["marzo", 3],
    ["apr", 4], ["april", 4], ["avril", 4], ["aprile", 4], ["abril", 4],
    ["may", 5], ["mai", 5], ["maggio", 5], ["mayo", 5],
    ["jun", 6], ["june", 6], ["juin", 6], ["juni", 6], ["giugno", 6], ["junio", 6],
    ["jul", 7], ["july", 7], ["juillet", 7], ["juli", 7], ["luglio", 7], ["julio", 7],
    ["aug", 8], ["august", 8], ["aout", 8], ["agosto", 8],
    ["sep", 9], ["sept", 9], ["september", 9], ["septembre", 9], ["settembre", 9], ["septiembre", 9],
    ["oct", 10], ["october", 10], ["octobre", 10], ["oktober", 10], ["ottobre", 10], ["octubre", 10],
    ["nov", 11], ["november", 11], ["novembre", 11], ["noviembre", 11],
    ["dec", 12], ["december", 12], ["decembre", 12], ["dezember", 12], ["dicembre", 12], ["diciembre", 12],
  ],
);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
    : fallback;
}

function cleanText(value, maximum = 2_000) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, code) => {
      const point = Number.parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : " ";
    })
    .replace(/&#([0-9]{1,7});/g, (_, code) => {
      const point = Number.parseInt(code, 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : " ";
    })
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function ascii(value) {
  return cleanText(value, 20_000)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function calendarDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const latest = new Date(today);
  latest.setUTCFullYear(latest.getUTCFullYear() + 2);
  if (date < today || date > latest) return null;
  return date.toISOString().slice(0, 10);
}

export function extractDate(value) {
  const text = ascii(value);
  let match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?=\D|$)/);
  if (match) return calendarDate(match[1], match[2], match[3]);
  match = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*,?\s*(20\d{2})\b/);
  if (match && MONTHS.has(match[2])) {
    return calendarDate(match[3], MONTHS.get(match[2]), match[1]);
  }
  match = text.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})\b/);
  if (match && MONTHS.has(match[1])) {
    return calendarDate(match[3], MONTHS.get(match[1]), match[2]);
  }
  match = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  return match ? calendarDate(match[3], match[2], match[1]) : null;
}

function clockTime(value) {
  const match = String(value ?? "").match(/(?:T|\s)([01]\d|2[0-3]):([0-5]\d)/);
  return match ? match[1] + ":" + match[2] : null;
}

function safePublicUrl(value, base) {
  let url;
  try {
    url = new URL(String(value ?? ""), base);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    PRIVATE_IPV4.test(hostname) ||
    /^\d+(?:\.\d+){3}$/.test(hostname) ||
    hostname.includes(":")
  ) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export function isPublicAddress(value) {
  const address = String(value ?? "").toLowerCase().split("%")[0];
  const version = isIP(address);
  if (version === 4) {
    const [first, second, third] = address.split(".").map(Number);
    return !(
      first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0 && (third === 0 || third === 2)) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113)
    );
  }
  if (version === 6) {
    if (address.startsWith("::ffff:") || address.startsWith("64:ff9b:")) return false;
    if (address.startsWith("2001:db8:")) return false;
    const first = Number.parseInt(address.split(":")[0] || "0", 16);
    return first >= 0x2000 && first <= 0x3fff;
  }
  return false;
}

async function assertPublicResolution(value) {
  const url = new URL(value);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("DNS_REJECTED");
  }
}

function samePublisherHost(left, right) {
  const normalise = (value) => value.toLowerCase().replace(/^www\./, "");
  return normalise(left) === normalise(right);
}

function pageSignalText(value) {
  const parsed = new URL(value);
  return cleanText(`${decodeURIComponent(parsed.pathname)} ${parsed.search}`, 2_000);
}

function sameCanonicalPage(left, right) {
  const normalise = (value) => {
    const parsed = new URL(value);
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  };
  return normalise(left) === normalise(right);
}

function sourceIsMotoringSpecific(source) {
  return ["club", "federation", "motorsport"].includes(source.sourceType) ||
    STRONG_MOTORING_WORDS.test(`${source.name ?? ""} ${source.url ?? ""}`);
}

function isRelevantMotoringEvent(title, description, pageUrl, source) {
  const path = pageSignalText(pageUrl);
  if (NON_EVENT_PATH.test(new URL(pageUrl).pathname)) return false;
  if (STRONG_MOTORING_WORDS.test(title)) return true;
  if (!sourceIsMotoringSpecific(source)) return false;
  return EVENT_WORDS.test(`${title} ${description}`) ||
    /\/(?:event|events|calendar|meets?|rallies|rally|shows?)(?:\/|[-_.?]|$)/i.test(path);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metaContent(html, key, attribute = "property") {
  const escaped = key.replace(/[.*+?^{}$()|[\]\\]/g, "\\$&");
  const first = new RegExp(
    "<meta[^>]+" + attribute + "=[\"']" + escaped +
      "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>",
    "i",
  );
  const second = new RegExp(
    "<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+" + attribute +
      "=[\"']" + escaped + "[\"'][^>]*>",
    "i",
  );
  return cleanText(html.match(first)?.[1] ?? html.match(second)?.[1] ?? "", 1_500);
}

function firstHeading(html) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return cleanText(match?.[1] ?? metaContent(html, "og:title"), 180);
}

function normaliseType(value) {
  return (Array.isArray(value) ? value : [value]).map((item) =>
    String(item ?? "").toLowerCase()
  );
}

function walkJson(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, output));
  } else if (value && typeof value === "object") {
    if (normaliseType(value["@type"]).includes("event")) output.push(value);
    if (value["@graph"]) walkJson(value["@graph"], output);
    if (value.itemListElement) walkJson(value.itemListElement, output);
  }
  return output;
}

function jsonLdObjects(html) {
  const output = [];
  const pattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      walkJson(JSON.parse(match[1].trim()), output);
    } catch {
      // Invalid publisher markup is ignored; it is never repaired by guessing.
    }
  }
  return output;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function countryCode(value, fallback) {
  const record = objectValue(value);
  const raw = cleanText(record.addressCountry ?? value, 80).toUpperCase();
  const aliases = {
    "UNITED KINGDOM": "GB", UK: "GB", ENGLAND: "GB", SCOTLAND: "GB",
    WALES: "GB", FRANCE: "FR", GERMANY: "DE", ITALY: "IT",
    SPAIN: "ES", NETHERLANDS: "NL", BELGIUM: "BE",
  };
  const candidate = aliases[raw] ?? raw;
  return /^[A-Z]{2}$/.test(candidate) ? candidate : fallback || "GB";
}

export function eventCategory(title) {
  const value = cleanText(title, 500);
  if (/autojumble|auto\s+jumble|swap\s+meet/i.test(value)) return "Autojumble";
  if (/cars?\s*(?:and|&)\s*coffee|coffee\s*(?:and|&)\s*cars?|breakfast\s+(?:club|meet)/i.test(value)) return "Cars & coffee";
  if (/american|hot\s*rod|street\s*rod|muscle\s+car|custom\s+car/i.test(value)) return "American / hot rod";
  if (/pre[ -]?war|vintage|veteran|edwardian/i.test(value)) return "Vintage / pre-war";
  if (/rallycross|race|racing|hill.?climb|motorsport|track\s*day|circuit|sprint|festival\s+of\s+speed/i.test(value)) return "Motorsport";
  if (/road\s+run|road\s+tour|touring|scenic\s+drive|drive\s*out|\brally\b/i.test(value)) return "Rally / road run";
  if (/museum|heritage\s+cent(?:re|er)|venue\s+event|open\s+day/i.test(value)) return "Museum / venue event";
  if (/\b(?:austin|alfa\s+romeo|aston\s+martin|audi|bentley|bmw|citro[eë]n|ferrari|fiat|ford|jaguar|land\s+rover|lotus|mercedes|mg|mini|morgan|morris|peugeot|porsche|renault|rolls[ -]royce|saab|triumph|volkswagen|volvo)\b/i.test(value)) return "Marque-specific";
  if (/club\s+meet|owners?\s+club|register|gathering|\bmeet\b/i.test(value)) return "Club meet";
  return "Classic car show";
}

function jsonLdCandidate(event, pageUrl, source) {
  if (String(event.eventStatus ?? "").toLowerCase().includes("cancel")) return null;
  const title = cleanText(event.name ?? event.headline, 180);
  const startDate = extractDate(firstValue(event.startDate));
  const firstOffer = objectValue(firstValue(event.offers));
  const officialUrl = safePublicUrl(
    firstValue(event.url) ?? firstOffer.url ?? pageUrl,
    pageUrl,
  );
  if (!title || !startDate || !officialUrl) return null;
  const location = objectValue(firstValue(event.location));
  const address = objectValue(location.address);
  const geo = objectValue(location.geo);
  const organiser = objectValue(firstValue(event.organizer ?? event.performer));
  const latitude = Number(geo.latitude);
  const longitude = Number(geo.longitude);
  const description = cleanText(event.description, 3_800);
  if (!isRelevantMotoringEvent(title, description, officialUrl, source)) {
    return null;
  }
  const venue = cleanText(location.name, 180);
  const town = cleanText(address.addressLocality, 120);
  const postcode = cleanText(address.postalCode, 16);
  const region = cleanText(address.addressRegion ?? source.region, 120);
  const endDate = extractDate(firstValue(event.endDate));
  const excerpt = cleanText(
    title + " " + (firstValue(event.startDate) ?? "") + " " +
      venue + " " + town + " " + description,
    1_000,
  );
  const price = firstOffer.price === 0 ||
      String(firstOffer.isAccessibleForFree).toLowerCase() === "true"
    ? "Free"
    : firstOffer.price
      ? (cleanText(firstOffer.priceCurrency, 8) + " " +
        cleanText(firstOffer.price, 40)).trim()
      : null;
  return {
    title,
    description,
    eventType: eventCategory(title),
    startDate,
    startTime: clockTime(firstValue(event.startDate)),
    endDate: endDate && endDate >= startDate ? endDate : null,
    endTime: clockTime(firstValue(event.endDate)),
    timezone: cleanText(event.eventSchedule?.scheduleTimezone, 80) ||
      TIMEZONES[source.countryCode] || "Europe/London",
    venueName: venue || null,
    address: cleanText(address.streetAddress, 500) || null,
    town: town || null,
    county: region || null,
    countryCode: countryCode(address.addressCountry, source.countryCode),
    postcode: postcode || null,
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      ? latitude
      : null,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
      ? longitude
      : null,
    priceText: price,
    bookingRequired: Boolean(firstOffer.url),
    bookingUrl: safePublicUrl(firstOffer.url, pageUrl),
    organiserName: cleanText(organiser.name ?? source.name, 180) || null,
    organiserUrl: safePublicUrl(organiser.url, pageUrl) ?? source.url,
    imageUrl: safePublicUrl(
      firstValue(event.image)?.url ?? firstValue(event.image),
      pageUrl,
    ),
    confidenceScore: venue || town ? 92 : 84,
    confidenceReasons: [
      "Registered source",
      "Schema.org Event structured data",
      "Exact future date",
      venue || town ? "Structured location" : "Location needs editorial completion",
    ],
    sources: [{
      url: pageUrl,
      canonicalUrl: officialUrl,
      title,
      sourceType: source.sourceType,
      provider: source.key,
      excerpt,
      contentHash: sha256(excerpt),
      method: "json-ld",
      requiresReview: true,
    }],
  };
}

function htmlCandidate(html, pageUrl, source) {
  const title = firstHeading(html);
  const visible = cleanText(html, 20_000);
  const startDate = extractDate([
    metaContent(html, "event:start_time"),
    title,
    visible,
  ].join(" "));
  if (
    !title || GENERIC_TITLES.test(title) ||
    !EVENT_WORDS.test(title + " " + pageUrl) || !startDate
  ) return null;
  const description = metaContent(html, "og:description") ||
    metaContent(html, "description", "name") || visible.slice(0, 1_200);
  if (!isRelevantMotoringEvent(title, description, pageUrl, source)) return null;
  const officialUrl = safePublicUrl(metaContent(html, "og:url") || pageUrl, pageUrl);
  if (!officialUrl) return null;
  const excerpt = cleanText(title + " " + startDate + " " + description, 1_000);
  return {
    title,
    description: cleanText(description, 3_800),
    eventType: eventCategory(title),
    startDate,
    startTime: null,
    endDate: null,
    endTime: null,
    timezone: TIMEZONES[source.countryCode] || "Europe/London",
    venueName: null,
    address: null,
    town: null,
    county: source.region || null,
    countryCode: source.countryCode || "GB",
    postcode: null,
    latitude: null,
    longitude: null,
    priceText: null,
    bookingRequired: false,
    bookingUrl: officialUrl,
    organiserName: source.name,
    organiserUrl: source.url,
    imageUrl: safePublicUrl(metaContent(html, "og:image"), pageUrl),
    confidenceScore: 62,
    confidenceReasons: [
      "Registered source",
      "Motoring-event title",
      "Future date found in page",
      "Unstructured extraction requires editorial review",
    ],
    sources: [{
      url: pageUrl,
      canonicalUrl: officialUrl,
      title,
      sourceType: source.sourceType,
      provider: source.key,
      excerpt,
      contentHash: sha256(excerpt),
      method: "opengraph",
      requiresReview: true,
    }],
  };
}

export function extractCandidatesFromHtml(
  html,
  pageUrl,
  source,
  options = {},
) {
  const structured = jsonLdObjects(html)
    .map((event) => jsonLdCandidate(event, pageUrl, source))
    .filter(Boolean)
    .filter((candidate) =>
      !options.detailPage ||
      sameCanonicalPage(candidate.sources[0].canonicalUrl, pageUrl)
    );
  if (structured.length) return structured;
  const fallback = htmlCandidate(html, pageUrl, source);
  return fallback ? [fallback] : [];
}

export function eventLinks(html, baseUrl, limit = 3) {
  const origin = new URL(baseUrl).origin;
  const links = new Map();
  const pattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = safePublicUrl(match[1], baseUrl);
    const label = cleanText(match[2], 180);
    const path = url ? new URL(url).pathname : "";
    if (
      !url || new URL(url).origin !== origin ||
      sameCanonicalPage(url, baseUrl) ||
      !EVENT_WORDS.test(`${label} ${pageSignalText(url)}`) ||
      NON_EVENT_PATH.test(path) ||
      /wp-json|\/feed\/?$/i.test(path)
    ) continue;
    links.set(url, label);
    if (links.size >= limit) break;
  }
  return [...links.keys()];
}

function robotsAllowsText(text, pathname) {
  let applies = false;
  const disallowed = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey, ...parts] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = parts.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase().includes("classicsgo");
    } else if (applies && key === "disallow" && value) {
      disallowed.push(value);
    }
  }
  return !disallowed.some((path) => path === "/" || pathname.startsWith(path));
}

async function fetchRaw(url, options = {}) {
  let current = safePublicUrl(url);
  if (!current) throw new Error("URL_REJECTED");
  const initialHostname = new URL(current).hostname;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicResolution(current);
    const response = await fetch(current, {
      headers: {
        Accept: options.accept ||
          "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "User-Agent": USER_AGENT,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeout ?? 15_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = safePublicUrl(response.headers.get("location"), current);
      if (!next || redirect === 3) throw new Error("REDIRECT_REJECTED");
      if (!samePublisherHost(initialHostname, new URL(next).hostname)) {
        throw new Error("CROSS_ORIGIN_REDIRECT");
      }
      current = next;
      continue;
    }
    if (!response.ok) throw new Error("HTTP_" + response.status);
    const maximum = options.maxBytes ?? MAX_BYTES;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maximum) throw new Error("RESPONSE_TOO_LARGE");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maximum) throw new Error("RESPONSE_TOO_LARGE");
    return {
      text: new TextDecoder().decode(buffer),
      url: safePublicUrl(response.url || current) || current,
      contentType: response.headers.get("content-type") || "",
    };
  }
  throw new Error("REDIRECT_REJECTED");
}

const robotsCache = new Map();
async function robotsAllows(url) {
  const parsed = new URL(url);
  if (!robotsCache.has(parsed.origin)) {
    robotsCache.set(
      parsed.origin,
      fetchRaw(parsed.origin + "/robots.txt", {
        accept: "text/plain",
        maxBytes: 300_000,
        timeout: 8_000,
      }).then((response) => response.text).catch(() => ""),
    );
  }
  return robotsAllowsText(await robotsCache.get(parsed.origin), parsed.pathname);
}

async function fetchPage(url) {
  if (!(await robotsAllows(url))) throw new Error("ROBOTS_DISALLOWED");
  const page = await fetchRaw(url);
  if (
    !/html|xhtml/i.test(page.contentType) &&
    !/<html|application\/ld\+json/i.test(page.text)
  ) throw new Error("UNSUPPORTED_CONTENT_TYPE");
  return page;
}

function candidateKey(candidate) {
  const title = ascii(candidate.title)
    .replace(/\b(?:20\d{2}|classic|vintage|historic|car|cars|show|event|annual|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const place = ascii(
    candidate.postcode || candidate.town || candidate.venueName ||
      candidate.countryCode,
  );
  return title + "|" + candidate.startDate + "|" + place;
}

function mergeCandidates(candidates) {
  const merged = new Map();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }
    existing.sources = [...new Map(
      [...existing.sources, ...candidate.sources].map((source) => [
        source.canonicalUrl,
        source,
      ]),
    ).values()].slice(0, 10);
    existing.confidenceScore = Math.max(
      existing.confidenceScore,
      candidate.confidenceScore,
    );
    for (const field of [
      "description", "venueName", "address", "town", "county", "postcode",
      "bookingUrl", "organiserName", "organiserUrl", "imageUrl",
    ]) {
      if (!existing[field] && candidate[field]) existing[field] = candidate[field];
    }
  }
  return [...merged.values()];
}

export async function processSource(source, detailLimit) {
  const pages = [];
  const errors = [];
  try {
    const root = await fetchPage(source.url);
    pages.push(root);
    for (const detailUrl of eventLinks(root.text, root.url, detailLimit)) {
      try {
        pages.push({ ...(await fetchPage(detailUrl)), detailPage: true });
      } catch (error) {
        errors.push(
          detailUrl + ": " + (error instanceof Error ? error.message : error),
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      sourceKey: source.key,
      succeeded: false,
      error: message,
      pagesFetched: 0,
      candidates: [],
      errors: [source.key + ": " + message],
    };
  }
  const candidates = [];
  for (const page of pages) {
    if (page.url === pages[0].url) {
      candidates.push(
        ...jsonLdObjects(page.text)
          .map((event) => jsonLdCandidate(event, page.url, source))
          .filter(Boolean),
      );
    } else {
      candidates.push(...extractCandidatesFromHtml(page.text, page.url, source, {
        detailPage: Boolean(page.detailPage),
      }));
    }
  }
  return {
    sourceKey: source.key,
    succeeded: true,
    error: errors[0] || null,
    pagesFetched: pages.length,
    candidates: mergeCandidates(candidates).slice(0, 20),
    errors: [],
    warnings: errors.map((error) => source.key + ": " + error),
  };
}

async function pool(items, concurrency, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runner(),
    ),
  );
  return output;
}

async function githubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error("GitHub OIDC environment is unavailable");
  }
  const url = new URL(requestUrl);
  url.searchParams.set("audience", "classicsgo-ingest");
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + requestToken },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error("GitHub OIDC request failed (" + response.status + ")");
  }
  const payload = await response.json();
  if (!payload.value) throw new Error("GitHub OIDC response did not include a token");
  return payload.value;
}

async function ingest(payload) {
  const ingestUrl = safePublicUrl(
    process.env.DISCOVERY_INGEST_URL || DEFAULT_INGEST_URL,
  );
  if (!ingestUrl) throw new Error("Ingestion URL is invalid");
  const response = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + await githubOidcToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: 1, ...payload }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    throw new Error(
      "Ingestion " + payload.phase + " failed (" + response.status + "): " +
        (body.error || "unknown error"),
    );
  }
  return body;
}

function selectedSources(catalog) {
  const requestedKey = cleanText(process.env.DISCOVERY_SOURCE_KEY, 120);
  const filtered = requestedKey
    ? catalog.filter((source) => source.key === requestedKey)
    : catalog;
  const offset = boundedInteger(process.env.DISCOVERY_SOURCE_OFFSET, 0, 0, 10_000);
  const limit = boundedInteger(
    process.env.DISCOVERY_SOURCE_LIMIT,
    filtered.length,
    1,
    200,
  );
  return filtered.slice(offset, offset + limit);
}

function localDryRunCatalog() {
  const url = safePublicUrl(process.env.DISCOVERY_SOURCE_URL);
  if (!url) {
    throw new Error(
      "Local dry-runs require an explicit public DISCOVERY_SOURCE_URL",
    );
  }
  const countryCode = cleanText(process.env.DISCOVERY_SOURCE_COUNTRY, 2)
    .toUpperCase();
  return [{
    key: cleanText(process.env.DISCOVERY_SOURCE_KEY, 120) || "local-dry-run",
    name: cleanText(process.env.DISCOVERY_SOURCE_NAME, 180) ||
      new URL(url).hostname,
    url,
    sourceType: "organiser",
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "GB",
    region: cleanText(process.env.DISCOVERY_SOURCE_REGION, 120) || null,
  }];
}

export async function main() {
  const dryRun = String(process.env.DISCOVERY_DRY_RUN || "").toLowerCase() === "true";
  const catalog = dryRun
    ? localDryRunCatalog()
    : (await ingest({ phase: "catalog" })).catalog || [];
  const sources = selectedSources(catalog);
  if (!sources.length) throw new Error("No discovery sources matched this run");
  const detailLimit = boundedInteger(process.env.DISCOVERY_DETAIL_LIMIT, 3, 0, 8);
  const concurrency = boundedInteger(process.env.DISCOVERY_CONCURRENCY, 5, 1, 8);
  console.log(
    "Discovery selected " + sources.length + " source(s); dry-run=" + dryRun +
      "; details/source=" + detailLimit,
  );
  const results = await pool(
    sources,
    concurrency,
    (source) => processSource(source, detailLimit),
  );
  const candidates = mergeCandidates(results.flatMap((result) => result.candidates));
  const errors = results.flatMap((result) => result.errors).slice(0, 100);
  const warnings = results.flatMap((result) => result.warnings ?? []).slice(0, 100);
  const pagesFetched = results.reduce(
    (total, result) => total + result.pagesFetched,
    0,
  );
  const sourcesSucceeded = results.filter((result) => result.succeeded).length;
  console.log(
    "Discovery fetched " + pagesFetched + " page(s) and found " +
      candidates.length + " review candidate(s) from " + sourcesSucceeded +
      "/" + sources.length + " source(s)",
  );
  if (warnings.length) {
    console.warn(
      "Discovery skipped " + warnings.length +
        " optional detail page(s); root source checks still completed",
    );
  }
  if (dryRun) {
    return { sources: sources.length, pagesFetched, candidates: candidates.length };
  }

  const runId = randomUUID();
  const eventName = process.env.GITHUB_EVENT_NAME || "workflow_dispatch";
  await ingest({
    phase: "start",
    runId,
    runType: eventName === "schedule" ? "scheduled_deep" : "manual_deep",
  });
  let created = 0;
  let updated = 0;
  let review = 0;
  let duplicates = 0;
  let observations = 0;
  let failed = false;
  const candidateChunks = [];
  const sourceChunks = [];
  for (let index = 0; index < candidates.length; index += 40) {
    candidateChunks.push(candidates.slice(index, index + 40));
  }
  for (let index = 0; index < results.length; index += 50) {
    sourceChunks.push(results.slice(index, index + 50).map((result) => ({
      sourceKey: result.sourceKey,
      succeeded: result.succeeded,
      error: result.error,
    })));
  }
  try {
    const calls = Math.max(1, candidateChunks.length, sourceChunks.length);
    for (let index = 0; index < calls; index += 1) {
      const batch = await ingest({
        phase: "batch",
        candidates: candidateChunks[index] || [],
        sourceResults: sourceChunks[index] || [],
      });
      created += Number(batch.created || 0);
      updated += Number(batch.updated || 0);
      review += Number(batch.review || 0);
      duplicates += Number(batch.duplicates || 0);
      observations += Number(batch.observations || 0);
      if (Array.isArray(batch.errors)) errors.push(...batch.errors);
    }
  } catch (error) {
    failed = true;
    errors.push(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await ingest({
      phase: "finish",
      runId,
      summary: {
        failed,
        sourcesChecked: sources.length,
        pagesFetched,
        searchesPerformed: 0,
        resultsFound: candidates.length,
        candidatesFound: candidates.length,
        eventsCreated: created,
        eventsUpdated: updated,
        reviewQueueCreated: review,
        duplicatesFound: duplicates,
        errors: errors.slice(0, 100),
      },
    });
  }
  console.log(
    "Ingestion complete: created=" + created + ", updated=" + updated +
      ", review=" + review + ", duplicates=" + duplicates +
      ", observations=" + observations,
  );
  if (sourcesSucceeded === 0) throw new Error("All selected sources failed");
  return { runId, created, updated, review, duplicates, observations };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

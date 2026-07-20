import { requireAdminApiUser } from "@/lib/admin-auth";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { ensureDatabase } from "@/lib/database";
import { EUROPE_COUNTRIES } from "@/lib/discovery/geography";
import { sha256Hex, validatePublicHttpsUrl } from "@/lib/discovery-payload";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

const adapters = [
  "ical",
  "rss",
  "firecrawl_map",
  "firecrawl_crawl",
  "firecrawl_scrape",
] as const;
type Adapter = (typeof adapters)[number];
const countryCodes = new Set(["GB", ...EUROPE_COUNTRIES.map((area) => area.countryCode)]);

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private");
  return Response.json(body, { ...init, headers });
}

function routeError(error: unknown) {
  if (error instanceof AuthSecurityError) {
    return noStoreJson(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof RequestError) {
    return noStoreJson(
      { ok: false, error: { code: "INVALID_REQUEST", message: error.message } },
      { status: error.status },
    );
  }
  return noStoreJson(
    {
      ok: false,
      error: {
        code: "ENDPOINT_ONBOARDING_FAILED",
        message: "The discovery target could not be onboarded safely.",
      },
    },
    { status: 500 },
  );
}

function cleanName(value: unknown) {
  if (typeof value !== "string") throw new RequestError("Enter a source name.", 400);
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (
    name.length < 3 ||
    name.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    /<\s*\/?\s*[a-z]/i.test(name)
  ) {
    throw new RequestError("Enter a plain source name between 3 and 120 characters.", 400);
  }
  return name;
}

function positiveInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new RequestError(`${label} must be between ${minimum} and ${maximum}.`, 400);
  }
  return Number(value);
}

function validLocale(value: unknown) {
  if (typeof value !== "string" || value.length > 35) return false;
  try {
    return new Intl.Locale(value).toString().length > 0;
  } catch {
    return false;
  }
}

function validTimezone(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value.includes("/");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApiUser(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "admin-discovery-endpoint-onboarding",
      subject: user.memberId,
      includeIp: false,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: { code: "ADMIN_RATE_LIMITED", message: "Too many sources were added." },
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const body = await readJsonBody(request, 4_000);
    const allowedKeys = [
      "name", "adapter", "endpointUrl", "countryCode", "locale", "timezone",
      "scheduleHours", "maxPages", "maxRecords", "permissionBasis", "reason",
    ];
    if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
      throw new RequestError("The endpoint request contains unsupported fields.", 400);
    }
    const name = cleanName(body.name);
    const adapter = body.adapter;
    if (typeof adapter !== "string" || !adapters.includes(adapter as Adapter)) {
      throw new RequestError("Choose a supported feed or crawl adapter.", 400);
    }
    let endpointUrl: string;
    try {
      endpointUrl = validatePublicHttpsUrl(body.endpointUrl, "endpoint URL");
    } catch {
      throw new RequestError("Enter a public HTTPS endpoint without credentials or signed parameters.", 400);
    }
    const target = new URL(endpointUrl);
    if (
      adapter === "ical" &&
      /(?:^|\.)calendar\.google\.com$/i.test(target.hostname) &&
      /\/private-[^/]+\/basic\.ics$/i.test(target.pathname)
    ) {
      throw new RequestError("Use Google Calendar's public iCal address, never its secret address.", 400);
    }
    if (
      /(?:^|\.)(?:facebook|fb|instagram|x|twitter|tiktok|linkedin|youtube|pinterest|snapchat)\.com$/i.test(target.hostname) ||
      /(?:^|\.)threads\.net$/i.test(target.hostname) ||
      /(?:^|\.)youtu\.be$/i.test(target.hostname) ||
      ["api.firecrawl.dev", "www.eventbriteapi.com"].includes(target.hostname)
    ) {
      throw new RequestError("Onboard organizer-authorized public sources, not social or provider API targets.", 400);
    }
    const countryCode = typeof body.countryCode === "string"
      ? body.countryCode.trim().toUpperCase()
      : "";
    const locale = typeof body.locale === "string" ? body.locale.trim() : "";
    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
    if (!countryCodes.has(countryCode) || !validLocale(locale) || !validTimezone(timezone)) {
      throw new RequestError("Choose a supported UK/European country, locale and IANA timezone.", 400);
    }
    const scheduleHours = positiveInteger(body.scheduleHours, "Schedule", 6, 24);
    const maxPages = positiveInteger(body.maxPages, "Page limit", 1, 100);
    const maxRecords = positiveInteger(body.maxRecords, "Record limit", 1, 100);
    const permissionBasis = body.permissionBasis === "organizer_authorized"
      ? "organizer_authorized"
      : body.permissionBasis === "manual_review"
        ? "manual_review"
        : null;
    if (!permissionBasis) {
      throw new RequestError("Choose a valid permission basis.", 400);
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) {
      throw new RequestError("Record a review reason between 10 and 500 characters.", 400);
    }

    const hash = await sha256Hex(`custom-endpoint:v1:${endpointUrl}`);
    const sourceId = `src_${hash.slice(0, 32)}`;
    const endpointId = `dse_${hash.slice(0, 32)}`;
    const sourceKey = `custom_${hash.slice(0, 24)}`;
    const sourceType = adapter === "ical"
      ? "calendar"
      : "structured_data";
    const db = await ensureDatabase();
    const duplicate = await db
      .prepare(
        `SELECT sources.id FROM event_sources sources
         LEFT JOIN event_source_endpoints endpoints ON endpoints.source_id = sources.id
         WHERE sources.canonical_url = ? OR endpoints.endpoint_url = ? LIMIT 1`,
      )
      .bind(endpointUrl, endpointUrl)
      .first<{ id: string }>();
    if (duplicate) {
      return noStoreJson(
        {
          ok: false,
          error: { code: "ENDPOINT_ALREADY_EXISTS", message: "That source is already in the registry." },
        },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();
    const now = Math.floor(Date.now() / 1_000);
    const [sourceResult, endpointResult, auditResult] = await db.batch([
      db.prepare(
        `INSERT INTO event_sources (
           id, source_key, name, source_type, canonical_url, permission_basis,
           status, trust_level, last_seen_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unverified', ?, ?, ?)`,
      ).bind(
        sourceId,
        sourceKey,
        name,
        sourceType,
        endpointUrl,
        permissionBasis,
        nowIso,
        nowIso,
        nowIso,
      ),
      db.prepare(
        `INSERT INTO event_source_endpoints (
           id, source_id, adapter, endpoint_url, status, schedule_hours,
           country_code, locale, timezone, max_pages, max_records, cursor,
           next_run_at, lease_until, failure_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
      ).bind(
        endpointId,
        sourceId,
        adapter,
        endpointUrl,
        scheduleHours,
        countryCode,
        locale,
        timezone,
        maxPages,
        maxRecords,
        nowIso,
        nowIso,
      ),
      db.prepare(
        `INSERT INTO event_source_review_audit (
           id, source_id, candidate_id, admin_member_id, admin_email, action,
           previous_status, next_status, previous_trust_level, next_trust_level,
           reason, previous_updated_at, next_updated_at,
           linked_public_events_affected, created_at
         ) VALUES (?, ?, NULL, ?, ?, 'source_control_updated', 'pending', 'pending',
           'unverified', 'unverified', ?, ?, ?, 0, ?)`,
      ).bind(
        `dsa_${crypto.randomUUID()}`,
        sourceId,
        user.memberId,
        user.authenticatedEmail.trim().toLowerCase(),
        `Endpoint onboarded (${permissionBasis}) for review: ${reason}`.slice(0, 500),
        nowIso,
        nowIso,
        now,
      ),
    ]);
    if (
      Number(sourceResult.meta.changes ?? 0) !== 1 ||
      Number(endpointResult.meta.changes ?? 0) !== 1 ||
      Number(auditResult.meta.changes ?? 0) !== 1
    ) {
      throw new Error("ENDPOINT_INSERT_CONFLICT");
    }
    return noStoreJson(
      {
        ok: true,
        data: {
          sourceId,
          endpointId,
          status: "pending",
          message: "Source added pending permission review and activation.",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}

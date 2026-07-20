import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@6.2.3";
import { mergeExistingEvent, uniqueSourceCount } from "./merge.ts";
import { agentRunStatus, isCalendarDate, normaliseClockTime, normaliseEventType } from "./validation.ts";

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS = createRemoteJWKSet(new URL(`${GITHUB_ISSUER}/.well-known/jwks`));
const EXPECTED_REPOSITORY = "matthewcoxall12/classic-radar";
const EXPECTED_OWNER_ID = "23249599";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF = `${EXPECTED_REPOSITORY}/.github/workflows/discover-events.yml@${EXPECTED_REF}`;
const ALLOWED_EVENTS = new Set(["schedule", "workflow_dispatch", "push"]);
const MAX_BODY_BYTES = 2_000_000;
const MAX_CANDIDATES = 40;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordLike = Record<string, unknown>;

function response(body: Json, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "content-type": "application/json" } });
}

function getAdminKey(): { value: string; legacy: boolean } {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return { value: keys.default, legacy: false };
  } catch {
    // Fall through to the temporary legacy-key compatibility path.
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("No Supabase secret key is available to the Edge Function");
  return { value: legacy, legacy: true };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
if (!supabaseUrl) throw new Error("SUPABASE_URL is unavailable");

async function rest<T = unknown>(
  table: string,
  options: { method?: string; query?: URLSearchParams; body?: unknown; prefer?: string } = {}
): Promise<T> {
  const key = getAdminKey();
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  if (options.query) url.search = options.query.toString();
  const headers: Record<string, string> = { apikey: key.value, accept: "application/json" };
  // New sb_secret_ keys must be sent only as apikey. The legacy JWT fallback
  // needs Authorization until legacy keys are disabled later in 2026.
  if (key.legacy) headers.authorization = `Bearer ${key.value}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.prefer) headers.prefer = options.prefer;
  const result = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(90_000)
  });
  const text = await result.text();
  if (!result.ok) throw new Error(`Database ${options.method ?? "GET"} ${table} failed (${result.status}): ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function authenticate(request: Request): Promise<JWTPayload> {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Missing GitHub OIDC bearer token");
  const { payload } = await jwtVerify(match[1], GITHUB_JWKS, {
    issuer: GITHUB_ISSUER,
    audience: "classicsgo-ingest",
    algorithms: ["RS256"]
  });
  if (payload.repository !== EXPECTED_REPOSITORY || String(payload.repository_owner_id ?? "") !== EXPECTED_OWNER_ID) {
    throw new Error("OIDC repository is not authorised");
  }
  if (payload.ref !== EXPECTED_REF || payload.workflow_ref !== EXPECTED_WORKFLOW_REF) {
    throw new Error("OIDC workflow or ref is not authorised");
  }
  if (!ALLOWED_EVENTS.has(String(payload.event_name ?? ""))) throw new Error("OIDC event type is not authorised");
  return payload;
}

function text(value: unknown, maximum: number): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function optionalText(value: unknown, maximum: number): string | null {
  const cleaned = text(value, maximum);
  return cleaned || null;
}

function integer(value: unknown, minimum = 0, maximum = 1_000_000): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : minimum;
}

function date(value: unknown): string | null {
  const candidate = text(value, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(candidate) || !isCalendarDate(candidate)) return null;
  const timestamp = Date.parse(`${candidate}T23:59:59Z`);
  const futureLimit = Date.now() + 2 * 366 * 86_400_000;
  return timestamp >= Date.now() - 2 * 86_400_000 && timestamp <= futureLimit ? candidate : null;
}

function time(value: unknown): string | null {
  const candidate = text(value, 8);
  return normaliseClockTime(candidate);
}

function url(value: unknown): string | null {
  try {
    const parsed = new URL(text(value, 2_000));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString().slice(0, 2_000);
  } catch {
    return null;
  }
}

function coordinate(value: unknown, type: "latitude" | "longitude"): number | null {
  const parsed = Number(value);
  const limit = type === "latitude" ? 90 : 180;
  return Number.isFinite(parsed) && parsed >= -limit && parsed <= limit ? parsed : null;
}

function slugify(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "classic-event";
}

function titleFingerprint(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/\b(?:20\d{2}|classic|vintage|historic|heritage|car|cars|vehicle|vehicles|show|event|meet|the|annual)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function similarity(a: string, b: string): number {
  const left = new Set(titleFingerprint(a).split(" ").filter(Boolean));
  const right = new Set(titleFingerprint(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / new Set([...left, ...right]).size;
}

function distanceKm(a: RecordLike, b: RecordLike): number | null {
  const lat1 = Number(a.latitude); const lon1 = Number(a.longitude); const lat2 = Number(b.latitude); const lon2 = Number(b.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1); const deltaLon = radians(lon2 - lon1);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function samePlace(a: RecordLike, b: RecordLike): boolean {
  const distance = distanceKm(a, b);
  if (distance !== null) return distance <= 15;
  const left = text(a.postcode ?? a.town ?? a.venue_name ?? a.venueName, 180).toLowerCase();
  const right = text(b.postcode ?? b.town ?? b.venue_name ?? b.venueName, 180).toLowerCase();
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function sourceType(value: unknown): string {
  const raw = text(value, 40).toLowerCase();
  const aliases: Record<string, string> = {
    official_organiser: "organiser",
    venue_or_museum: "museum",
    classic_event_calendar: "aggregator",
    ticketing_platform: "marketplace",
    club_site: "club",
    forum: "club",
    facebook: "social",
    council_or_whats_on: "council",
    search_result: "aggregator"
  };
  const normalised = aliases[raw] ?? raw;
  return ["aggregator", "club", "museum", "motorsport", "organiser", "council", "marketplace", "social", "federation"].includes(normalised)
    ? normalised
    : "organiser";
}

async function catalog() {
  const query = new URLSearchParams({
    select: "source_key,source_name,domain,start_url,source_type,format_hint,country_code,region,priority_weight,crawl_frequency,requires_review,notes",
    is_active: "eq.true",
    format_hint: "eq.html",
    order: "priority_weight.desc,source_key.asc",
    limit: "200"
  });
  const rows = await rest<RecordLike[]>("source_registry", { query });
  const sources = (rows ?? []).flatMap((row) => {
    const startUrl = url(row.start_url);
    const sourceKey = text(row.source_key, 120);
    if (!startUrl || !sourceKey) return [];
    const hostname = new URL(startUrl).hostname.replace(/^www\./, "").toLowerCase();
    return [{
      key: sourceKey,
      name: text(row.source_name, 180) || hostname,
      url: startUrl,
      domain: hostname,
      sourceType: sourceType(row.source_type),
      format: "html",
      countryCode: /^[A-Z]{2}$/.test(String(row.country_code)) ? String(row.country_code) : "GB",
      region: optionalText(row.region, 120),
      priority: integer(row.priority_weight, 0, 100),
      frequency: ["six_hourly", "daily", "weekly"].includes(String(row.crawl_frequency)) ? String(row.crawl_frequency) : "daily",
      requiresReview: Boolean(row.requires_review),
      notes: text(row.notes, 500)
    }];
  });
  return response({ ok: true, phase: "catalog", catalog: sources });
}

type ExistingEvent = {
  id: string; title: string; slug: string; dedupe_key: string; start_date: string; town: string | null; venue_name: string | null;
  postcode: string | null; latitude: number | null; longitude: number | null; status: string; confidence_score: number; source_count: number;
  description: string; event_type: string; start_time: string | null; end_date: string | null; end_time: string | null; timezone: string;
  address: string | null; county: string | null; country_code: string; price_text: string | null; booking_required: boolean;
  booking_url: string | null; organiser_name: string | null; organiser_url: string | null; image_url: string | null; is_verified: boolean;
};

type SanitisedCandidate = {
  original: RecordLike;
  event: RecordLike & { id: string; dedupe_key: string; title: string; start_date: string; status: string };
  sources: RecordLike[];
  matched: ExistingEvent | null;
};

async function sanitiseCandidates(input: unknown, existing: ExistingEvent[]): Promise<SanitisedCandidate[]> {
  if (!Array.isArray(input) || input.length > MAX_CANDIDATES) throw new Error(`A batch must contain 0-${MAX_CANDIDATES} candidates`);
  const output: SanitisedCandidate[] = [];
  for (const raw of input) {
    const candidate = raw as RecordLike;
    const title = text(candidate.title, 180);
    const startDate = date(candidate.startDate);
    const countryCode = /^[A-Z]{2}$/.test(String(candidate.countryCode)) ? String(candidate.countryCode) : "GB";
    if (title.length < 3 || !startDate) continue;
    const sources = (Array.isArray(candidate.sources) ? candidate.sources : []).slice(0, 10).flatMap((rawSource) => {
      const source = rawSource as RecordLike;
      const sourceUrl = url(source.url); const canonicalUrl = url(source.canonicalUrl ?? source.url);
      if (!sourceUrl || !canonicalUrl) return [];
      return [{
        source_url: sourceUrl,
        canonical_url: canonicalUrl,
        source_title: optionalText(source.title, 300),
        source_type: text(source.sourceType, 40) || "unknown",
        provider: text(source.provider, 80) || "direct",
        raw_excerpt: optionalText(source.excerpt, 1_000),
        content_hash: /^[a-f0-9]{64}$/i.test(String(source.contentHash)) ? String(source.contentHash).toLowerCase() : "",
        confidence_score: integer(candidate.confidenceScore, 0, 100),
        method: text(source.method, 30),
        requires_review: Boolean(source.requiresReview)
      }];
    });
    if (!sources.length) continue;
    const location = text(candidate.postcode ?? candidate.town ?? candidate.venueName ?? countryCode, 180).toLowerCase();
    const dedupeKey = await sha256(`${titleFingerprint(title)}|${startDate}|${location}|${countryCode}`);
    let matched = existing.find((event) => event.dedupe_key === dedupeKey) ?? null;
    if (!matched) {
      matched = existing.find((event) => event.start_date === startDate && similarity(event.title, title) >= 0.78 && samePlace(event as unknown as RecordLike, candidate)) ?? null;
    }
    const score = Math.max(integer(candidate.confidenceScore, 0, 100), matched?.confidence_score ?? 0);
    // Machine-discovered events are evidence for an editor, not publication
    // authority. Preserve an already-published event when refreshing its
    // provenance, but route every new candidate through human review.
    const status = matched?.status === "published" ? "published" : "review";
    const effectiveDedupeKey = matched?.dedupe_key ?? dedupeKey;
    const id = matched?.id ?? crypto.randomUUID();
    const parsedEndDate = date(candidate.endDate);
    const endDate = parsedEndDate && parsedEndDate >= startDate ? parsedEndDate : null;
    const incomingEvent: RecordLike & { id: string; dedupe_key: string; title: string; start_date: string; status: string } = {
      id,
      title,
      slug: matched?.slug ?? `${slugify(title)}-${startDate}-${effectiveDedupeKey.slice(0, 8)}`,
      dedupe_key: effectiveDedupeKey,
      description: text(candidate.description, 4_000),
      event_type: normaliseEventType(candidate.eventType ?? title),
      start_date: startDate,
      start_time: time(candidate.startTime),
      end_date: endDate,
      end_time: endDate ? time(candidate.endTime) : null,
      timezone: text(candidate.timezone, 80) || "UTC",
      venue_name: optionalText(candidate.venueName, 180),
      address: optionalText(candidate.address, 500),
      town: optionalText(candidate.town, 120),
      county: optionalText(candidate.county, 120),
      country_code: countryCode,
      postcode: optionalText(candidate.postcode, 16),
      latitude: coordinate(candidate.latitude, "latitude"),
      longitude: coordinate(candidate.longitude, "longitude"),
      price_text: optionalText(candidate.priceText, 120),
      booking_required: Boolean(candidate.bookingRequired),
      booking_url: url(candidate.bookingUrl),
      organiser_name: optionalText(candidate.organiserName, 180),
      organiser_url: url(candidate.organiserUrl),
      image_url: url(candidate.imageUrl),
      status,
      confidence_score: score,
      is_verified: false,
      source_count: sources.length,
      last_checked_at: new Date().toISOString()
    };
    const mergedEvent = matched ? mergeExistingEvent(incomingEvent, matched as unknown as RecordLike) : incomingEvent;
    output.push({
      original: candidate,
      sources,
      matched,
      event: mergedEvent as SanitisedCandidate["event"]
    });
  }
  return output;
}

async function start(payload: RecordLike, claims: JWTPayload) {
  const runId = text(payload.runId, 36);
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Invalid run ID");
  const query = new URLSearchParams({ on_conflict: "id" });
  await rest("agent_runs", {
    method: "POST", query,
    body: [{ id: runId, run_type: text(payload.runType, 40) || "scheduled_deep", trigger_source: "github_actions", status: "running", notes: `Authenticated GitHub run ${text(claims.run_id, 30)} attempt ${text(claims.run_attempt, 10)}.` }],
    prefer: "resolution=merge-duplicates,return=minimal"
  });
  return response({ ok: true, phase: "start" });
}

async function updateSourceResults(input: unknown): Promise<void> {
  if (!Array.isArray(input)) return;
  await Promise.all(input.slice(0, 50).map(async (raw) => {
    const item = raw as RecordLike;
    const sourceKey = text(item.sourceKey, 120);
    if (!sourceKey) return;
    const query = new URLSearchParams({ source_key: `eq.${sourceKey}` });
    const succeeded = Boolean(item.succeeded);
    await rest("source_registry", {
      method: "PATCH", query,
      body: { last_checked_at: new Date().toISOString(), last_success_at: succeeded ? new Date().toISOString() : undefined, last_error: succeeded ? null : optionalText(item.error, 1_000) },
      prefer: "return=minimal"
    });
  }));
}

async function batch(payload: RecordLike) {
  const candidatesInput = Array.isArray(payload.candidates) ? payload.candidates : [];
  await updateSourceResults(payload.sourceResults);
  if (!candidatesInput.length) return response({ ok: true, phase: "batch", created: 0, updated: 0, review: 0, duplicates: 0, observations: 0, errors: [] });

  const validDates = candidatesInput.map((candidate) => date((candidate as RecordLike).startDate)).filter((value): value is string => Boolean(value)).sort();
  if (!validDates.length) return response({ ok: true, phase: "batch", created: 0, updated: 0, review: 0, duplicates: 0, observations: 0, errors: ["No valid candidate dates"] });
  const existingQuery = new URLSearchParams({
    select: "id,title,slug,dedupe_key,description,event_type,start_date,start_time,end_date,end_time,timezone,venue_name,address,town,county,country_code,postcode,latitude,longitude,price_text,booking_required,booking_url,organiser_name,organiser_url,image_url,status,confidence_score,is_verified,source_count",
    start_date: `gte.${validDates[0]}`,
    and: `(start_date.lte.${validDates[validDates.length - 1]})`,
    limit: "10000"
  });
  const existing = await rest<ExistingEvent[]>("events", { query: existingQuery });
  const candidates = await sanitiseCandidates(candidatesInput, existing ?? []);
  if (!candidates.length) return response({ ok: true, phase: "batch", created: 0, updated: 0, review: 0, duplicates: 0, observations: 0, errors: ["No candidates passed validation"] });

  const existingIds = [...new Set(candidates.flatMap((candidate) => candidate.matched ? [candidate.matched.id] : []))];
  const existingSourceRows = existingIds.length
    ? await rest<Array<{ event_id: string; canonical_url: string }>>("event_sources", { query: new URLSearchParams({ select: "event_id,canonical_url", event_id: `in.(${existingIds.join(",")})`, limit: "10000" }) })
    : [];
  const sourceUrlsByEvent = new Map<string, string[]>();
  existingSourceRows.forEach((row) => sourceUrlsByEvent.set(row.event_id, [...(sourceUrlsByEvent.get(row.event_id) ?? []), row.canonical_url]));
  candidates.forEach((candidate) => {
    candidate.event.source_count = uniqueSourceCount(sourceUrlsByEvent.get(candidate.event.id) ?? [], candidate.sources.map((source) => String(source.canonical_url)));
  });

  const eventQuery = new URLSearchParams({ on_conflict: "id" });
  const savedEvents = await rest<Array<{ id: string; dedupe_key: string; status: string }>>("events", {
    method: "POST", query: eventQuery, body: candidates.map((candidate) => candidate.event), prefer: "resolution=merge-duplicates,return=representation"
  });
  const savedById = new Map(savedEvents.map((event) => [event.id, event]));
  const eventSources: RecordLike[] = [];
  const observations: RecordLike[] = [];
  const reviewRows: RecordLike[] = [];
  for (const candidate of candidates) {
    const saved = savedById.get(candidate.event.id);
    if (!saved) continue;
    for (const source of candidate.sources) {
      const contentHash = source.content_hash || await sha256(`${source.source_url}|${candidate.event.title}|${candidate.event.start_date}|${candidate.event.description}`);
      eventSources.push({
        event_id: saved.id, source_url: source.source_url, canonical_url: source.canonical_url, source_title: source.source_title,
        source_type: source.source_type, provider: source.provider, raw_excerpt: source.raw_excerpt, content_hash: contentHash,
        confidence_score: candidate.event.confidence_score, last_seen_at: new Date().toISOString()
      });
      observations.push({
        event_id: saved.id, source_url: source.source_url, provider: source.provider, content_hash: contentHash,
        extracted_event: {
          title: candidate.event.title, start_date: candidate.event.start_date, end_date: candidate.event.end_date,
          venue_name: candidate.event.venue_name, town: candidate.event.town, country_code: candidate.event.country_code,
          description: text(candidate.event.description, 1_000), extraction_method: source.method
        },
        confidence_score: candidate.event.confidence_score
      });
    }
    if (candidate.event.status === "review") {
      reviewRows.push({
        candidate_key: candidate.event.dedupe_key,
        proposed_event: { ...candidate.event, confidence_reasons: Array.isArray(candidate.original.confidenceReasons) ? candidate.original.confidenceReasons.slice(0, 20).map((reason) => text(reason, 240)) : [] },
        source_url: candidate.sources[0].source_url,
        reason: "Discovery confidence, location or source corroboration requires editorial review.",
        confidence_score: candidate.event.confidence_score,
        status: "pending"
      });
    }
  }
  if (eventSources.length) await rest("event_sources", { method: "POST", query: new URLSearchParams({ on_conflict: "event_id,canonical_url" }), body: eventSources, prefer: "resolution=merge-duplicates,return=minimal" });
  if (observations.length) await rest("event_observations", { method: "POST", query: new URLSearchParams({ on_conflict: "source_url,content_hash" }), body: observations, prefer: "resolution=ignore-duplicates,return=minimal" });
  if (reviewRows.length) await rest("review_queue", { method: "POST", query: new URLSearchParams({ on_conflict: "candidate_key" }), body: reviewRows, prefer: "resolution=merge-duplicates,return=minimal" });

  const updated = candidates.filter((candidate) => candidate.matched).length;
  return response({ ok: true, phase: "batch", created: candidates.length - updated, updated, review: reviewRows.length, duplicates: updated, observations: observations.length, errors: [] });
}

async function finish(payload: RecordLike) {
  const runId = text(payload.runId, 36);
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Invalid run ID");
  const summary = (payload.summary ?? {}) as RecordLike;
  const errors = Array.isArray(summary.errors) ? summary.errors.slice(0, 100).map((error) => text(error, 1_000)) : [];
  const query = new URLSearchParams({ id: `eq.${runId}` });
  await rest("agent_runs", {
    method: "PATCH", query,
    body: {
      status: agentRunStatus(Boolean(summary.failed), errors.length),
      finished_at: new Date().toISOString(),
      sources_checked: integer(summary.sourcesChecked), pages_fetched: integer(summary.pagesFetched), searches_performed: integer(summary.searchesPerformed),
      results_found: integer(summary.resultsFound), candidates_found: integer(summary.candidatesFound), events_created: integer(summary.eventsCreated),
      events_updated: integer(summary.eventsUpdated), review_queue_created: integer(summary.reviewQueueCreated), duplicates_found: integer(summary.duplicatesFound), errors
    },
    prefer: "return=minimal"
  });

  // Provenance and operational history are retained. Any future retention
  // policy must be an explicit, separately reviewed database operation.
  return response({ ok: true, phase: "finish", historyRetained: true });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ ok: false, error: "Method not allowed" }, 405);
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return response({ ok: false, error: "Payload too large" }, 413);
    const claims = await authenticate(request);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return response({ ok: false, error: "Payload too large" }, 413);
    const payload = JSON.parse(rawBody) as RecordLike;
    if (payload.version !== 1) return response({ ok: false, error: "Unsupported payload version" }, 400);
    if (payload.phase === "catalog") return await catalog();
    if (payload.phase === "start") return await start(payload, claims);
    if (payload.phase === "batch") return await batch(payload);
    if (payload.phase === "finish") return await finish(payload);
    return response({ ok: false, error: "Unknown ingestion phase" }, 400);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    const unauthorised = error instanceof Error && /OIDC|token|authoris/i.test(error.message);
    return response({ ok: false, error: unauthorised ? "Unauthorised" : "Ingestion failed" }, unauthorised ? 401 : 500);
  }
});

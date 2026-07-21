import { ensureDatabase } from "@/lib/database";
import { ensureDiscoveryCatalog } from "@/lib/discovery/catalog-store";
import { scoreExtractionConfidence } from "@/lib/discovery/confidence";
import { storeDiscoveryObservation } from "@/lib/discovery/intake-service";
import { normalizeFinding } from "@/lib/discovery/normalize";
import { runDiscoveryProvider } from "@/lib/discovery/providers";
import type { DiscoveryQuery } from "@/lib/discovery/query-generator";
import { sha256Hex } from "@/lib/discovery-payload";
import type {
  DiscoveryEndpointRow,
  DiscoverySourceDefinition,
  RawEventFinding,
} from "@/lib/discovery/types";
import { getRuntimeEnv } from "@/lib/runtime-env";

function runtimeValue(name: string) {
  const runtime = getRuntimeEnv() as Record<string, unknown> | undefined;
  const value = runtime?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function enabled() {
  return runtimeValue("DISCOVERY_ENABLED").toLowerCase() === "true";
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_FAILURE";
  const cleaned = message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 80) || "DISCOVERY_FAILURE";
}

async function sourceForFinding(
  finding: RawEventFinding,
  endpoint: DiscoveryEndpointRow,
): Promise<DiscoverySourceDefinition> {
  const url = new URL(finding.sourceUrl);
  const isProvider = finding.method === "eventbrite";
  const isEndpointOrigin = url.origin === new URL(endpoint.canonical_url).origin;
  if (isEndpointOrigin && !["firecrawl_search", "eventbrite"].includes(endpoint.adapter)) {
    return {
      key: endpoint.source_key,
      name: endpoint.source_name,
      type: endpoint.source_type,
      canonicalUrl: endpoint.canonical_url,
      permissionBasis: endpoint.permission_basis,
    };
  }
  const canonicalOrigin = `${url.origin}/`;
  const db = await ensureDatabase();
  const registered = await db
    .prepare(
      `SELECT source_key, name, source_type, canonical_url, permission_basis
       FROM event_sources
       WHERE canonical_url = ? OR canonical_url LIKE ?
       ORDER BY length(canonical_url) DESC LIMIT 1`,
    )
    .bind(canonicalOrigin, `${canonicalOrigin}%`)
    .first<{
      source_key: string;
      name: string;
      source_type: DiscoverySourceDefinition["type"];
      canonical_url: string;
      permission_basis: DiscoverySourceDefinition["permissionBasis"];
    }>();
  if (registered) {
    return {
      key: registered.source_key,
      name: registered.name,
      type: registered.source_type,
      canonicalUrl: registered.canonical_url,
      permissionBasis: registered.permission_basis,
    };
  }
  const hostnameKey = url.hostname.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 70);
  return {
    key: `${isProvider ? finding.method : "web"}_${hostnameKey}`,
    name: isProvider
      ? "Eventbrite event source"
      : `Official events at ${url.hostname}`,
    type: isProvider ? "partner_api" : "structured_data",
    canonicalUrl: `${url.origin}/`,
    permissionBasis: isProvider ? "platform_api" : "manual_review",
  };
}

async function saveIncomplete(
  endpoint: DiscoveryEndpointRow,
  finding: RawEventFinding,
  now: number,
  reason = "missing_required_facts",
) {
  const db = await ensureDatabase();
  const payloadHash = await sha256Hex(JSON.stringify({
    title: finding.title ?? "",
    sourceUrl: finding.sourceUrl,
    startDate: finding.startDate ?? "",
    venue: finding.venue ?? "",
    town: finding.town ?? "",
  }));
  const confidence = scoreExtractionConfidence(finding).score;
  await db
    .prepare(
      `INSERT INTO discovery_findings (
         id, endpoint_id, source_url, payload_hash, title, reason, confidence,
         status, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'incomplete', ?, ?)
       ON CONFLICT(endpoint_id, payload_hash) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         confidence = excluded.confidence`,
    )
    .bind(
      `dfn_${payloadHash.slice(0, 32)}`,
      endpoint.id,
      finding.sourceUrl,
      payloadHash,
      (finding.title ?? "").slice(0, 160),
      reason.slice(0, 80),
      confidence,
      now,
      now,
    )
    .run();
}

async function recordCancellationSignal(
  finding: RawEventFinding,
  now: number,
) {
  if (!finding.externalId) return false;
  const db = await ensureDatabase();
  const target = await db
    .prepare(
      `SELECT candidates.id AS candidate_id, candidates.status AS candidate_status,
        candidates.published_event_id, provenance.source_id,
        events.status AS event_status
       FROM event_candidate_provenance provenance
       JOIN event_candidates candidates ON candidates.id = provenance.candidate_id
       LEFT JOIN motoring_events events ON events.id = candidates.published_event_id
       WHERE provenance.external_id = ? AND provenance.source_url = ?
       ORDER BY provenance.observed_at DESC, provenance.created_at DESC
       LIMIT 1`,
    )
    .bind(finding.externalId, finding.sourceUrl)
    .first<{
      candidate_id: string;
      candidate_status: string;
      published_event_id: string | null;
      source_id: string;
      event_status: string | null;
    }>();
  if (!target) return false;

  const nextCandidateStatus = target.candidate_status === "rejected"
    ? "rejected"
    : "reviewing";
  const nextEventStatus = target.event_status === "published"
    ? "withdrawn"
    : target.event_status;
  const evidenceHash = await sha256Hex(JSON.stringify({
    externalId: finding.externalId,
    sourceUrl: finding.sourceUrl,
    parserVersion: finding.parserVersion,
    cancelled: true,
  }));
  const alertId = `eda_${(
    await sha256Hex(`cancellation:${target.candidate_id}:${evidenceHash}`)
  ).slice(0, 32)}`;
  const nowIso = new Date(now * 1_000).toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO event_discovery_alerts (
           id, candidate_id, event_id, source_id, source_url, external_id,
           alert_type, evidence_hash, previous_candidate_status,
           next_candidate_status, previous_event_status, next_event_status,
           status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'cancellation', ?, ?, ?, ?, ?, 'open', ?, ?)
         ON CONFLICT(candidate_id, source_id, alert_type, evidence_hash)
         DO NOTHING`,
      )
      .bind(
        alertId,
        target.candidate_id,
        target.published_event_id,
        target.source_id,
        finding.sourceUrl,
        finding.externalId,
        evidenceHash,
        target.candidate_status,
        nextCandidateStatus,
        target.event_status,
        nextEventStatus,
        now,
        now,
      ),
    db
      .prepare(
        `UPDATE motoring_events SET status = 'withdrawn', updated_at = ?
         WHERE id = ? AND status = 'published'`,
      )
      .bind(nowIso, target.published_event_id),
    db
      .prepare(
        `UPDATE event_candidates SET status = ?, review_required = 1,
           published_event_id = CASE WHEN status = 'published' THEN NULL ELSE published_event_id END,
           updated_at = ?
         WHERE id = ? AND status != 'rejected'`,
      )
      .bind(nextCandidateStatus, nowIso, target.candidate_id),
  ]);
  return true;
}

async function recordQueries(
  endpoint: DiscoveryEndpointRow,
  queries: DiscoveryQuery[],
  now: number,
) {
  if (!queries.length) return;
  const db = await ensureDatabase();
  const statements = await Promise.all(queries.map(async (query) => {
    const providerKey = `${endpoint.adapter}:${endpoint.id}:${query.key}`;
    const idHash = await sha256Hex(`query:v2:${providerKey}`);
    return db
      .prepare(
        `INSERT INTO discovery_queries (
           id, query_key, query, country_code, area, locale, timezone,
           last_run_at, next_run_at, run_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(query_key) DO UPDATE SET
           query = excluded.query,
           last_run_at = excluded.last_run_at,
           next_run_at = excluded.next_run_at,
           run_count = discovery_queries.run_count + 1,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        `dqy_${idHash.slice(0, 32)}`,
        providerKey,
        query.query,
        query.countryCode,
        query.area,
        query.locale,
        query.timezone,
        now,
        now + endpoint.schedule_hours * 60 * 60,
      );
  }));
  await db.batch(statements);
}

async function flagStalePublishedEvents(now: number) {
  const db = await ensureDatabase();
  const rows = await db
    .prepare(
      `SELECT candidates.id AS candidate_id, candidates.published_event_id AS event_id,
        provenance.source_id, provenance.source_url, candidates.last_seen_at
       FROM event_candidates candidates
       JOIN motoring_events events ON events.id = candidates.published_event_id
       JOIN motoring_event_provenance provenance
         ON provenance.event_id = events.id AND provenance.is_primary = 1
       WHERE candidates.status = 'published' AND events.status = 'published'
         AND datetime(candidates.last_seen_at) < datetime(?, 'unixepoch', '-14 days')
         AND COALESCE(events.end_date, events.start_date) >= date(?, 'unixepoch')
         AND provenance.source_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM event_discovery_alerts alerts
           WHERE alerts.candidate_id = candidates.id
             AND alerts.source_id = provenance.source_id
             AND alerts.alert_type = 'stale_source' AND alerts.status = 'open'
         )
       ORDER BY candidates.last_seen_at ASC LIMIT 25`,
    )
    .bind(now, now)
    .all<{
      candidate_id: string;
      event_id: string;
      source_id: string;
      source_url: string;
      last_seen_at: string;
    }>();
  if (!rows.results.length) return;
  const statements = await Promise.all(rows.results.map(async (row) => {
    const evidenceHash = await sha256Hex(
      `stale:${row.candidate_id}:${row.source_id}:${row.last_seen_at}`,
    );
    return db
      .prepare(
        `INSERT INTO event_discovery_alerts (
           id, candidate_id, event_id, source_id, source_url, external_id,
           alert_type, evidence_hash, previous_candidate_status,
           next_candidate_status, previous_event_status, next_event_status,
           status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, NULL, 'stale_source', ?, 'published',
           'published', 'published', 'published', 'open', ?, ?)
         ON CONFLICT(candidate_id, source_id, alert_type, evidence_hash)
         DO NOTHING`,
      )
      .bind(
        `eda_${evidenceHash.slice(0, 32)}`,
        row.candidate_id,
        row.event_id,
        row.source_id,
        row.source_url,
        evidenceHash,
        now,
        now,
      );
  }));
  await db.batch(statements);
}

async function claimDueEndpoint(now: number) {
  const db = await ensureDatabase();
  const lease = await db
    .prepare(
      `UPDATE event_source_endpoints
       SET lease_until = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT endpoints.id
         FROM event_source_endpoints endpoints
         JOIN event_sources sources ON sources.id = endpoints.source_id
         WHERE endpoints.status = 'ready'
           AND endpoints.next_run_at <= ?
           AND endpoints.lease_until <= ?
           AND sources.status = 'active'
         ORDER BY endpoints.next_run_at ASC, endpoints.failure_count ASC
         LIMIT 1
       )
       RETURNING id`,
    )
    .bind(now + 10 * 60, now, now)
    .first<{ id: string }>();
  if (!lease) return null;
  return db
    .prepare(
      `SELECT endpoints.*, sources.source_key, sources.name AS source_name,
        sources.source_type, sources.canonical_url, sources.permission_basis,
        sources.status AS source_status
       FROM event_source_endpoints endpoints
       JOIN event_sources sources ON sources.id = endpoints.source_id
       WHERE endpoints.id = ? LIMIT 1`,
    )
    .bind(lease.id)
    .first<DiscoveryEndpointRow>();
}

async function runEndpoint(endpoint: DiscoveryEndpointRow) {
  const db = await ensureDatabase();
  const now = Math.floor(Date.now() / 1_000);
  const resumable = endpoint.adapter === "firecrawl_crawl"
    ? await db
      .prepare(
        `SELECT id, external_job_id
         FROM discovery_runs
         WHERE endpoint_id = ? AND status = 'deferred'
           AND external_job_id IS NOT NULL
         ORDER BY started_at DESC LIMIT 1`,
      )
      .bind(endpoint.id)
      .first<{ id: string; external_job_id: string }>()
    : null;
  const runId = resumable?.id ?? `drn_${crypto.randomUUID()}`;
  if (resumable) {
    await db
      .prepare(
        `UPDATE discovery_runs SET status = 'running', completed_at = NULL,
           error_code = NULL WHERE id = ? AND status = 'deferred'`,
      )
      .bind(runId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO discovery_runs (id, endpoint_id, status, started_at)
         VALUES (?, ?, 'running', ?)`,
      )
      .bind(runId, endpoint.id, now)
      .run();
  }
  try {
    const result = await runDiscoveryProvider(endpoint, resumable?.external_job_id);
    await recordQueries(endpoint, result.queries ?? [], now);
    if (result.deferred) {
      const externalJobId = result.externalJobId ?? resumable?.external_job_id ?? null;
      const retryAt = externalJobId
        ? now + 15 * 60
        : now + endpoint.schedule_hours * 60 * 60;
      await db.batch([
        db
          .prepare(
            `UPDATE discovery_runs SET status = 'deferred', completed_at = NULL,
               error_code = ?, external_job_id = ? WHERE id = ?`,
          )
          .bind(result.reason ?? "PROVIDER_DEFERRED", externalJobId, runId),
        db
          .prepare(
            `UPDATE event_source_endpoints SET lease_until = 0,
               next_run_at = ?, last_error_code = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .bind(retryAt, result.reason ?? "PROVIDER_DEFERRED", endpoint.id),
      ]);
      return;
    }

    let candidates = 0;
    let incomplete = 0;
    for (const finding of result.findings.slice(0, endpoint.max_records)) {
      try {
        if (finding.cancelled) {
          const reconciled = await recordCancellationSignal(finding, now);
          if (!reconciled) {
            await saveIncomplete(endpoint, finding, now, "cancellation_unmatched");
            incomplete += 1;
          } else {
            candidates += 1;
          }
          continue;
        }
        const normalized = await normalizeFinding(
          finding,
          await sourceForFinding(finding, endpoint),
          {
            countryCode: finding.countryCode || endpoint.country_code,
            locale: endpoint.locale,
            timezone: finding.timezone || endpoint.timezone,
            now: new Date(now * 1_000),
          },
        );
        if (!normalized) {
          await saveIncomplete(endpoint, finding, now);
          incomplete += 1;
          continue;
        }
        await storeDiscoveryObservation(normalized.payload, {
          parserVersion: normalized.parserVersion,
          confidenceBreakdown: normalized.confidenceBreakdown,
        });
        candidates += 1;
      } catch {
        try {
          await saveIncomplete(endpoint, finding, now, "normalization_rejected");
        } catch {
          // Invalid or unsafe source URLs are intentionally not persisted.
        }
        incomplete += 1;
      }
    }
    const nextRunAt = now + (result.continuation ? 15 * 60 : endpoint.schedule_hours * 60 * 60);
    await db.batch([
      db
        .prepare(
          `UPDATE discovery_runs SET status = 'succeeded', completed_at = ?,
             findings_count = ?, candidates_count = ?, incomplete_count = ?,
             external_job_id = ? WHERE id = ?`,
        )
        .bind(now, result.findings.length, candidates, incomplete, result.externalJobId ?? null, runId),
      db
        .prepare(
          `UPDATE event_source_endpoints SET cursor = ?, etag = ?,
             last_modified = ?, lease_until = 0, next_run_at = ?,
             failure_count = 0, last_success_at = ?, last_error_code = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(
          result.cursor ?? endpoint.cursor,
          result.etag === undefined ? endpoint.etag : result.etag,
          result.lastModified === undefined
            ? endpoint.last_modified
            : result.lastModified,
          nextRunAt,
          now,
          endpoint.id,
        ),
    ]);
  } catch (error) {
    const code = errorCode(error);
    const failureCount = Math.min(10, endpoint.failure_count + 1);
    const retrySeconds = Math.min(6 * 60 * 60, 15 * 60 * 2 ** Math.min(4, failureCount));
    await db.batch([
      db
        .prepare(
          `UPDATE discovery_runs SET status = 'failed', completed_at = ?,
             error_code = ? WHERE id = ?`,
        )
        .bind(now, code, runId),
      db
        .prepare(
          `UPDATE event_source_endpoints SET lease_until = 0,
             next_run_at = ?, failure_count = failure_count + 1,
             last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(now + retrySeconds, code, endpoint.id),
    ]);
  }
}

export async function runDiscoveryTick(maxEndpoints = 1) {
  if (!enabled()) return { enabled: false, processed: 0 };
  await ensureDiscoveryCatalog();
  let processed = 0;
  for (let index = 0; index < Math.max(1, Math.min(2, maxEndpoints)); index += 1) {
    const endpoint = await claimDueEndpoint(Math.floor(Date.now() / 1_000));
    if (!endpoint) break;
    await runEndpoint(endpoint);
    processed += 1;
  }
  await flagStalePublishedEvents(Math.floor(Date.now() / 1_000));
  return { enabled: true, processed };
}

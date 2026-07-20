import { requireAdminApiUser } from "@/lib/admin-auth";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { ensureDatabase } from "@/lib/database";
import { ensureDiscoveryCatalog } from "@/lib/discovery/catalog-store";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

const sourceStatuses = ["pending", "active", "paused", "revoked"] as const;
const sourceTrustLevels = ["unverified", "organizer", "partner", "official"] as const;

type SourceStatus = (typeof sourceStatuses)[number];
type SourceTrust = (typeof sourceTrustLevels)[number];

type SourceRow = {
  id: string;
  status: SourceStatus;
  trust_level: SourceTrust;
  updated_at: string;
};

type SourceRelationRow = {
  id: string;
};

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
        code: "SOURCE_CONTROL_FAILED",
        message: "The source-control transition could not be completed safely.",
      },
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    await requireAdminApiUser(request);
    await ensureDiscoveryCatalog();
    const params = new URL(request.url).searchParams;
    const requestedStatus = params.get("status") ?? "all";
    const query = (params.get("q") ?? "").normalize("NFC").trim();
    const requestedLimit = Number(params.get("limit") ?? "50");
    const cursorValue = params.get("cursor") ?? "";
    if (
      (requestedStatus !== "all" && !sourceStatuses.includes(requestedStatus as SourceStatus)) ||
      query.length > 120 ||
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > 100
    ) {
      throw new RequestError("Choose valid source-registry filters.", 400);
    }
    const cursorSeparator = cursorValue.lastIndexOf("|");
    const cursor = cursorValue
      ? {
          updatedAt: cursorValue.slice(0, cursorSeparator),
          id: cursorValue.slice(cursorSeparator + 1),
        }
      : null;
    if (
      cursor &&
      (cursorSeparator < 1 ||
        cursor.updatedAt.length > 64 ||
        !/^src_[a-f0-9]{32}$/.test(cursor.id))
    ) {
      throw new RequestError("The source-registry cursor is invalid.", 400);
    }

    const db = await ensureDatabase();
    const where: string[] = [];
    const bindings: Array<string | number> = [];
    if (requestedStatus !== "all") {
      where.push("status = ?");
      bindings.push(requestedStatus);
    }
    if (query) {
      const escaped = query.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");
      where.push("(name LIKE ? ESCAPE '!' COLLATE NOCASE OR canonical_url LIKE ? ESCAPE '!' COLLATE NOCASE)");
      bindings.push(`%${escaped}%`, `%${escaped}%`);
    }
    if (cursor) {
      where.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
      bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
    }
    const [sourceResult, countResult] = await Promise.all([
      db.prepare(
        `SELECT id, source_key, name, source_type, canonical_url,
           permission_basis, status, trust_level, last_seen_at, updated_at
         FROM event_sources
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
      ).bind(...bindings, requestedLimit + 1).all<Record<string, unknown>>(),
      db.prepare(
        `SELECT status, COUNT(*) AS count FROM event_sources GROUP BY status`,
      ).all<{ status: string; count: number }>(),
    ]);
    const pageSources = sourceResult.results.slice(0, requestedLimit);
    const sourceIds = pageSources.map((source) => String(source.id));
    const endpointResult = sourceIds.length
      ? await db.prepare(
        `SELECT endpoints.id, endpoints.source_id, endpoints.adapter,
           endpoints.endpoint_url, endpoints.status, endpoints.schedule_hours,
           endpoints.country_code, endpoints.locale, endpoints.timezone,
           endpoints.max_pages, endpoints.max_records, endpoints.next_run_at,
           endpoints.failure_count, endpoints.last_success_at,
           endpoints.last_error_code, runs.status AS last_run_status,
           runs.started_at AS last_run_started_at,
           runs.findings_count AS last_run_findings_count,
           runs.candidates_count AS last_run_candidates_count
         FROM event_source_endpoints endpoints
         LEFT JOIN discovery_runs runs ON runs.id = (
           SELECT latest.id FROM discovery_runs latest
           WHERE latest.endpoint_id = endpoints.id
           ORDER BY latest.started_at DESC LIMIT 1
         )
         WHERE endpoints.source_id IN (${sourceIds.map(() => "?").join(",")})
         ORDER BY endpoints.created_at ASC`,
      ).bind(...sourceIds).all<Record<string, unknown>>()
      : { results: [] as Record<string, unknown>[] };
    const endpointsBySource = new Map<string, Record<string, unknown>[]>();
    for (const endpoint of endpointResult.results) {
      const sourceId = String(endpoint.source_id ?? "");
      const current = endpointsBySource.get(sourceId) ?? [];
      current.push(endpoint);
      endpointsBySource.set(sourceId, current);
    }
    const sources = pageSources.map((source) => ({
      id: source.id,
      key: source.source_key,
      name: source.name,
      type: source.source_type,
      canonicalUrl: source.canonical_url,
      permissionBasis: source.permission_basis,
      status: source.status,
      trustLevel: source.trust_level,
      lastSeenAt: source.last_seen_at,
      updatedAt: source.updated_at,
      endpoints: (endpointsBySource.get(String(source.id)) ?? []).map((endpoint) => ({
        id: endpoint.id,
        adapter: endpoint.adapter,
        url: endpoint.endpoint_url,
        status: endpoint.status,
        scheduleHours: endpoint.schedule_hours,
        countryCode: endpoint.country_code,
        locale: endpoint.locale,
        timezone: endpoint.timezone,
        maxPages: endpoint.max_pages,
        maxRecords: endpoint.max_records,
        nextRunAt: endpoint.next_run_at,
        failureCount: endpoint.failure_count,
        lastSuccessAt: endpoint.last_success_at,
        lastErrorCode: endpoint.last_error_code,
        lastRun: endpoint.last_run_status
          ? {
              status: endpoint.last_run_status,
              startedAt: endpoint.last_run_started_at,
              findingsCount: endpoint.last_run_findings_count,
              candidatesCount: endpoint.last_run_candidates_count,
            }
          : null,
      })),
    }));
    return noStoreJson({
      ok: true,
      data: {
        sources,
        nextCursor: sourceResult.results.length > requestedLimit && pageSources.length
          ? `${String(pageSources.at(-1)?.updated_at)}|${String(pageSources.at(-1)?.id)}`
          : null,
        counts: countResult.results.reduce<Record<string, number>>((counts, row) => {
          counts[row.status] = Number(row.count);
          return counts;
        }, {}),
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApiUser(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "admin-discovery-source-control",
      subject: user.memberId,
      includeIp: false,
      limit: 60,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "ADMIN_RATE_LIMITED",
            message: "Too many source-control changes were attempted.",
          },
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const body = await readJsonBody(request, 3_000);
    const allowedKeys = [
      "sourceId",
      "candidateId",
      "expectedUpdatedAt",
      "status",
      "trustLevel",
      "reason",
    ];
    if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
      throw new RequestError("The source-control request contains unsupported fields.", 400);
    }
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    const candidateId = Object.hasOwn(body, "candidateId")
      ? typeof body.candidateId === "string"
        ? body.candidateId.trim()
        : ""
      : null;
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";
    const status = body.status;
    const trustLevel = body.trustLevel;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (
      !/^src_[a-f0-9]{32}$/.test(sourceId) ||
      (candidateId !== null && !/^can_[a-f0-9]{32}$/.test(candidateId)) ||
      !expectedUpdatedAt ||
      expectedUpdatedAt.length > 64 ||
      typeof status !== "string" ||
      !sourceStatuses.includes(status as SourceStatus) ||
      typeof trustLevel !== "string" ||
      !sourceTrustLevels.includes(trustLevel as SourceTrust)
    ) {
      throw new RequestError("Refresh and choose valid source controls.", 400);
    }
    if (reason.length < 10 || reason.length > 500) {
      throw new RequestError(
        "Give a source-control reason between 10 and 500 characters.",
        400,
      );
    }

    const db = await ensureDatabase();
    const source = await db
      .prepare(
        `SELECT id, status, trust_level, updated_at
         FROM event_sources WHERE id = ? LIMIT 1`,
      )
      .bind(sourceId)
      .first<SourceRow>();
    if (!source) {
      return noStoreJson(
        {
          ok: false,
          error: { code: "SOURCE_NOT_FOUND", message: "That source was not found." },
        },
        { status: 404 },
      );
    }
    if (source.updated_at !== expectedUpdatedAt) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "SOURCE_ITEM_STALE",
            message: "Another administrator changed this source. Refresh first.",
          },
        },
        { status: 409 },
      );
    }
    const displayedRelation = candidateId
      ? await db
        .prepare(
          `SELECT displayed.id
           FROM event_candidate_provenance displayed
           WHERE displayed.candidate_id = ? AND displayed.source_id = ?
             AND displayed.id = (
               SELECT latest.id
               FROM event_candidate_provenance latest
               WHERE latest.candidate_id = displayed.candidate_id
               ORDER BY latest.observed_at DESC, latest.created_at DESC
               LIMIT 1
             )
           LIMIT 1`,
        )
        .bind(candidateId, sourceId)
        .first<SourceRelationRow>()
      : null;
    if (candidateId && !displayedRelation) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "SOURCE_RELATION_STALE",
            message:
              "The displayed candidate source changed. Refresh before changing source controls.",
          },
        },
        { status: 409 },
      );
    }
    if (source.status === status && source.trust_level === trustLevel) {
      throw new RequestError("Choose a source status or trust change before saving.", 400);
    }

    const nextUpdatedAtCandidate = new Date().toISOString();
    const nextUpdatedAt =
      nextUpdatedAtCandidate === expectedUpdatedAt
        ? new Date(Date.now() + 1).toISOString()
        : nextUpdatedAtCandidate;
    const inactive = status === "paused" || status === "revoked" ? 1 : 0;
    const verificationLabel =
      status !== "active"
        ? "source_checked"
        : trustLevel === "organizer" || trustLevel === "official"
          ? "organizer_verified"
          : trustLevel === "partner"
            ? "partner_verified"
            : "source_checked";
    const auditId = `dsa_${crypto.randomUUID()}`;
    const epoch = Math.floor(Date.now() / 1_000);
    const [sourceResult, eventResult, , , auditResult] = await db.batch([
      db
        .prepare(
          `UPDATE event_sources
           SET status = ?, trust_level = ?, updated_at = ?
           WHERE id = ? AND updated_at = ?
             AND (? IS NULL OR EXISTS (
               SELECT 1
               FROM event_candidate_provenance displayed
               WHERE displayed.candidate_id = ?
                 AND displayed.source_id = event_sources.id
                 AND displayed.id = (
                   SELECT latest.id
                   FROM event_candidate_provenance latest
                   WHERE latest.candidate_id = displayed.candidate_id
                   ORDER BY latest.observed_at DESC, latest.created_at DESC
                   LIMIT 1
                 )
             ))`,
        )
        .bind(
          status,
          trustLevel,
          nextUpdatedAt,
          sourceId,
          expectedUpdatedAt,
          candidateId,
          candidateId,
        ),
      db
        .prepare(
          `UPDATE motoring_events
           SET status = 'withdrawn', updated_at = ?
           WHERE ? = 1 AND status = 'published'
             AND id IN (
               SELECT event_id FROM motoring_event_provenance
               WHERE source_id = ?
             )
             AND EXISTS (
               SELECT 1 FROM event_sources
               WHERE id = ? AND updated_at = ? AND status = ?
                 AND trust_level = ?
             )`,
        )
        .bind(
          nextUpdatedAt,
          inactive,
          sourceId,
          sourceId,
          nextUpdatedAt,
          status,
          trustLevel,
        ),
      db
        .prepare(
          `UPDATE event_candidates
           SET status = 'reviewing', review_required = 1,
             published_event_id = NULL, updated_at = ?
           WHERE ? = 1 AND status = 'published'
             AND published_event_id IN (
               SELECT events.id
               FROM motoring_events events
               JOIN motoring_event_provenance provenance
                 ON provenance.event_id = events.id
               WHERE provenance.source_id = ?
                 AND events.status = 'withdrawn'
                 AND events.updated_at = ?
             )
             AND EXISTS (
               SELECT 1 FROM event_sources
               WHERE id = ? AND updated_at = ? AND status = ?
                 AND trust_level = ?
             )`,
        )
        .bind(
          nextUpdatedAt,
          inactive,
          sourceId,
          nextUpdatedAt,
          sourceId,
          nextUpdatedAt,
          status,
          trustLevel,
        ),
      db
        .prepare(
          `UPDATE motoring_event_provenance
           SET verification_label = ?, updated_at = ?
           WHERE source_id = ?
             AND EXISTS (
               SELECT 1 FROM event_sources
               WHERE id = ? AND updated_at = ? AND status = ?
                 AND trust_level = ?
             )`,
        )
        .bind(
          verificationLabel,
          nextUpdatedAt,
          sourceId,
          sourceId,
          nextUpdatedAt,
          status,
          trustLevel,
        ),
      db
        .prepare(
          `INSERT INTO event_source_review_audit (
             id, source_id, candidate_id, admin_member_id, admin_email,
             action, previous_status, next_status, previous_trust_level,
             next_trust_level, reason, previous_updated_at, next_updated_at,
             linked_public_events_affected, created_at
           )
           SELECT ?, id, ?, ?, ?, 'source_control_updated', ?, ?, ?, ?, ?, ?, ?,
             (
               SELECT COUNT(DISTINCT events.id)
               FROM motoring_events events
               JOIN motoring_event_provenance provenance
                 ON provenance.event_id = events.id
               WHERE provenance.source_id = event_sources.id
                 AND events.status = 'withdrawn'
                 AND events.updated_at = ?
             ), ?
           FROM event_sources
           WHERE id = ? AND updated_at = ? AND status = ? AND trust_level = ?
             AND (? IS NULL OR EXISTS (
               SELECT 1
               FROM event_candidate_provenance displayed
               WHERE displayed.candidate_id = ?
                 AND displayed.source_id = event_sources.id
                 AND displayed.id = (
                   SELECT latest.id
                   FROM event_candidate_provenance latest
                   WHERE latest.candidate_id = displayed.candidate_id
                   ORDER BY latest.observed_at DESC, latest.created_at DESC
                   LIMIT 1
                 )
             ))`,
        )
        .bind(
          auditId,
          candidateId,
          user.memberId,
          user.authenticatedEmail.trim().toLowerCase(),
          source.status,
          status,
          source.trust_level,
          trustLevel,
          reason,
          expectedUpdatedAt,
          nextUpdatedAt,
          nextUpdatedAt,
          epoch,
          sourceId,
          nextUpdatedAt,
          status,
          trustLevel,
          candidateId,
          candidateId,
        ),
    ]);

    if (
      Number(sourceResult.meta.changes ?? 0) !== 1 ||
      Number(auditResult.meta.changes ?? 0) !== 1
    ) {
      const currentRelation = candidateId
        ? await db
          .prepare(
            `SELECT displayed.id
             FROM event_candidate_provenance displayed
             WHERE displayed.candidate_id = ? AND displayed.source_id = ?
               AND displayed.id = (
                 SELECT latest.id
                 FROM event_candidate_provenance latest
                 WHERE latest.candidate_id = displayed.candidate_id
                 ORDER BY latest.observed_at DESC, latest.created_at DESC
                 LIMIT 1
               )
             LIMIT 1`,
          )
          .bind(candidateId, sourceId)
          .first<SourceRelationRow>()
        : null;
      if (candidateId && !currentRelation) {
        return noStoreJson(
          {
            ok: false,
            error: {
              code: "SOURCE_RELATION_STALE",
              message:
                "The displayed candidate source changed. Refresh before changing source controls.",
            },
          },
          { status: 409 },
        );
      }
      const current = await db
        .prepare(`SELECT updated_at FROM event_sources WHERE id = ? LIMIT 1`)
        .bind(sourceId)
        .first<{ updated_at: string }>();
      if (current) {
        return noStoreJson(
          {
            ok: false,
            error: {
              code: "SOURCE_ITEM_STALE",
              message: "Another administrator changed this source. Refresh first.",
            },
          },
          { status: 409 },
        );
      }
      return noStoreJson(
        {
          ok: false,
          error: { code: "SOURCE_NOT_FOUND", message: "That source was not found." },
        },
        { status: 404 },
      );
    }

    const candidateAfter = candidateId
      ? await db
        .prepare(
          `SELECT status, review_required, updated_at
           FROM event_candidates WHERE id = ? LIMIT 1`,
        )
        .bind(candidateId)
        .first<{
          status: string;
          review_required: number;
          updated_at: string;
        }>()
      : null;

    return noStoreJson({
      ok: true,
      data: {
        sourceReview: {
          id: sourceId,
          updatedAt: nextUpdatedAt,
          status,
          trustLevel,
        },
        linkedPublicEventsAffected: Number(eventResult.meta.changes ?? 0),
        candidateState: candidateAfter
          ? {
              status: candidateAfter.status,
              reviewRequired: Boolean(candidateAfter.review_required),
              updatedAt: candidateAfter.updated_at,
            }
          : null,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

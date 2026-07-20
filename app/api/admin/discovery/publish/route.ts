import { requireAdminApiUser } from "@/lib/admin-auth";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { ensureDatabase } from "@/lib/database";
import {
  type DiscoveryCategory,
  publicationFields,
  sha256Hex,
} from "@/lib/discovery-payload";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

type CandidateRow = {
  id: string;
  title: string;
  description: string;
  organiser_name: string;
  venue: string;
  town: string;
  postcode: string;
  country_code: string;
  admin_area: string;
  timezone: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  category: DiscoveryCategory;
  official_url: string;
  price: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  published_event_id: string | null;
  review_required: number;
  internal_notes: string;
  assigned_to: string;
  updated_at: string;
  source_id: string;
  source_status: string;
  source_trust: string;
  source_url: string;
  observed_at: string;
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
        code: "DISCOVERY_PUBLISH_FAILED",
        message: "The candidate could not be published safely.",
      },
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApiUser(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "admin-discovery-publish",
      subject: user.memberId,
      includeIp: false,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "ADMIN_RATE_LIMITED",
            message: "Too many publication attempts were made. Please try later.",
          },
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const body = await readJsonBody(request, 2_000);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";
    if (!/^can_[a-f0-9]{32}$/.test(id) || !expectedUpdatedAt || expectedUpdatedAt.length > 64) {
      throw new RequestError("Refresh and choose a valid discovery candidate.", 400);
    }

    const db = await ensureDatabase();
    const candidate = await db
      .prepare(
        `SELECT candidates.id, candidates.title, candidates.description,
          candidates.organiser_name,
          candidates.venue, candidates.town, candidates.postcode,
          candidates.country_code, candidates.admin_area, candidates.timezone,
          candidates.start_date, candidates.end_date, candidates.start_time,
          candidates.category, candidates.official_url, candidates.price,
          candidates.latitude, candidates.longitude, candidates.status,
          candidates.published_event_id, candidates.review_required,
          candidates.internal_notes, candidates.assigned_to,
          candidates.updated_at, provenance.source_id,
          sources.status AS source_status, sources.trust_level AS source_trust,
          provenance.source_url, provenance.observed_at
         FROM event_candidates candidates
         JOIN event_candidate_provenance provenance
           ON provenance.id = (
             SELECT latest.id FROM event_candidate_provenance latest
             WHERE latest.candidate_id = candidates.id
             ORDER BY latest.observed_at DESC, latest.created_at DESC
             LIMIT 1
           )
         JOIN event_sources sources ON sources.id = provenance.source_id
         WHERE candidates.id = ? LIMIT 1`,
      )
      .bind(id)
      .first<CandidateRow>();
    if (!candidate) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "DISCOVERY_CANDIDATE_NOT_FOUND",
            message: "That discovery candidate or its provenance was not found.",
          },
        },
        { status: 404 },
      );
    }
    if (candidate.updated_at !== expectedUpdatedAt) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "QUEUE_ITEM_STALE",
            message: "Another administrator updated this candidate. Refresh before publishing.",
          },
        },
        { status: 409 },
      );
    }
    if (candidate.source_status !== "active") {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "DISCOVERY_SOURCE_DISABLED",
            message: "Approve the candidate and its permission review to activate the source before publishing.",
          },
        },
        { status: 409 },
      );
    }

    const publication = publicationFields({
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      organiserName: candidate.organiser_name,
      venue: candidate.venue,
      town: candidate.town,
      postcode: candidate.postcode,
      countryCode: candidate.country_code,
      adminArea: candidate.admin_area,
      timezone: candidate.timezone,
      startDate: candidate.start_date,
      endDate: candidate.end_date,
      startTime: candidate.start_time,
      category: candidate.category,
      officialUrl: candidate.official_url,
      price: candidate.price,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      status: candidate.status,
      publishedEventId: candidate.published_event_id,
      reviewRequired: Boolean(candidate.review_required),
    });
    if (!publication.ready) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "DISCOVERY_CANDIDATE_INCOMPLETE",
            message: `Publication needs: ${publication.missing.join(", ")}.`,
          },
          data: { publication },
        },
        { status: 409 },
      );
    }

    const duplicate = await db
      .prepare(
        `SELECT id, status FROM motoring_events
         WHERE id = ? OR (official_url = ? AND start_date = ?)
         LIMIT 1`,
      )
      .bind(publication.eventId, candidate.official_url, candidate.start_date)
      .first<{ id: string; status: string }>();
    const restoring =
      duplicate?.id === publication.eventId && duplicate.status === "withdrawn";
    if (duplicate && !restoring) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "DISCOVERY_EVENT_DUPLICATE",
            message: "A public event already uses this source and date.",
          },
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const epoch = Math.floor(Date.now() / 1_000);
    const auditId = `dca_${crypto.randomUUID()}`;
    const provenanceHash = await sha256Hex(
      `published:v1:${publication.eventId}:${candidate.source_url}`,
    );
    const publicProvenanceId = `mep_${provenanceHash.slice(0, 32)}`;
    const snapshotHash = await sha256Hex(
      JSON.stringify({
        title: candidate.title,
        description: candidate.description,
        organiserName: candidate.organiser_name,
        venue: candidate.venue,
        town: candidate.town,
        postcode: candidate.postcode,
        countryCode: candidate.country_code,
        adminArea: candidate.admin_area,
        timezone: candidate.timezone,
        startDate: candidate.start_date,
        endDate: candidate.end_date,
        startTime: candidate.start_time,
        category: candidate.category,
        officialUrl: candidate.official_url,
        price: candidate.price,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      }),
    );
    const verificationLabel =
      candidate.source_trust === "organizer" || candidate.source_trust === "official"
        ? "organizer_verified"
        : candidate.source_trust === "partner"
          ? "partner_verified"
          : "source_checked";

    const eventWrite = restoring
      ? db
          .prepare(
            `UPDATE motoring_events
             SET title = ?, description = ?, venue = ?, town = ?, postcode = ?,
               country_code = ?, admin_area = ?, timezone = ?, start_date = ?,
               end_date = ?, start_time = ?, category = ?,
               latitude = ?, longitude = ?, official_url = ?,
               official_label = 'Official event page', price = ?, image = ?,
               featured = 0, status = 'published', updated_at = ?
             WHERE id = ? AND status = 'withdrawn'
               AND EXISTS (
                 SELECT 1 FROM event_candidates
                 WHERE id = ? AND updated_at = ? AND status = 'approved'
                   AND review_required = 0 AND published_event_id IS NULL
               )
               AND EXISTS (
                 SELECT 1 FROM event_sources
                 WHERE id = ? AND status = 'active'
               )`,
          )
          .bind(
            candidate.title,
            candidate.description,
            candidate.venue,
            candidate.town,
            candidate.postcode,
            candidate.country_code,
            candidate.admin_area,
            candidate.timezone,
            candidate.start_date,
            candidate.end_date,
            candidate.start_time,
            candidate.category,
            candidate.latitude,
            candidate.longitude,
            candidate.official_url,
            candidate.price,
            publication.image,
            now,
            publication.eventId,
            candidate.id,
            expectedUpdatedAt,
            candidate.source_id,
          )
      : db
          .prepare(
            `INSERT INTO motoring_events (
               id, title, description, venue, town, postcode, country_code,
               admin_area, timezone, start_date, end_date, start_time, category,
               latitude, longitude, official_url,
               official_label, price, image, featured, status, created_at,
               updated_at
             )
             SELECT ?, title, description, venue, town, postcode, country_code,
               admin_area, timezone, start_date, end_date, start_time, category,
               latitude, longitude, official_url,
               'Official event page', price, ?, 0, 'published', ?, ?
             FROM event_candidates
             WHERE id = ? AND updated_at = ? AND status = 'approved'
               AND review_required = 0 AND published_event_id IS NULL
               AND EXISTS (
                 SELECT 1 FROM event_sources
                 WHERE id = ? AND status = 'active'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM motoring_events
                 WHERE official_url = ? AND start_date = ?
               )`,
          )
          .bind(
            publication.eventId,
            publication.image,
            now,
            now,
            candidate.id,
            expectedUpdatedAt,
            candidate.source_id,
            candidate.official_url,
            candidate.start_date,
          );
    const provenanceWrite = restoring
      ? db
          .prepare(
            `UPDATE motoring_event_provenance
             SET candidate_id = ?, source_id = ?, source_url = ?,
               last_checked_at = ?, verification_label = ?, updated_at = ?
             WHERE event_id = ? AND is_primary = 1
               AND EXISTS (
                 SELECT 1 FROM motoring_events
                 WHERE id = ? AND status = 'published'
               )`,
          )
          .bind(
            candidate.id,
            candidate.source_id,
            candidate.source_url,
            candidate.observed_at,
            verificationLabel,
            now,
            publication.eventId,
            publication.eventId,
          )
      : db
          .prepare(
            `INSERT INTO motoring_event_provenance (
               id, event_id, candidate_id, source_id, source_url,
               last_checked_at, verification_label, is_primary, created_at,
               updated_at
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
             FROM event_candidates
             WHERE id = ? AND updated_at = ? AND status = 'approved'
               AND review_required = 0 AND published_event_id IS NULL
               AND EXISTS (SELECT 1 FROM motoring_events WHERE id = ?)
               AND EXISTS (
                 SELECT 1 FROM event_sources
                 WHERE id = ? AND status = 'active'
               )`,
          )
          .bind(
            publicProvenanceId,
            publication.eventId,
            candidate.id,
            candidate.source_id,
            candidate.source_url,
            candidate.observed_at,
            verificationLabel,
            now,
            now,
            candidate.id,
            expectedUpdatedAt,
            publication.eventId,
            candidate.source_id,
          );

    const results = await db.batch([
      eventWrite,
      provenanceWrite,
      db
        .prepare(
          `INSERT INTO event_candidate_review_audit (
             id, candidate_id, admin_member_id, admin_email, action,
             previous_status, next_status, previous_review_required,
             next_review_required, note_changed, changed_fields,
             previous_snapshot_hash, next_snapshot_hash, source_id,
             assigned_to, created_at
           )
           SELECT ?, id, ?, ?, 'candidate_published', status, 'published',
             review_required, 0, 0, ?, ?, ?, ?, assigned_to, ?
           FROM event_candidates
           WHERE id = ? AND updated_at = ? AND status = 'approved'
             AND review_required = 0 AND published_event_id IS NULL
             AND EXISTS (SELECT 1 FROM motoring_events WHERE id = ?)
             AND EXISTS (
               SELECT 1 FROM event_sources
               WHERE id = ? AND status = 'active'
             )`,
        )
        .bind(
          auditId,
          user.memberId,
          user.authenticatedEmail.trim().toLowerCase(),
          JSON.stringify(["status", "reviewRequired", "publishedEventId"]),
          snapshotHash,
          snapshotHash,
          candidate.source_id,
          epoch,
          candidate.id,
          expectedUpdatedAt,
          publication.eventId,
          candidate.source_id,
        ),
      db
        .prepare(
          `UPDATE event_candidates
           SET status = 'published', review_required = 0,
             published_event_id = ?, updated_at = ?
           WHERE id = ? AND updated_at = ? AND status = 'approved'
             AND review_required = 0 AND published_event_id IS NULL
             AND EXISTS (SELECT 1 FROM motoring_events WHERE id = ?)
             AND EXISTS (
               SELECT 1 FROM event_sources
               WHERE id = ? AND status = 'active'
             )`,
        )
        .bind(
          publication.eventId,
          now,
          candidate.id,
          expectedUpdatedAt,
          publication.eventId,
          candidate.source_id,
        ),
    ]);
    if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) {
      throw new Error("Atomic publication precondition failed.");
    }

    return noStoreJson({
      ok: true,
      data: {
        id: candidate.id,
        status: "published",
        eventId: publication.eventId,
        updatedAt: now,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

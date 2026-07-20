import { requireAdminApiUser } from "@/lib/admin-auth";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { ensureDatabase } from "@/lib/database";
import { sha256Hex } from "@/lib/discovery-payload";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

type PublishedCandidate = {
  id: string;
  published_event_id: string;
  updated_at: string;
  title: string;
  description: string;
  organiser_name: string;
  venue: string;
  town: string;
  postcode: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  category: string;
  official_url: string;
  price: string;
  latitude: number | null;
  longitude: number | null;
  source_id: string;
  internal_notes: string;
  public_event_updated_at: string;
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
        code: "DISCOVERY_WITHDRAW_FAILED",
        message: "The public event could not be withdrawn safely.",
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
      scope: "admin-discovery-withdraw",
      subject: user.memberId,
      includeIp: false,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: { code: "ADMIN_RATE_LIMITED", message: "Too many withdrawal attempts were made." },
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const body = await readJsonBody(request, 2_000);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!/^can_[a-f0-9]{32}$/.test(id) || !expectedUpdatedAt || expectedUpdatedAt.length > 64) {
      throw new RequestError("Refresh and choose a valid published candidate.", 400);
    }
    if (reason.length < 10 || reason.length > 500) {
      throw new RequestError("Give a withdrawal reason between 10 and 500 characters.", 400);
    }

    const db = await ensureDatabase();
    const candidate = await db
      .prepare(
        `SELECT candidates.id, candidates.published_event_id,
          candidates.updated_at, candidates.title, candidates.description,
          candidates.organiser_name, candidates.venue, candidates.town,
          candidates.postcode, candidates.start_date, candidates.end_date,
          candidates.start_time, candidates.category,
          candidates.official_url, candidates.price, candidates.latitude,
          candidates.longitude, candidates.internal_notes,
          provenance.source_id,
          public_event.updated_at AS public_event_updated_at
         FROM event_candidates candidates
         JOIN event_candidate_provenance provenance
           ON provenance.id = (
             SELECT latest.id FROM event_candidate_provenance latest
             WHERE latest.candidate_id = candidates.id
             ORDER BY latest.observed_at DESC, latest.created_at DESC LIMIT 1
           )
         JOIN motoring_events public_event
           ON public_event.id = candidates.published_event_id
          AND public_event.status = 'published'
         WHERE candidates.id = ? AND candidates.updated_at = ?
           AND candidates.status = 'published'
           AND candidates.published_event_id IS NOT NULL
         LIMIT 1`,
      )
      .bind(id, expectedUpdatedAt)
      .first<PublishedCandidate>();
    if (!candidate) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "QUEUE_ITEM_STALE",
            message: "This candidate changed or is no longer published. Refresh first.",
          },
        },
        { status: 409 },
      );
    }

    const snapshotHash = await sha256Hex(
      JSON.stringify({
        title: candidate.title,
        description: candidate.description,
        organiserName: candidate.organiser_name,
        venue: candidate.venue,
        town: candidate.town,
        postcode: candidate.postcode,
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
    const now = new Date().toISOString();
    const epoch = Math.floor(Date.now() / 1_000);
    const auditId = `dca_${crypto.randomUUID()}`;
    const withdrawalAuditId = `ewa_${crypto.randomUUID()}`;
    const nextNotes = `${candidate.internal_notes}\nWithdrawal ${now.slice(0, 10)}: ${reason}`
      .trim()
      .slice(0, 2_000);
    const results = await db.batch([
      db
        .prepare(
          `UPDATE motoring_events
           SET status = 'withdrawn', updated_at = ?
           WHERE id = ? AND status = 'published' AND updated_at = ?
             AND EXISTS (
               SELECT 1 FROM event_candidates
               WHERE id = ? AND updated_at = ? AND status = 'published'
                 AND published_event_id = ?
             )`,
        )
        .bind(
          now,
          candidate.published_event_id,
          candidate.public_event_updated_at,
          candidate.id,
          expectedUpdatedAt,
          candidate.published_event_id,
        ),
      db
        .prepare(
          `INSERT INTO event_candidate_review_audit (
             id, candidate_id, admin_member_id, admin_email, action,
             previous_status, next_status, previous_review_required,
             next_review_required, note_changed, changed_fields,
             previous_snapshot_hash, next_snapshot_hash, source_id,
             assigned_to, created_at
           )
           SELECT ?, id, ?, ?, 'candidate_review_updated', status, 'reviewing',
             review_required, 1, 1, ?, ?, ?, ?, assigned_to, ?
           FROM event_candidates
           WHERE id = ? AND updated_at = ? AND status = 'published'
             AND published_event_id = ?
             AND EXISTS (
               SELECT 1 FROM motoring_events
               WHERE id = ? AND status = 'withdrawn' AND updated_at = ?
             )`,
        )
        .bind(
          auditId,
          user.memberId,
          user.authenticatedEmail.trim().toLowerCase(),
          JSON.stringify(["status", "reviewRequired", "publishedEventId", "publicEventStatus", "withdrawalReason"]),
          snapshotHash,
          snapshotHash,
          candidate.source_id,
          epoch,
          candidate.id,
          expectedUpdatedAt,
          candidate.published_event_id,
          candidate.published_event_id,
          now,
        ),
      db
        .prepare(
          `UPDATE event_candidates
           SET status = 'reviewing', review_required = 1,
             published_event_id = NULL, internal_notes = ?, updated_at = ?
           WHERE id = ? AND updated_at = ? AND status = 'published'
             AND published_event_id = ?
             AND EXISTS (
               SELECT 1 FROM motoring_events
               WHERE id = ? AND status = 'withdrawn' AND updated_at = ?
             )`,
        )
        .bind(
          nextNotes,
          now,
          candidate.id,
          expectedUpdatedAt,
          candidate.published_event_id,
          candidate.published_event_id,
          now,
        ),
      db
        .prepare(
          `INSERT INTO event_withdrawal_audit (
             id, candidate_id, event_id, admin_member_id, admin_email,
             action, reason, previous_candidate_status, next_candidate_status,
             previous_event_status, next_event_status,
             previous_candidate_updated_at, next_candidate_updated_at,
             previous_event_updated_at, next_event_updated_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, 'manual_withdrawal', ?,
             'published', 'reviewing', 'published', 'withdrawn', ?, ?, ?, ?, ?
           WHERE EXISTS (
               SELECT 1 FROM event_candidates
               WHERE id = ? AND status = 'reviewing' AND review_required = 1
                 AND published_event_id IS NULL AND updated_at = ?
             )
             AND EXISTS (
               SELECT 1 FROM motoring_events
               WHERE id = ? AND status = 'withdrawn' AND updated_at = ?
             )`,
        )
        .bind(
          withdrawalAuditId,
          candidate.id,
          candidate.published_event_id,
          user.memberId,
          user.authenticatedEmail.trim().toLowerCase(),
          reason,
          expectedUpdatedAt,
          now,
          candidate.public_event_updated_at,
          now,
          epoch,
          candidate.id,
          now,
          candidate.published_event_id,
          now,
        ),
    ]);
    const withdrawalAuditResult = results.at(-1);
    if (
      results.slice(0, -1).some((result) => Number(result.meta.changes ?? 0) !== 1) ||
      Number(withdrawalAuditResult?.meta.changes ?? 0) !== 1
    ) {
      throw new Error("Atomic withdrawal precondition failed.");
    }

    return noStoreJson({
      ok: true,
      data: {
        id: candidate.id,
        eventId: candidate.published_event_id,
        status: "reviewing",
        updatedAt: now,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

import { requireAdminApiUser } from "@/lib/admin-auth";
import {
  proposalToEditableCandidate,
  proposedEventId,
  type EventSourceLink,
  type ReviewQueueRow,
  type SourceRegistryRow,
} from "@/lib/admin-discovery-supabase";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { publicationFields, validateAdminCandidateFields } from "@/lib/discovery-payload";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  console.error("[admin-discovery-publish] Supabase operation failed", {
    errorClass: error instanceof Error ? error.name : "UnknownError",
  });
  return noStoreJson(
    { ok: false, error: { code: "DISCOVERY_PUBLISH_FAILED", message: "The candidate could not be published safely." } },
    { status: 500 },
  );
}

async function loadSource(eventId: string) {
  const admin = createSupabaseAdminClient();
  const { data: linkData, error: linkError } = await admin
    .from("event_sources")
    .select("event_id,provider,source_url,canonical_url")
    .eq("event_id", eventId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkError) throw linkError;
  const link = linkData as EventSourceLink | null;
  if (!link?.provider) return { link: null, source: null };
  const { data: sourceData, error: sourceError } = await admin
    .from("source_registry")
    .select("id,source_key,source_name,source_type,start_url,requires_review,is_active,notes,last_checked_at,last_success_at,last_error,updated_at")
    .eq("source_key", link.provider)
    .maybeSingle();
  if (sourceError) throw sourceError;
  return { link, source: sourceData as SourceRegistryRow | null };
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApiUser(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "admin-supabase-discovery-publish",
      subject: user.memberId,
      includeIp: false,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return noStoreJson(
        { ok: false, error: { code: "ADMIN_RATE_LIMITED", message: "Too many publication attempts were made." } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }
    const body = await readJsonBody(request, 2_000);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!uuidPattern.test(id) || !expectedUpdatedAt || expectedUpdatedAt.length > 64) {
      throw new RequestError("Refresh and choose a valid discovery candidate.", 400);
    }

    const admin = createSupabaseAdminClient();
    const { data: reviewData, error: reviewError } = await admin
      .from("review_queue")
      .select("id,candidate_key,proposed_event,source_url,reason,confidence_score,status,reviewed_by,reviewed_at,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (reviewError) throw reviewError;
    const review = reviewData as ReviewQueueRow | null;
    if (!review) {
      return noStoreJson(
        { ok: false, error: { code: "DISCOVERY_CANDIDATE_NOT_FOUND", message: "That discovery candidate was not found." } },
        { status: 404 },
      );
    }
    if (review.updated_at !== expectedUpdatedAt || review.status !== "approved") {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "The candidate is no longer approved at the version shown. Refresh first." } },
        { status: 409 },
      );
    }
    const eventId = proposedEventId(review.proposed_event);
    if (!eventId) throw new RequestError("The candidate is missing its linked event record.", 409);
    const candidate = validateAdminCandidateFields(
      proposalToEditableCandidate(review.proposed_event, review.source_url),
    );
    const publication = publicationFields({
      id,
      ...candidate,
      status: "approved",
      reviewRequired: false,
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
    const { source } = await loadSource(eventId);
    if (!source?.is_active) {
      return noStoreJson(
        { ok: false, error: { code: "DISCOVERY_SOURCE_DISABLED", message: "The linked source is not active." } },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { data: existingEvent, error: existingEventError } = await admin
      .from("events")
      .select("id,status")
      .eq("id", eventId)
      .maybeSingle();
    if (existingEventError) throw existingEventError;
    if (!existingEvent || !["review", "published"].includes(String(existingEvent.status))) {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "The linked event changed or is already public. Refresh first." } },
        { status: 409 },
      );
    }
    const alreadyPublished = existingEvent.status === "published";
    if (!alreadyPublished) {
      const { data: eventData, error: eventError } = await admin
        .from("events")
        .update({ status: "published", last_checked_at: now, updated_at: now })
        .eq("id", eventId)
        .eq("status", "review")
        .select("id")
        .maybeSingle();
      if (eventError) throw eventError;
      if (!eventData) {
        return noStoreJson(
          { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "The linked event changed. Refresh first." } },
          { status: 409 },
        );
      }
    }

    const { data: mergedData, error: mergedError } = await admin
      .from("review_queue")
      .update({ status: "merged", reviewed_by: user.memberId, reviewed_at: now, updated_at: now })
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .eq("status", "approved")
      .select("updated_at")
      .maybeSingle();
    if (mergedError || !mergedData) {
      if (!alreadyPublished) {
      const { error: rollbackError } = await admin
        .from("events")
        .update({ status: "review", updated_at: new Date().toISOString() })
        .eq("id", eventId)
        .eq("status", "published");
      if (rollbackError) {
        console.error("[admin-discovery-publish] safe rollback failed", {
          eventId,
          errorCode: rollbackError.code,
        });
      }
      }
      if (mergedError) throw mergedError;
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "Another administrator changed this candidate. Refresh first." } },
        { status: 409 },
      );
    }
    return noStoreJson({
      ok: true,
      data: { eventId, updatedAt: mergedData.updated_at },
    });
  } catch (error) {
    return routeError(error);
  }
}

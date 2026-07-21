import { requireAdminApiUser } from "@/lib/admin-auth";
import { proposedEventId, type ReviewQueueRow } from "@/lib/admin-discovery-supabase";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
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
  console.error("[admin-discovery-withdraw] Supabase operation failed", {
    errorClass: error instanceof Error ? error.name : "UnknownError",
  });
  return noStoreJson(
    { ok: false, error: { code: "DISCOVERY_WITHDRAW_FAILED", message: "The public event could not be withdrawn safely." } },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApiUser(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "admin-supabase-discovery-withdraw",
      subject: user.memberId,
      includeIp: false,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return noStoreJson(
        { ok: false, error: { code: "ADMIN_RATE_LIMITED", message: "Too many withdrawal attempts were made." } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }
    const body = await readJsonBody(request, 2_000);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!uuidPattern.test(id) || !expectedUpdatedAt || expectedUpdatedAt.length > 64) {
      throw new RequestError("Refresh and choose a valid published candidate.", 400);
    }
    if (reason.length < 10 || reason.length > 500) {
      throw new RequestError("Give a withdrawal reason between 10 and 500 characters.", 400);
    }

    const admin = createSupabaseAdminClient();
    const { data: reviewData, error: reviewError } = await admin
      .from("review_queue")
      .select("id,candidate_key,proposed_event,source_url,reason,confidence_score,status,reviewed_by,reviewed_at,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (reviewError) throw reviewError;
    const review = reviewData as ReviewQueueRow | null;
    if (
      !review ||
      review.updated_at !== expectedUpdatedAt ||
      !["approved", "merged"].includes(review.status)
    ) {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "This candidate changed or is no longer published. Refresh first." } },
        { status: 409 },
      );
    }
    const eventId = proposedEventId(review.proposed_event);
    if (!eventId) throw new RequestError("The candidate is missing its linked event record.", 409);
    const now = new Date().toISOString();
    const { data: eventData, error: eventError } = await admin
      .from("events")
      .update({ status: "review", updated_at: now })
      .eq("id", eventId)
      .eq("status", "published")
      .select("id")
      .maybeSingle();
    if (eventError) throw eventError;
    if (!eventData) {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "The linked public event changed. Refresh first." } },
        { status: 409 },
      );
    }
    const nextReason = `${review.reason}\nWithdrawal ${now.slice(0, 10)}: ${reason}`
      .trim()
      .slice(0, 2_000);
    const { data: queueData, error: queueError } = await admin
      .from("review_queue")
      .update({
        status: "pending",
        reason: nextReason,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .in("status", ["approved", "merged"])
      .select("updated_at")
      .maybeSingle();
    if (queueError) throw queueError;
    if (!queueData) {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "The event was hidden, but the review changed. Refresh the queue." } },
        { status: 409 },
      );
    }
    return noStoreJson({ ok: true, data: { eventId, updatedAt: queueData.updated_at } });
  } catch (error) {
    return routeError(error);
  }
}

import { requireAdminApiUser } from "@/lib/admin-auth";
import { proposedEventId, type ReviewQueueRow, type SourceRegistryRow } from "@/lib/admin-discovery-supabase";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

const sourceStatuses = ["pending", "active", "paused", "revoked"] as const;
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
  console.error("[admin-discovery-source] Supabase operation failed", {
    errorClass: error instanceof Error ? error.name : "UnknownError",
  });
  return noStoreJson(
    { ok: false, error: { code: "SOURCE_CONTROL_FAILED", message: "The source-control transition could not be completed safely." } },
    { status: 500 },
  );
}

function displayStatus(source: Pick<SourceRegistryRow, "is_active">) {
  return source.is_active ? "active" : "paused";
}

export async function GET(request: Request) {
  try {
    await requireAdminApiUser(request);
    const params = new URL(request.url).searchParams;
    const requestedStatus = params.get("status") ?? "all";
    const search = (params.get("q") ?? "").normalize("NFC").trim();
    const requestedLimit = Number(params.get("limit") ?? "50");
    const cursorValue = params.get("cursor") ?? "";
    if (
      (requestedStatus !== "all" && !sourceStatuses.includes(requestedStatus as typeof sourceStatuses[number])) ||
      search.length > 120 ||
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > 100
    ) {
      throw new RequestError("Choose valid source-registry filters.", 400);
    }
    const separator = cursorValue.lastIndexOf("|");
    const cursor = cursorValue
      ? { updatedAt: cursorValue.slice(0, separator), id: cursorValue.slice(separator + 1) }
      : null;
    if (cursor && (separator < 1 || cursor.updatedAt.length > 64 || !uuidPattern.test(cursor.id))) {
      throw new RequestError("The source-registry cursor is invalid.", 400);
    }

    const admin = createSupabaseAdminClient();
    let query = admin
      .from("source_registry")
      .select("id,source_key,source_name,source_type,start_url,requires_review,is_active,notes,last_checked_at,last_success_at,last_error,updated_at")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(requestedLimit + 1);
    if (requestedStatus === "active") query = query.eq("is_active", true);
    if (["pending", "paused", "revoked"].includes(requestedStatus)) {
      query = query.eq("is_active", false);
    }
    if (search) {
      const escaped = search.replaceAll("%", "\\%").replaceAll("_", "\\_");
      query = query.or(`source_name.ilike.%${escaped}%,start_url.ilike.%${escaped}%`);
    }
    if (cursor) {
      query = query.or(
        `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
      );
    }
    const [{ data, error }, { count: activeCount, error: activeError }, { count: pausedCount, error: pausedError }] = await Promise.all([
      query,
      admin.from("source_registry").select("id", { head: true, count: "exact" }).eq("is_active", true),
      admin.from("source_registry").select("id", { head: true, count: "exact" }).eq("is_active", false),
    ]);
    if (error) throw error;
    if (activeError) throw activeError;
    if (pausedError) throw pausedError;
    const rows = ((data ?? []) as SourceRegistryRow[]).slice(0, requestedLimit);
    const last = rows.at(-1);
    return noStoreJson({
      ok: true,
      data: {
        sources: rows.map((source) => ({
          id: source.id,
          key: source.source_key,
          name: source.source_name,
          type: source.source_type,
          canonicalUrl: source.start_url,
          permissionBasis: "manual_review",
          status: displayStatus(source),
          trustLevel: "unverified",
          lastSeenAt: source.last_checked_at,
          updatedAt: source.updated_at,
          lastError: source.last_error,
          endpoints: [],
        })),
        nextCursor:
          (data?.length ?? 0) > requestedLimit && last
            ? `${last.updated_at}|${last.id}`
            : null,
        counts: { active: activeCount ?? 0, paused: pausedCount ?? 0 },
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
      scope: "admin-supabase-source-control",
      subject: user.memberId,
      includeIp: false,
      limit: 60,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return noStoreJson(
        { ok: false, error: { code: "ADMIN_RATE_LIMITED", message: "Too many source-control changes were attempted." } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }
    const body = await readJsonBody(request, 3_000);
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : null;
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    const status = typeof body.status === "string" ? body.status : "";
    const trustLevel = typeof body.trustLevel === "string" ? body.trustLevel : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (
      !uuidPattern.test(sourceId) ||
      (candidateId !== null && !uuidPattern.test(candidateId)) ||
      !expectedUpdatedAt ||
      expectedUpdatedAt.length > 64 ||
      !sourceStatuses.includes(status as typeof sourceStatuses[number]) ||
      trustLevel !== "unverified"
    ) {
      throw new RequestError("Refresh and choose valid source controls.", 400);
    }
    if (reason.length < 10 || reason.length > 500) {
      throw new RequestError("Give a source-control reason between 10 and 500 characters.", 400);
    }

    const admin = createSupabaseAdminClient();
    const { data: sourceData, error: sourceError } = await admin
      .from("source_registry")
      .select("id,source_key,source_name,source_type,start_url,requires_review,is_active,notes,last_checked_at,last_success_at,last_error,updated_at")
      .eq("id", sourceId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    const source = sourceData as SourceRegistryRow | null;
    if (!source) {
      return noStoreJson(
        { ok: false, error: { code: "SOURCE_NOT_FOUND", message: "That source was not found." } },
        { status: 404 },
      );
    }
    if (source.updated_at !== expectedUpdatedAt) {
      return noStoreJson(
        { ok: false, error: { code: "SOURCE_ITEM_STALE", message: "Another administrator changed this source. Refresh first." } },
        { status: 409 },
      );
    }

    let candidate: ReviewQueueRow | null = null;
    let linkedEventId: string | null = null;
    if (candidateId) {
      const { data, error } = await admin
        .from("review_queue")
        .select("id,candidate_key,proposed_event,source_url,reason,confidence_score,status,reviewed_by,reviewed_at,created_at,updated_at")
        .eq("id", candidateId)
        .maybeSingle();
      if (error) throw error;
      candidate = data as ReviewQueueRow | null;
      linkedEventId = candidate ? proposedEventId(candidate.proposed_event) : null;
      if (!candidate || !linkedEventId) {
        return noStoreJson(
          { ok: false, error: { code: "SOURCE_RELATION_STALE", message: "The displayed candidate source changed. Refresh first." } },
          { status: 409 },
        );
      }
      const { count, error: relationError } = await admin
        .from("event_sources")
        .select("id", { head: true, count: "exact" })
        .eq("event_id", linkedEventId)
        .eq("provider", source.source_key);
      if (relationError) throw relationError;
      if (!count) {
        return noStoreJson(
          { ok: false, error: { code: "SOURCE_RELATION_STALE", message: "The displayed candidate source changed. Refresh first." } },
          { status: 409 },
        );
      }
    }

    const nextActive = status === "active";
    if (source.is_active === nextActive) {
      throw new RequestError("Choose a source status change before saving.", 400);
    }
    const now = new Date().toISOString();
    let linkedPublicEventsAffected = 0;
    if (!nextActive) {
      const { data: links, error: linksError } = await admin
        .from("event_sources")
        .select("event_id")
        .eq("provider", source.source_key);
      if (linksError) throw linksError;
      const eventIds = [...new Set((links ?? []).map((link) => String(link.event_id)).filter(Boolean))];
      if (eventIds.length) {
        const { data: withdrawn, error: withdrawError } = await admin
          .from("events")
          .update({ status: "review", updated_at: now })
          .in("id", eventIds)
          .eq("status", "published")
          .select("id");
        if (withdrawError) throw withdrawError;
        linkedPublicEventsAffected = withdrawn?.length ?? 0;
        if (linkedPublicEventsAffected) {
          const { data: mergedRows, error: mergedError } = await admin
            .from("review_queue")
            .select("id,proposed_event,reason")
            .in("status", ["approved", "merged"]);
          if (mergedError) throw mergedError;
          const affected = (mergedRows ?? []).filter((row) => {
            const eventId = proposedEventId(row.proposed_event as Record<string, unknown>);
            return Boolean(eventId && eventIds.includes(eventId));
          });
          await Promise.all(affected.map(async (row) => {
            const { error } = await admin
              .from("review_queue")
              .update({
                status: "pending",
                reason: `${String(row.reason ?? "")}\nSource paused ${now.slice(0, 10)}: ${reason}`.trim().slice(0, 2_000),
                reviewed_by: null,
                reviewed_at: null,
                updated_at: now,
              })
              .eq("id", row.id)
              .in("status", ["approved", "merged"]);
            if (error) throw error;
          }));
        }
      }
    }

    const nextNotes = `${source.notes}\nAdmin source review ${now.slice(0, 10)} (${status}): ${reason}`
      .trim()
      .slice(0, 4_000);
    const { data: updatedSource, error: updateError } = await admin
      .from("source_registry")
      .update({ is_active: nextActive, notes: nextNotes, updated_at: now })
      .eq("id", sourceId)
      .eq("updated_at", expectedUpdatedAt)
      .select("updated_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedSource) {
      return noStoreJson(
        { ok: false, error: { code: "SOURCE_ITEM_STALE", message: "Another administrator changed this source. Refresh first." } },
        { status: 409 },
      );
    }
    return noStoreJson({
      ok: true,
      data: {
        sourceReview: {
          id: source.id,
          updatedAt: updatedSource.updated_at,
          status: nextActive ? "active" : "paused",
          trustLevel: "unverified",
        },
        linkedPublicEventsAffected,
        candidateState: candidate
          ? {
              status: nextActive ? (candidate.status === "merged" ? "published" : candidate.status) : "pending",
              reviewRequired: !nextActive || candidate.status !== "approved",
              updatedAt: candidate.updated_at,
            }
          : null,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

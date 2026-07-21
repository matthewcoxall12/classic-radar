import { requireAdminApiUser } from "@/lib/admin-auth";
import {
  editableCandidateToEventPatch,
  proposedEventId,
  reviewRowToAdminItem,
  reviewStatusForDatabase,
  type EventSourceLink,
  type ReviewQueueRow,
  type SourceRegistryRow,
} from "@/lib/admin-discovery-supabase";
import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import {
  DiscoveryPayloadError,
  publicationFields,
  validateAdminCandidateFields,
} from "@/lib/discovery-payload";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private");
  return Response.json(body, { ...init, headers });
}

function adminError(error: unknown) {
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
  if (error instanceof DiscoveryPayloadError) {
    return noStoreJson(
      { ok: false, error: { code: "INVALID_DISCOVERY_CANDIDATE", message: error.message } },
      { status: 400 },
    );
  }
  console.error("[admin-queue] Supabase operation failed", {
    errorClass: error instanceof Error ? error.name : "UnknownError",
  });
  return noStoreJson(
    {
      ok: false,
      error: {
        code: "ADMIN_QUEUE_UNAVAILABLE",
        message: "The operations queue could not be loaded. Please try again.",
      },
    },
    { status: 500 },
  );
}

async function sourceContext(eventIds: string[]) {
  if (!eventIds.length) {
    return {
      links: new Map<string, EventSourceLink>(),
      sources: new Map<string, SourceRegistryRow>(),
      eventStatuses: new Map<string, string>(),
    };
  }
  const admin = createSupabaseAdminClient();
  const { data: eventsData, error: eventsError } = await admin
    .from("events")
    .select("id,status")
    .in("id", eventIds);
  if (eventsError) throw eventsError;
  const eventStatuses = new Map(
    (eventsData ?? []).map((event) => [String(event.id), String(event.status)]),
  );
  const { data: linksData, error: linksError } = await admin
    .from("event_sources")
    .select("event_id,provider,source_url,canonical_url")
    .in("event_id", eventIds)
    .order("last_seen_at", { ascending: false });
  if (linksError) throw linksError;
  const links = new Map<string, EventSourceLink>();
  for (const link of (linksData ?? []) as EventSourceLink[]) {
    if (!links.has(link.event_id)) links.set(link.event_id, link);
  }
  const keys = [...new Set([...links.values()].map((link) => link.provider).filter(Boolean))];
  const sources = new Map<string, SourceRegistryRow>();
  if (keys.length) {
    const { data, error } = await admin
      .from("source_registry")
      .select("id,source_key,source_name,source_type,start_url,requires_review,is_active,notes,last_checked_at,last_success_at,last_error,updated_at")
      .in("source_key", keys);
    if (error) throw error;
    for (const source of (data ?? []) as SourceRegistryRow[]) {
      sources.set(source.source_key, source);
    }
  }
  return { links, sources, eventStatuses };
}

async function loadReviewRow(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("review_queue")
    .select("id,candidate_key,proposed_event,source_url,reason,confidence_score,status,reviewed_by,reviewed_at,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ReviewQueueRow | null;
}

export async function GET(request: Request) {
  try {
    const { adminEmails } = await requireAdminApiUser();
    const params = new URL(request.url).searchParams;
    const cursorValue = params.get("discoveryCursor") ?? "";
    const requestedLimit = Number(params.get("limit") ?? "100");
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      throw new RequestError("Queue page size must be between 1 and 100.", 400);
    }
    const separator = cursorValue.lastIndexOf("|");
    const cursor = cursorValue
      ? { updatedAt: cursorValue.slice(0, separator), id: cursorValue.slice(separator + 1) }
      : null;
    if (
      cursor &&
      (separator < 1 || cursor.updatedAt.length > 64 || !uuidPattern.test(cursor.id))
    ) {
      throw new RequestError("The discovery queue cursor is invalid.", 400);
    }

    const admin = createSupabaseAdminClient();
    let query = admin
      .from("review_queue")
      .select("id,candidate_key,proposed_event,source_url,reason,confidence_score,status,reviewed_by,reviewed_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(requestedLimit + 1);
    if (cursor) {
      query = query.or(
        `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = ((data ?? []) as ReviewQueueRow[]).slice(0, requestedLimit);
    const eventIds = rows
      .map((row) => proposedEventId(row.proposed_event))
      .filter((id): id is string => Boolean(id));
    const context = await sourceContext(eventIds);
    const items = rows.map((row) => {
      const eventId = proposedEventId(row.proposed_event);
      const link = eventId ? context.links.get(eventId) ?? null : null;
      const source = link ? context.sources.get(link.provider) ?? null : null;
      return reviewRowToAdminItem(
        row,
        link,
        source,
        eventId ? context.eventStatuses.get(eventId) ?? null : null,
      );
    });
    const last = rows.at(-1);
    return noStoreJson({
      ok: true,
      data: {
        items,
        adminEmails,
        nextDiscoveryCursor:
          (data?.length ?? 0) > requestedLimit && last
            ? `${last.updated_at}|${last.id}`
            : null,
      },
    });
  } catch (error) {
    return adminError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, adminEmails } = await requireAdminApiUser(request);
    const rateLimit = await checkDurableAuthRateLimit({
      request,
      scope: "admin-supabase-review-update",
      subject: user.memberId,
      includeIp: false,
      limit: 120,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return noStoreJson(
        { ok: false, error: { code: "ADMIN_RATE_LIMITED", message: "Too many queue changes were attempted." } },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }
    const body = await readJsonBody(request, 8_000);
    if (body.kind !== "discovery") {
      throw new RequestError("This production queue currently accepts discovery reviews only.", 400);
    }
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    const requestedStatus = typeof body.status === "string" ? body.status : "";
    const status = reviewStatusForDatabase(requestedStatus);
    const internalNotes =
      typeof body.internalNotes === "string" ? body.internalNotes.trim() : "";
    const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim().toLowerCase() : "";
    if (!uuidPattern.test(id) || !expectedUpdatedAt || expectedUpdatedAt.length > 64 || !status) {
      throw new RequestError("Refresh and choose a valid discovery candidate.", 400);
    }
    if (status === "merged") {
      throw new RequestError("Use Publish or Withdraw to change a public listing.", 400);
    }
    if (internalNotes.length > 2_000) {
      throw new RequestError("Internal notes must be 2,000 characters or fewer.", 400);
    }
    if (assignedTo && !adminEmails.includes(assignedTo)) {
      throw new RequestError("The assignee must be a configured administrator.", 400);
    }
    if (["approved", "rejected"].includes(status) && internalNotes.length < 10) {
      throw new RequestError("Record how the event and its source were checked before completing review.", 400);
    }

    const candidate = validateAdminCandidateFields(body.candidate);
    const current = await loadReviewRow(id);
    if (!current) {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_NOT_FOUND", message: "That discovery candidate no longer exists." } },
        { status: 404 },
      );
    }
    if (current.updated_at !== expectedUpdatedAt || current.status === "merged") {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "Another administrator changed this item. Refresh first." } },
        { status: 409 },
      );
    }
    const eventId = proposedEventId(current.proposed_event);
    if (!eventId) throw new RequestError("The candidate is missing its linked event record.", 409);
    const context = await sourceContext([eventId]);
    const link = context.links.get(eventId) ?? null;
    const source = link ? context.sources.get(link.provider) ?? null : null;
    const displayedSource =
      body.sourceReview && typeof body.sourceReview === "object" && !Array.isArray(body.sourceReview)
        ? body.sourceReview as Record<string, unknown>
        : null;
    if (
      !source ||
      !displayedSource ||
      displayedSource.id !== source.id ||
      displayedSource.updatedAt !== source.updated_at
    ) {
      return noStoreJson(
        { ok: false, error: { code: "SOURCE_ITEM_STALE", message: "The candidate source changed. Refresh before reviewing." } },
        { status: 409 },
      );
    }
    if (displayedSource.status !== (source.is_active ? "active" : "paused")) {
      throw new RequestError("Save source-control changes separately before reviewing the candidate.", 400);
    }
    if (status === "approved" && !source.is_active) {
      throw new RequestError("Activate the reviewed source before approval.", 400);
    }

    const proposedEvent = editableCandidateToEventPatch(candidate, current.proposed_event);
    const eventPatch = {
      title: candidate.title,
      description: candidate.description,
      event_type: proposedEvent.event_type,
      start_date: candidate.startDate,
      start_time: candidate.startTime,
      end_date: candidate.endDate,
      timezone: candidate.timezone,
      venue_name: candidate.venue,
      town: candidate.town,
      county: candidate.adminArea || null,
      country_code: candidate.countryCode,
      postcode: candidate.postcode || null,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      price_text: candidate.price || null,
      booking_url: candidate.officialUrl,
      organiser_name: candidate.organiserName || null,
      organiser_url: candidate.officialUrl,
      status: status === "rejected" ? "rejected" : "review",
      updated_at: new Date().toISOString(),
    };
    const admin = createSupabaseAdminClient();
    const { data: updatedEvent, error: eventError } = await admin
      .from("events")
      .update(eventPatch)
      .eq("id", eventId)
      .in("status", ["review", "rejected"])
      .select("id")
      .maybeSingle();
    if (eventError) throw eventError;
    if (!updatedEvent) {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "The linked event changed. Refresh before saving." } },
        { status: 409 },
      );
    }
    const nextUpdatedAt = new Date(Date.now() + 1).toISOString();
    const { data: updatedReview, error: reviewError } = await admin
      .from("review_queue")
      .update({
        proposed_event: proposedEvent,
        reason: internalNotes || current.reason,
        status,
        reviewed_by: status === "pending" ? null : user.memberId,
        reviewed_at: status === "pending" ? null : nextUpdatedAt,
        updated_at: nextUpdatedAt,
      })
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .neq("status", "merged")
      .select("updated_at")
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!updatedReview) {
      return noStoreJson(
        { ok: false, error: { code: "QUEUE_ITEM_STALE", message: "Another administrator changed this item. Refresh first." } },
        { status: 409 },
      );
    }
    const publication = publicationFields({
      id,
      ...candidate,
      status,
      reviewRequired: status !== "approved",
    });
    if (!source.is_active && publication.ready) {
      publication.ready = false;
      publication.missing.push("active reviewed source");
    }
    return noStoreJson({
      ok: true,
      data: {
        kind: "discovery",
        id,
        status,
        internalNotes: internalNotes || current.reason,
        assignedTo,
        updatedAt: updatedReview.updated_at,
        reviewRequired: status !== "approved",
        candidate,
        publication,
        sourceReview: {
          id: source.id,
          updatedAt: source.updated_at,
          status: source.is_active ? "active" : "paused",
          trustLevel: "unverified",
        },
      },
    });
  } catch (error) {
    return adminError(error);
  }
}

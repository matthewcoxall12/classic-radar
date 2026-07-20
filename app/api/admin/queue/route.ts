import { requireAdminApiUser } from "@/lib/admin-auth";
import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
} from "@/lib/auth-security";
import { ensureDatabase } from "@/lib/database";
import {
  type DiscoveryCategory,
  DiscoveryPayloadError,
  publicationFields,
  sha256Hex,
  validateAdminCandidateFields,
} from "@/lib/discovery-payload";
import {
  type AdminQueueField,
  type AdminQueueItem,
  isQueueKind,
  isQueueStatus,
  type QueueKind,
  shortReference,
} from "@/lib/operations-queue";
import { readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

type EventSubmissionRow = {
  id: string;
  event_name: string;
  organiser_name: string;
  email: string;
  club_name: string;
  official_url: string;
  venue: string;
  town_postcode: string;
  start_date: string;
  end_date: string | null;
  category: string;
  description: string;
  status: string;
  internal_notes: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
};

type PartnerEnquiryRow = {
  id: string;
  contact_name: string;
  organisation_name: string;
  email: string;
  organisation_type: string;
  website: string;
  message: string;
  status: string;
  internal_notes: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
};

type PrivacyRequestRow = {
  id: string;
  contact_name: string;
  email: string;
  request_type: string;
  message: string;
  status: string;
  internal_notes: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
};

type DiscoveryCandidateRow = {
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
  review_required: number;
  internal_notes: string;
  assigned_to: string;
  published_event_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  source_name: string;
  source_id: string;
  source_type: string;
  source_status: string;
  source_trust: string;
  source_updated_at: string;
  permission_basis: string;
  source_url: string;
  observed_at: string;
  provenance_count: number;
  event_payload: string;
  open_alerts: string | null;
};

type DiscoveryReviewCurrent = {
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
  review_required: number;
  internal_notes: string;
  assigned_to: string;
  updated_at: string;
  published_event_id: string | null;
  source_id: string;
  source_status: string;
  source_trust: string;
  source_updated_at: string;
  source_url: string;
  observed_at: string;
};

type StandardQueueKind = Exclude<QueueKind, "discovery">;

const tables: Record<StandardQueueKind, string> = {
  event: "event_submissions",
  partner: "partner_enquiries",
  privacy: "privacy_requests",
};

const privacyTypeLabels: Record<string, string> = {
  access: "Access request",
  correction: "Correction request",
  deletion: "Deletion request",
  restriction: "Restriction request",
  objection: "Objection",
  other: "Other privacy request",
};

function fields(values: Array<AdminQueueField | null>) {
  return values.filter((value): value is AdminQueueField => Boolean(value?.value));
}

function eventItem(row: EventSubmissionRow): AdminQueueItem {
  return {
    kind: "event",
    id: row.id,
    reference: shortReference("event", row.id),
    title: row.event_name,
    subtitle: `${row.category} · ${row.venue}, ${row.town_postcode}`,
    contactName: row.organiser_name,
    email: row.email,
    status: row.status,
    internalNotes: row.internal_notes,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields: fields([
      row.club_name ? { label: "Club", value: row.club_name } : null,
      { label: "Starts", value: row.start_date },
      row.end_date ? { label: "Ends", value: row.end_date } : null,
      { label: "Official page", value: row.official_url, url: row.official_url },
      { label: "Description", value: row.description },
    ]),
  };
}

function partnerItem(row: PartnerEnquiryRow): AdminQueueItem {
  return {
    kind: "partner",
    id: row.id,
    reference: shortReference("partner", row.id),
    title: row.organisation_name,
    subtitle: row.organisation_type,
    contactName: row.contact_name,
    email: row.email,
    status: row.status,
    internalNotes: row.internal_notes,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields: fields([
      row.website ? { label: "Website", value: row.website, url: row.website } : null,
      { label: "Enquiry", value: row.message },
    ]),
  };
}

function privacyItem(row: PrivacyRequestRow): AdminQueueItem {
  return {
    kind: "privacy",
    id: row.id,
    reference: shortReference("privacy", row.id),
    title: privacyTypeLabels[row.request_type] ?? "Privacy request",
    subtitle: "Personal-information request",
    contactName: row.contact_name,
    email: row.email,
    status: row.status,
    internalNotes: row.internal_notes,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields: [{ label: "Request", value: row.message }],
  };
}

function discoveryItem(row: DiscoveryCandidateRow): AdminQueueItem {
  const editableCandidate = {
    title: row.title,
    description: row.description,
    organiserName: row.organiser_name,
    venue: row.venue,
    town: row.town,
    postcode: row.postcode,
    countryCode: row.country_code,
    adminArea: row.admin_area,
    timezone: row.timezone,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    category: row.category,
    officialUrl: row.official_url,
    price: row.price,
    latitude: row.latitude,
    longitude: row.longitude,
  };
  const publication = publicationFields({
    id: row.id,
    ...editableCandidate,
    status: row.status,
    publishedEventId: row.published_event_id,
    reviewRequired: Boolean(row.review_required),
  });
  if (row.source_status !== "active" && publication.ready) {
    publication.ready = false;
    publication.missing.push("active reviewed source");
  }
  return {
    kind: "discovery",
    id: row.id,
    reference: shortReference("discovery", row.id),
    title: row.title,
    subtitle: `${row.category} · ${row.venue}, ${row.town}`,
    contactName: row.organiser_name || row.source_name,
    email: "",
    status: row.status,
    internalNotes: row.internal_notes,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewRequired: Boolean(row.review_required),
    publication,
    editableCandidate,
    sourceReview: {
      id: row.source_id,
      updatedAt: row.source_updated_at,
      status: row.source_status as "pending" | "active" | "paused" | "revoked",
      trustLevel: row.source_trust as
        | "unverified"
        | "organizer"
        | "partner"
        | "official",
    },
    fields: fields([
      { label: "Source", value: row.source_name },
      { label: "Source type", value: row.source_type },
      { label: "Permission basis", value: row.permission_basis },
      { label: "Source status", value: `${row.source_status} · ${row.source_trust}` },
      { label: "Observed", value: row.observed_at },
      { label: "Observations", value: String(row.provenance_count) },
      row.open_alerts
        ? { label: "Open discovery alerts", value: row.open_alerts }
        : null,
      { label: "Latest normalized observation", value: row.event_payload },
      { label: "Source page", value: row.source_url, url: row.source_url },
    ]),
  };
}

async function loadQueueItems(
  discoveryCursor: { lastSeenAt: string; id: string } | null,
  discoveryLimit: number,
) {
  const db = await ensureDatabase();
  const discoveryOnly = Boolean(discoveryCursor);
  const [eventRows, partnerRows, privacyRows, discoveryRows] = await Promise.all([
    discoveryOnly ? Promise.resolve({ results: [] as EventSubmissionRow[] }) : db
      .prepare(
        `SELECT id, event_name, organiser_name, email, club_name, official_url,
          venue, town_postcode, start_date, end_date, category, description,
          status, internal_notes, assigned_to, created_at, updated_at
         FROM event_submissions ORDER BY created_at DESC LIMIT 75`,
      )
      .all<EventSubmissionRow>(),
    discoveryOnly ? Promise.resolve({ results: [] as PartnerEnquiryRow[] }) : db
      .prepare(
        `SELECT id, contact_name, organisation_name, email, organisation_type,
          website, message, status, internal_notes, assigned_to, created_at,
          updated_at
         FROM partner_enquiries ORDER BY created_at DESC LIMIT 75`,
      )
      .all<PartnerEnquiryRow>(),
    discoveryOnly ? Promise.resolve({ results: [] as PrivacyRequestRow[] }) : db
      .prepare(
        `SELECT id, contact_name, email, request_type, message, status,
          internal_notes, assigned_to, created_at, updated_at
         FROM privacy_requests ORDER BY created_at DESC LIMIT 75`,
      )
      .all<PrivacyRequestRow>(),
    db
      .prepare(
        `SELECT candidates.id, candidates.title, candidates.description,
          candidates.organiser_name, candidates.venue, candidates.town,
          candidates.postcode, candidates.country_code, candidates.admin_area,
          candidates.timezone, candidates.start_date, candidates.end_date,
          candidates.start_time, candidates.category, candidates.official_url,
          candidates.price, candidates.latitude, candidates.longitude,
          candidates.status, candidates.review_required,
          candidates.internal_notes, candidates.assigned_to,
          candidates.published_event_id, candidates.first_seen_at,
          candidates.last_seen_at, candidates.created_at,
          candidates.updated_at, sources.id AS source_id,
          sources.name AS source_name,
          sources.source_type, sources.status AS source_status,
          sources.trust_level AS source_trust,
          sources.updated_at AS source_updated_at, sources.permission_basis,
          provenance.source_url, provenance.observed_at,
          provenance.event_payload,
          (SELECT COUNT(*) FROM event_candidate_provenance all_provenance
           WHERE all_provenance.candidate_id = candidates.id) AS provenance_count,
          (SELECT group_concat(alert_type, ', ')
           FROM event_discovery_alerts alerts
           WHERE alerts.candidate_id = candidates.id AND alerts.status = 'open')
            AS open_alerts
         FROM event_candidates candidates
         JOIN event_candidate_provenance provenance
           ON provenance.id = (
             SELECT latest.id FROM event_candidate_provenance latest
             WHERE latest.candidate_id = candidates.id
             ORDER BY latest.observed_at DESC, latest.created_at DESC
             LIMIT 1
           )
         JOIN event_sources sources ON sources.id = provenance.source_id
         ${discoveryCursor
           ? "WHERE (candidates.last_seen_at < ? OR (candidates.last_seen_at = ? AND candidates.id < ?))"
           : ""}
         ORDER BY candidates.last_seen_at DESC, candidates.id DESC LIMIT ?`,
      )
      .bind(
        ...(discoveryCursor
          ? [discoveryCursor.lastSeenAt, discoveryCursor.lastSeenAt, discoveryCursor.id]
          : []),
        discoveryLimit + 1,
      )
      .all<DiscoveryCandidateRow>(),
  ]);

  const discoveryPage = discoveryRows.results.slice(0, discoveryLimit);
  const items = [
    ...eventRows.results.map(eventItem),
    ...partnerRows.results.map(partnerItem),
    ...privacyRows.results.map(privacyItem),
    ...discoveryPage.map(discoveryItem),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const lastDiscovery = discoveryPage.at(-1);
  return {
    items,
    nextDiscoveryCursor:
      discoveryRows.results.length > discoveryLimit && lastDiscovery
        ? `${lastDiscovery.last_seen_at}|${lastDiscovery.id}`
        : null,
  };
}

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
      {
        ok: false,
        error: { code: "INVALID_DISCOVERY_CANDIDATE", message: error.message },
      },
      { status: 400 },
    );
  }
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

export async function GET(request: Request) {
  try {
    const { adminEmails } = await requireAdminApiUser();
    const params = new URL(request.url).searchParams;
    const cursorValue = params.get("discoveryCursor") ?? "";
    const limit = Number(params.get("limit") ?? "100");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RequestError("Queue page size must be between 1 and 100.", 400);
    }
    const separator = cursorValue.lastIndexOf("|");
    const discoveryCursor = cursorValue
      ? {
          lastSeenAt: cursorValue.slice(0, separator),
          id: cursorValue.slice(separator + 1),
        }
      : null;
    if (
      discoveryCursor &&
      (separator < 1 ||
        discoveryCursor.lastSeenAt.length > 64 ||
        !/^can_[a-f0-9]{32}$/.test(discoveryCursor.id))
    ) {
      throw new RequestError("The discovery queue cursor is invalid.", 400);
    }
    const page = await loadQueueItems(discoveryCursor, limit);
    return noStoreJson({
      ok: true,
      data: {
        items: page.items,
        adminEmails,
        nextDiscoveryCursor: page.nextDiscoveryCursor,
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
      scope: "admin-queue-update",
      subject: user.memberId,
      includeIp: false,
      limit: 120,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "ADMIN_RATE_LIMITED",
            message: "Too many queue changes were attempted. Please try later.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const body = await readJsonBody(request, 6_000);
    const kind = body.kind;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = body.status;
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";
    if (!isQueueKind(kind) || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      throw new RequestError("Choose a valid queue item.", 400);
    }
    if (!expectedUpdatedAt || expectedUpdatedAt.length > 64) {
      throw new RequestError("Refresh the queue item before saving it.", 400);
    }
    if (!isQueueStatus(kind, status)) {
      throw new RequestError("Choose a valid status for this queue.", 400);
    }
    if (typeof body.internalNotes !== "string" || body.internalNotes.length > 2_000) {
      throw new RequestError("Internal notes must be 2,000 characters or fewer.", 400);
    }
    if (typeof body.assignedTo !== "string" || body.assignedTo.length > 180) {
      throw new RequestError("Choose a valid assignee.", 400);
    }
    const internalNotes = body.internalNotes.trim();
    const assignedTo = body.assignedTo.trim().toLowerCase();
    if (assignedTo && !adminEmails.includes(assignedTo)) {
      throw new RequestError("The assignee must be a configured administrator.", 400);
    }

    const db = await ensureDatabase();
    if (kind === "discovery") {
      if (status === "approved" && internalNotes.length < 10) {
        throw new RequestError(
          "Record how the event and source permission were checked before approval.",
          400,
        );
      }
      const sourceReview = body.sourceReview;
      if (!sourceReview || typeof sourceReview !== "object" || Array.isArray(sourceReview)) {
        throw new RequestError("Refresh the reviewed discovery source.", 400);
      }
      const sourceValues = sourceReview as Record<string, unknown>;
      if (
        Object.keys(sourceValues).some(
          (key) => !["id", "updatedAt", "status", "trustLevel"].includes(key),
        ) ||
        typeof sourceValues.id !== "string" ||
        typeof sourceValues.updatedAt !== "string" ||
        !sourceValues.updatedAt ||
        sourceValues.updatedAt.length > 64 ||
        !["pending", "active", "paused", "revoked"].includes(String(sourceValues.status)) ||
        !["unverified", "organizer", "partner", "official"].includes(
          String(sourceValues.trustLevel),
        )
      ) {
        throw new RequestError("Choose valid source review controls.", 400);
      }
      const sourceId = sourceValues.id;
      const sourceUpdatedAt = sourceValues.updatedAt;
      const sourceStatus = String(sourceValues.status);
      const sourceTrust = String(sourceValues.trustLevel);
      const candidate = validateAdminCandidateFields(body.candidate);
      const current = await db
        .prepare(
          `SELECT candidates.title, candidates.description,
            candidates.organiser_name, candidates.venue, candidates.town,
            candidates.postcode, candidates.country_code,
            candidates.admin_area, candidates.timezone, candidates.start_date,
            candidates.end_date,
            candidates.start_time, candidates.category,
            candidates.official_url, candidates.price, candidates.latitude,
            candidates.longitude, candidates.status,
            candidates.review_required, candidates.internal_notes,
            candidates.assigned_to, candidates.updated_at,
            candidates.published_event_id,
            provenance.source_id, sources.status AS source_status,
            sources.trust_level AS source_trust,
            sources.updated_at AS source_updated_at, provenance.source_url,
            provenance.observed_at
           FROM event_candidates candidates
           JOIN event_candidate_provenance provenance
             ON provenance.id = (
               SELECT latest.id FROM event_candidate_provenance latest
               WHERE latest.candidate_id = candidates.id
               ORDER BY latest.observed_at DESC, latest.created_at DESC
               LIMIT 1
             )
           JOIN event_sources sources ON sources.id = provenance.source_id
           WHERE candidates.id = ? AND candidates.updated_at = ?
           LIMIT 1`,
        )
        .bind(id, expectedUpdatedAt)
        .first<DiscoveryReviewCurrent>();
      if (!current) {
        return noStoreJson(
          {
            ok: false,
            error: {
              code: "QUEUE_ITEM_STALE",
              message: "This candidate changed or was published. Refresh before saving.",
            },
          },
          { status: 409 },
        );
      }
      if (status === "published" && current.status !== "published") {
        throw new RequestError(
          "Use the separate Publish action to create a public event.",
          400,
        );
      }
      if (current.status === "published" && status !== "published") {
        throw new RequestError(
          "Use Withdraw to remove a public event before changing review status.",
          400,
        );
      }
      if (current.source_id !== sourceId) {
        throw new RequestError(
          "The displayed provenance source changed. Refresh before saving.",
          409,
        );
      }
      if (current.source_updated_at !== sourceUpdatedAt) {
        return noStoreJson(
          {
            ok: false,
            error: {
              code: "SOURCE_ITEM_STALE",
              message: "The source controls changed. Refresh before reviewing this candidate.",
            },
          },
          { status: 409 },
        );
      }
      if (current.source_status !== sourceStatus || current.source_trust !== sourceTrust) {
        throw new RequestError(
          "Save source-control changes separately before reviewing the candidate.",
          400,
        );
      }
      if (status === "approved" && sourceStatus !== "active") {
        throw new RequestError(
          "Set the explicitly reviewed source to Active before approval.",
          400,
        );
      }
      const previousFacts = {
        title: current.title,
        description: current.description,
        organiserName: current.organiser_name,
        venue: current.venue,
        town: current.town,
        postcode: current.postcode,
        countryCode: current.country_code,
        adminArea: current.admin_area,
        timezone: current.timezone,
        startDate: current.start_date,
        endDate: current.end_date,
        startTime: current.start_time,
        category: current.category,
        officialUrl: current.official_url,
        price: current.price,
        latitude: current.latitude,
        longitude: current.longitude,
      };
      const factKeys = Object.keys(previousFacts) as Array<keyof typeof previousFacts>;
      const changedFields: string[] = factKeys.filter(
        (field) => previousFacts[field] !== candidate[field],
      );
      const factsChanged = changedFields.length > 0;
      if (current.status !== status) changedFields.push("status");
      if (current.assigned_to !== assignedTo) changedFields.push("assignedTo");
      if (current.internal_notes !== internalNotes) changedFields.push("internalNotes");
      if (current.status === "published" && factsChanged && sourceStatus !== "active") {
        throw new RequestError(
          "Keep the reviewed source Active when applying facts to a live event.",
          400,
        );
      }
      if (current.status === "published" && sourceStatus === "active") {
        const liveUpdate = publicationFields({
          id,
          ...candidate,
          status: "approved",
          publishedEventId: current.published_event_id,
          reviewRequired: false,
        });
        if (!liveUpdate.ready || !current.published_event_id) {
          throw new RequestError(
            `The live update needs: ${liveUpdate.missing.join(", ") || "a linked public event"}.`,
            409,
          );
        }
      }
      const [previousSnapshotHash, nextSnapshotHash] = await Promise.all([
        sha256Hex(JSON.stringify(previousFacts)),
        sha256Hex(JSON.stringify(candidate)),
      ]);
      const auditId = `dca_${crypto.randomUUID()}`;
      const now = Math.floor(Date.now() / 1000);
      const nextUpdatedAt = new Date().toISOString();
      const nextReviewRequired =
        status === "published"
          ? sourceStatus === "active"
            ? 0
            : current.review_required
          : status === "approved" || status === "rejected"
            ? 0
            : 1;
      if (Boolean(current.review_required) !== Boolean(nextReviewRequired)) {
        changedFields.push("reviewRequired");
      }
      const nextPublication = publicationFields({
        id,
        ...candidate,
        status,
        publishedEventId: current.published_event_id,
        reviewRequired: Boolean(nextReviewRequired),
      });
      if (sourceStatus !== "active" && nextPublication.ready) {
        nextPublication.ready = false;
        nextPublication.missing.push("active reviewed source");
      }
      const liveVerificationLabel =
        sourceTrust === "organizer" || sourceTrust === "official"
          ? "organizer_verified"
          : sourceTrust === "partner"
            ? "partner_verified"
            : "source_checked";
      const [
        auditResult,
        liveEventResult,
        liveProvenanceResult,
        updateResult,
        ,
      ] = await db.batch([
        db
          .prepare(
            `INSERT INTO event_candidate_review_audit (
               id, candidate_id, admin_member_id, admin_email, action,
               previous_status, next_status, previous_review_required,
               next_review_required, note_changed, changed_fields,
               previous_snapshot_hash, next_snapshot_hash, source_id,
               assigned_to, created_at
             )
             SELECT ?, id, ?, ?, 'candidate_review_updated', status, ?,
               review_required, ?,
               CASE WHEN internal_notes = ? THEN 0 ELSE 1 END, ?, ?, ?, ?, ?, ?
             FROM event_candidates
             WHERE id = ? AND updated_at = ?
               AND (? != 'approved' OR ? = 'active')
               AND EXISTS (
                 SELECT 1 FROM event_sources
                 WHERE id = ? AND updated_at = ? AND status = ?
                   AND trust_level = ?
               )`,
          )
          .bind(
            auditId,
            user.memberId,
            user.authenticatedEmail.trim().toLowerCase(),
            status,
            nextReviewRequired,
            internalNotes,
            JSON.stringify(changedFields),
            previousSnapshotHash,
            nextSnapshotHash,
            current.source_id,
            assignedTo,
            now,
            id,
            expectedUpdatedAt,
            status,
            sourceStatus,
            current.source_id,
            sourceUpdatedAt,
            sourceStatus,
            sourceTrust,
          ),
        db
          .prepare(
            `UPDATE motoring_events
             SET title = ?, description = ?, venue = ?, town = ?, postcode = ?,
               country_code = ?, admin_area = ?, timezone = ?, start_date = ?,
               end_date = ?, start_time = ?, category = ?,
               latitude = ?, longitude = ?, official_url = ?,
               official_label = 'Official event page', price = ?, image = ?,
               updated_at = ?
             WHERE id = ? AND status = 'published' AND ? = 'published'
               AND ? = 'active'
               AND EXISTS (
                 SELECT 1 FROM event_candidates
                 WHERE id = ? AND updated_at = ? AND status = 'published'
                   AND published_event_id = ?
               )
               AND EXISTS (
                 SELECT 1 FROM event_sources
                 WHERE id = ? AND updated_at = ? AND status = ?
                   AND trust_level = ?
               )`,
          )
          .bind(
            candidate.title,
            candidate.description,
            candidate.venue,
            candidate.town,
            candidate.postcode,
            candidate.countryCode,
            candidate.adminArea,
            candidate.timezone,
            candidate.startDate,
            candidate.endDate,
            candidate.startTime,
            candidate.category,
            candidate.latitude,
            candidate.longitude,
            candidate.officialUrl,
            candidate.price,
            publicationFields({
              id,
              ...candidate,
              status: "approved",
              reviewRequired: false,
            }).image,
            nextUpdatedAt,
            current.published_event_id,
            status,
            sourceStatus,
            id,
            expectedUpdatedAt,
            current.published_event_id,
            current.source_id,
            sourceUpdatedAt,
            sourceStatus,
            sourceTrust,
          ),
        db
          .prepare(
            `UPDATE motoring_event_provenance
             SET candidate_id = ?, source_id = ?, source_url = ?,
               last_checked_at = ?, verification_label = ?, updated_at = ?
             WHERE event_id = ? AND is_primary = 1 AND ? = 'published'
               AND ? = 'active'
               AND EXISTS (
                 SELECT 1 FROM event_candidates
                 WHERE id = ? AND updated_at = ? AND status = 'published'
                   AND published_event_id = ?
               )
               AND EXISTS (
                 SELECT 1 FROM event_sources
                 WHERE id = ? AND updated_at = ? AND status = ?
                   AND trust_level = ?
               )`,
          )
          .bind(
            id,
            current.source_id,
            current.source_url,
            current.observed_at,
            liveVerificationLabel,
            nextUpdatedAt,
            current.published_event_id,
            status,
            sourceStatus,
            id,
            expectedUpdatedAt,
            current.published_event_id,
            current.source_id,
            sourceUpdatedAt,
            sourceStatus,
            sourceTrust,
          ),
        db
          .prepare(
            `UPDATE event_candidates
             SET title = ?, description = ?, organiser_name = ?, venue = ?,
               town = ?, postcode = ?, country_code = ?, admin_area = ?,
               timezone = ?, start_date = ?, end_date = ?, start_time = ?,
               category = ?, official_url = ?, price = ?,
               latitude = ?, longitude = ?, status = ?, review_required = ?,
               internal_notes = ?, assigned_to = ?, updated_at = ?
             WHERE id = ? AND updated_at = ?
               AND (? != 'approved' OR ? = 'active')
               AND EXISTS (
                 SELECT 1 FROM event_sources
                 WHERE id = ? AND updated_at = ? AND status = ?
                   AND trust_level = ?
               )`,
          )
          .bind(
            candidate.title,
            candidate.description,
            candidate.organiserName,
            candidate.venue,
            candidate.town,
            candidate.postcode,
            candidate.countryCode,
            candidate.adminArea,
            candidate.timezone,
            candidate.startDate,
            candidate.endDate,
            candidate.startTime,
            candidate.category,
            candidate.officialUrl,
            candidate.price,
            candidate.latitude,
            candidate.longitude,
            status,
            nextReviewRequired,
            internalNotes,
            assignedTo,
            nextUpdatedAt,
            id,
            expectedUpdatedAt,
            status,
            sourceStatus,
            current.source_id,
            sourceUpdatedAt,
            sourceStatus,
            sourceTrust,
          ),
        db
          .prepare(
            `UPDATE event_discovery_alerts
             SET status = 'resolved', updated_at = ?
             WHERE candidate_id = ? AND status = 'open'
               AND ? IN ('approved', 'rejected', 'published')
               AND EXISTS (
                 SELECT 1 FROM event_candidates
                 WHERE id = ? AND updated_at = ?
               )`,
          )
          .bind(now, id, status, id, nextUpdatedAt),
      ]);

      if (
        Number(auditResult.meta.changes ?? 0) !== 1 ||
        Number(updateResult.meta.changes ?? 0) !== 1 ||
        (status === "published" &&
          sourceStatus === "active" &&
          (Number(liveEventResult.meta.changes ?? 0) !== 1 ||
            Number(liveProvenanceResult.meta.changes ?? 0) !== 1))
      ) {
        const sourceVersion = await db
          .prepare(`SELECT updated_at FROM event_sources WHERE id = ? LIMIT 1`)
          .bind(current.source_id)
          .first<{ updated_at: string }>();
        if (!sourceVersion || sourceVersion.updated_at !== sourceUpdatedAt) {
          return noStoreJson(
            {
              ok: false,
              error: {
                code: "SOURCE_ITEM_STALE",
                message: "The source controls changed. Refresh before saving.",
              },
            },
            { status: 409 },
          );
        }
        const existing = await db
          .prepare(`SELECT updated_at FROM event_candidates WHERE id = ? LIMIT 1`)
          .bind(id)
          .first<{ updated_at: string }>();
        if (existing) {
          return noStoreJson(
            {
              ok: false,
              error: {
                code: "QUEUE_ITEM_STALE",
                message: "Another administrator updated this item. Refresh before saving.",
              },
            },
            { status: 409 },
          );
        }
        return noStoreJson(
          {
            ok: false,
            error: {
              code: "QUEUE_ITEM_NOT_FOUND",
              message: "That discovery candidate no longer exists.",
            },
          },
          { status: 404 },
        );
      }

      return noStoreJson({
        ok: true,
        data: {
          kind,
          id,
          status,
          internalNotes,
          assignedTo,
          updatedAt: nextUpdatedAt,
          reviewRequired: Boolean(nextReviewRequired),
          candidate,
          publication: nextPublication,
          sourceReview: {
            id: sourceId,
            updatedAt: sourceUpdatedAt,
            status: sourceStatus,
            trustLevel: sourceTrust,
          },
        },
      });
    }

    const table = tables[kind];
    const auditId = `aqa_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    const nextUpdatedAt = new Date().toISOString();
    const [auditResult, updateResult] = await db.batch([
      db
        .prepare(
          `INSERT INTO admin_queue_audit (
             id, admin_member_id, admin_email, queue_type, queue_item_id,
             action, previous_status, next_status, note_changed, assigned_to,
             created_at
           )
           SELECT ?, ?, ?, ?, id, 'queue_item_updated', status, ?,
             CASE WHEN internal_notes = ? THEN 0 ELSE 1 END, ?, ?
           FROM ${table} WHERE id = ? AND updated_at = ?`,
        )
        .bind(
          auditId,
          user.memberId,
          user.authenticatedEmail.trim().toLowerCase(),
          kind,
          status,
          internalNotes,
          assignedTo,
          now,
          id,
          expectedUpdatedAt,
        ),
      db
        .prepare(
          `UPDATE ${table}
           SET status = ?, internal_notes = ?, assigned_to = ?,
             updated_at = ?
           WHERE id = ? AND updated_at = ?`,
        )
        .bind(
          status,
          internalNotes,
          assignedTo,
          nextUpdatedAt,
          id,
          expectedUpdatedAt,
        ),
    ]);

    if (
      Number(auditResult.meta.changes ?? 0) !== 1 ||
      Number(updateResult.meta.changes ?? 0) !== 1
    ) {
      const existing = await db
        .prepare(`SELECT updated_at FROM ${table} WHERE id = ? LIMIT 1`)
        .bind(id)
        .first<{ updated_at: string }>();
      if (existing) {
        return noStoreJson(
          {
            ok: false,
            error: {
              code: "QUEUE_ITEM_STALE",
              message: "Another administrator updated this item. Refresh before saving.",
            },
          },
          { status: 409 },
        );
      }
      return noStoreJson(
        {
          ok: false,
          error: { code: "QUEUE_ITEM_NOT_FOUND", message: "That queue item no longer exists." },
        },
        { status: 404 },
      );
    }

    return noStoreJson({
      ok: true,
      data: {
        kind,
        id,
        status,
        internalNotes,
        assignedTo,
        updatedAt: nextUpdatedAt,
      },
    });
  } catch (error) {
    return adminError(error);
  }
}

import { ensureDatabase } from "@/lib/database";
import { scoreDuplicate, type DedupeCandidate } from "@/lib/discovery/dedupe";
import {
  discoveryIds,
  type NormalizedDiscoveryPayload,
  sha256Hex,
} from "@/lib/discovery-payload";
import { shortReference } from "@/lib/operations-queue";

type SourceRow = {
  id: string;
  source_key: string;
  name: string;
  source_type: string;
  canonical_url: string;
  permission_basis: string;
  status: string;
};

type ExistingObservation = {
  candidate_id: string;
  status: string;
  source_id: string;
  source_url: string;
  content_hash: string;
  event_payload: string;
};

type CandidateRow = {
  id: string;
  dedupe_key: string;
  title: string;
  venue: string;
  organiser_name: string;
  start_date: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  official_url: string;
  status: string;
};

type FactProvenanceRow = {
  source_id: string;
  confidence: number;
};

export class DiscoveryStoreError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryStoreError";
  }
}

function sameSource(row: SourceRow, source: NormalizedDiscoveryPayload["source"]) {
  return (
    row.source_key === source.key &&
    row.name === source.name &&
    row.source_type === source.type &&
    row.canonical_url === source.canonicalUrl &&
    row.permission_basis === source.permissionBasis
  );
}

function dateWindow(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dedupeInput(
  candidate: NormalizedDiscoveryPayload["candidate"],
): Omit<DedupeCandidate, "id"> {
  return {
    title: candidate.title,
    venue: candidate.venue,
    organiserName: candidate.organiserName,
    startDate: candidate.startDate,
    countryCode: candidate.countryCode,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    officialUrl: candidate.officialUrl,
  };
}

function storedDedupeCandidate(row: CandidateRow): DedupeCandidate {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    organiserName: row.organiser_name,
    startDate: row.start_date,
    countryCode: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    officialUrl: row.official_url,
  };
}

async function touchObservationFreshness(
  db: D1Database,
  candidateId: string,
  sourceId: string,
  observedAt: string,
) {
  await db.batch([
    db
      .prepare(`UPDATE event_candidates SET last_seen_at = ? WHERE id = ?`)
      .bind(observedAt, candidateId),
    db
      .prepare(
        `UPDATE event_sources SET last_seen_at = ?
         WHERE id = ? AND status NOT IN ('paused', 'revoked')`,
      )
      .bind(observedAt, sourceId),
  ]);
}

export async function storeDiscoveryObservation(
  payload: NormalizedDiscoveryPayload,
  metadata: {
    parserVersion?: string;
    confidenceBreakdown?: Record<string, unknown>;
  } = {},
) {
  const ids = await discoveryIds(payload);
  const db = await ensureDatabase();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT OR IGNORE INTO event_sources (
         id, source_key, name, source_type, canonical_url, permission_basis,
         status, trust_level, last_seen_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unverified', ?, ?, ?)`,
    )
    .bind(
      ids.sourceId,
      payload.source.key,
      payload.source.name,
      payload.source.type,
      payload.source.canonicalUrl,
      payload.source.permissionBasis,
      now,
      now,
      now,
    )
    .run();

  const source = await db
    .prepare(
      `SELECT id, source_key, name, source_type, canonical_url,
        permission_basis, status
       FROM event_sources WHERE source_key = ? LIMIT 1`,
    )
    .bind(payload.source.key)
    .first<SourceRow>();
  if (!source || !sameSource(source, payload.source)) {
    throw new DiscoveryStoreError(
      "DISCOVERY_SOURCE_CONFLICT",
      409,
      "The source identity conflicts with its registered details.",
    );
  }
  if (source.status === "paused" || source.status === "revoked") {
    throw new DiscoveryStoreError(
      "DISCOVERY_SOURCE_DISABLED",
      409,
      "This source is not accepting discovery observations.",
    );
  }

  const existingObservation = await db
    .prepare(
      `SELECT provenance.candidate_id, candidates.status,
        provenance.source_id, provenance.source_url, provenance.content_hash,
        provenance.event_payload
       FROM event_candidate_provenance provenance
       JOIN event_candidates candidates ON candidates.id = provenance.candidate_id
       WHERE provenance.idempotency_hash = ? LIMIT 1`,
    )
    .bind(ids.idempotencyHash)
    .first<ExistingObservation>();
  if (existingObservation) {
    if (
      existingObservation.source_id !== source.id ||
      existingObservation.source_url !== payload.provenance.sourceUrl ||
      existingObservation.content_hash !== payload.provenance.contentHash ||
      existingObservation.event_payload !== JSON.stringify(payload.candidate)
    ) {
      throw new DiscoveryStoreError(
        "DISCOVERY_IDEMPOTENCY_CONFLICT",
        409,
        "That idempotency key was already used for different content.",
      );
    }
    await touchObservationFreshness(
      db,
      existingObservation.candidate_id,
      source.id,
      now,
    );
    return {
      candidateId: existingObservation.candidate_id,
      reference: shortReference("discovery", existingObservation.candidate_id),
      status: existingObservation.status,
      idempotent: true,
      deduplicated: true,
    };
  }

  let target = await db
    .prepare(`SELECT * FROM event_candidates WHERE dedupe_key = ? LIMIT 1`)
    .bind(ids.dedupeKey)
    .first<CandidateRow>();

  if (!target && payload.provenance.externalId) {
    target = await db
      .prepare(
        `SELECT candidates.* FROM event_candidate_provenance provenance
         JOIN event_candidates candidates ON candidates.id = provenance.candidate_id
         WHERE provenance.source_id = ? AND provenance.external_id = ?
         ORDER BY provenance.observed_at DESC LIMIT 1`,
      )
      .bind(source.id, payload.provenance.externalId)
      .first<CandidateRow>();
  }

  let fuzzyMatch: ReturnType<typeof scoreDuplicate> = null;
  if (!target) {
    const plausible = await db
      .prepare(
        `SELECT id, dedupe_key, title, venue, organiser_name, start_date,
          country_code, latitude, longitude, official_url, status
         FROM event_candidates
         WHERE country_code = ? AND start_date BETWEEN ? AND ?
           AND status != 'rejected'
         ORDER BY last_seen_at DESC LIMIT 500`,
      )
      .bind(
        payload.candidate.countryCode,
        dateWindow(payload.candidate.startDate, -3),
        dateWindow(payload.candidate.startDate, 3),
      )
      .all<CandidateRow>();
    fuzzyMatch = scoreDuplicate(
      dedupeInput(payload.candidate),
      plausible.results.map(storedDedupeCandidate),
    );
    if (fuzzyMatch?.decision === "merge") {
      target = plausible.results.find((row) => row.id === fuzzyMatch?.candidateId) ?? null;
    }
  }

  const candidateId = target?.id ?? ids.candidateId;
  const dedupeKey = target?.dedupe_key ?? ids.dedupeKey;
  const candidate = payload.candidate;
  const provenanceId = `prv_${(await sha256Hex(`${ids.idempotencyHash}:${candidateId}`)).slice(0, 32)}`;
  const eventPayload = JSON.stringify(candidate);
  const priorFacts = target
    ? await db
        .prepare(
          `SELECT source_id, confidence
           FROM event_candidate_provenance
           WHERE candidate_id = ?
           ORDER BY confidence DESC, observed_at DESC, created_at DESC LIMIT 1`,
        )
        .bind(candidateId)
        .first<FactProvenanceRow>()
    : null;
  const updateFacts =
    !target ||
    (target.status === "pending" &&
      (!priorFacts ||
        payload.provenance.confidence >= priorFacts.confidence));

  const sameObservation = await db
    .prepare(
      `SELECT candidate_id, event_payload
       FROM event_candidate_provenance
       WHERE source_id = ? AND candidate_id = ? AND source_url = ?
         AND content_hash = ? LIMIT 1`,
    )
    .bind(
      source.id,
      candidateId,
      payload.provenance.sourceUrl,
      payload.provenance.contentHash,
    )
    .first<{ candidate_id: string; event_payload: string }>();
  if (sameObservation) {
    if (sameObservation.event_payload !== eventPayload) {
      throw new DiscoveryStoreError(
        "DISCOVERY_CONTENT_HASH_CONFLICT",
        409,
        "The declared content hash was already used for different normalized facts.",
      );
    }
    await touchObservationFreshness(
      db,
      sameObservation.candidate_id,
      source.id,
      now,
    );
    return {
      candidateId: sameObservation.candidate_id,
      reference: shortReference("discovery", sameObservation.candidate_id),
      status: target?.status ?? "pending",
      idempotent: true,
      deduplicated: true,
    };
  }

  const statements: D1PreparedStatement[] = [];
  if (!target) {
    statements.push(
      db
        .prepare(
          `INSERT INTO event_candidates (
             id, dedupe_key, title, description, organiser_name, venue, town,
             postcode, country_code, admin_area, timezone, start_date, end_date,
             start_time, category, official_url, price, latitude, longitude,
             status, review_required, first_seen_at, last_seen_at, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             'pending', 1, ?, ?, ?, ?)`,
        )
        .bind(
          candidateId,
          dedupeKey,
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
          now,
          now,
          now,
          now,
        ),
    );
  } else if (updateFacts) {
    statements.push(
      db
        .prepare(
          `UPDATE event_candidates SET
             title = ?, description = ?, organiser_name = ?, venue = ?, town = ?,
             postcode = ?, country_code = ?, admin_area = ?, timezone = ?,
             start_date = ?, end_date = ?, start_time = ?, category = ?,
             official_url = ?, price = ?, latitude = ?, longitude = ?,
             review_required = 1, last_seen_at = ?, updated_at = ?
           WHERE id = ? AND status = 'pending'`,
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
          now,
          now,
          candidateId,
        ),
    );
  } else {
    statements.push(
      db
        .prepare(
          `UPDATE event_candidates
           SET last_seen_at = ?
           WHERE id = ?`,
        )
        .bind(now, candidateId),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO event_candidate_provenance (
           id, candidate_id, source_id, idempotency_hash, external_id,
           source_url, content_hash, discovery_method, confidence,
           parser_version, confidence_breakdown, observed_fields, event_payload,
           observed_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        provenanceId,
        candidateId,
        source.id,
        ids.idempotencyHash,
        payload.provenance.externalId,
        payload.provenance.sourceUrl,
        payload.provenance.contentHash,
        payload.provenance.method,
        payload.provenance.confidence,
        metadata.parserVersion ?? "intake-v2",
        JSON.stringify(metadata.confidenceBreakdown ?? {}),
        JSON.stringify(payload.provenance.observedFields),
        eventPayload,
        payload.provenance.observedAt,
        now,
      ),
    db
      .prepare(
        `UPDATE event_sources SET last_seen_at = ?
         WHERE id = ? AND status NOT IN ('paused', 'revoked')`,
      )
      .bind(now, source.id),
  );

  if (!target && fuzzyMatch?.decision === "review") {
    const matchId = `ecm_${(
      await sha256Hex(`${candidateId}:${fuzzyMatch.candidateId}`)
    ).slice(0, 32)}`;
    statements.push(
      db
        .prepare(
          `INSERT INTO event_candidate_matches (
             id, candidate_id, matched_candidate_id, score, component_scores,
             resolution, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
           ON CONFLICT(candidate_id, matched_candidate_id) DO UPDATE SET
             score = excluded.score,
             component_scores = excluded.component_scores,
             updated_at = excluded.updated_at`,
        )
        .bind(
          matchId,
          candidateId,
          fuzzyMatch.candidateId,
          fuzzyMatch.score,
          JSON.stringify(fuzzyMatch.components),
          now,
          now,
        ),
    );
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const racedObservation = await db
      .prepare(
        `SELECT candidate_id, event_payload
         FROM event_candidate_provenance
         WHERE source_id = ? AND candidate_id = ? AND source_url = ?
           AND content_hash = ? LIMIT 1`,
      )
      .bind(
        source.id,
        candidateId,
        payload.provenance.sourceUrl,
        payload.provenance.contentHash,
      )
      .first<{ candidate_id: string; event_payload: string }>();
    if (!racedObservation) throw error;
    if (racedObservation.event_payload !== eventPayload) {
      throw new DiscoveryStoreError(
        "DISCOVERY_CONTENT_HASH_CONFLICT",
        409,
        "The declared content hash was already used for different normalized facts.",
      );
    }
    await touchObservationFreshness(
      db,
      racedObservation.candidate_id,
      source.id,
      now,
    );
    return {
      candidateId: racedObservation.candidate_id,
      reference: shortReference("discovery", racedObservation.candidate_id),
      status: target?.status ?? "pending",
      idempotent: true,
      deduplicated: true,
    };
  }
  return {
    candidateId,
    reference: shortReference("discovery", candidateId),
    status: target?.status ?? "pending",
    idempotent: false,
    deduplicated: Boolean(target),
    fuzzyScore: fuzzyMatch?.score ?? null,
    fuzzyDecision: fuzzyMatch?.decision ?? null,
  };
}

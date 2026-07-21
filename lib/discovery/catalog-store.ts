import { ensureDatabase } from "@/lib/database";
import { EUROPE_COUNTRIES } from "@/lib/discovery/geography";
import { sha256Hex } from "@/lib/discovery-payload";
import {
  DISCOVERY_SOURCE_CATALOG,
  DISCOVERY_SOURCE_CATALOG_VERSION,
  SYSTEM_DISCOVERY_ENDPOINTS,
  type CatalogSource,
} from "@/lib/discovery/source-catalog";

export async function sourceIdForKey(key: string) {
  return `src_${(await sha256Hex(`source:v1:${key}`)).slice(0, 32)}`;
}

function endpointId(key: string) {
  return `dse_${key}`;
}

async function catalogSourceStatements(
  db: D1Database,
  source: CatalogSource,
  system: boolean,
) {
  const sourceId = await sourceIdForKey(source.key);
  const now = new Date().toISOString();
  const sourceType = source.adapter === "eventbrite"
    ? "partner_api"
    : source.adapter === "firecrawl_search"
      ? "licensed_search"
      : source.adapter === "ical"
        ? "calendar"
        : "structured_data";
  return [
    db
      .prepare(
        `INSERT INTO event_sources (
           id, source_key, name, source_type, canonical_url, permission_basis,
           status, trust_level, last_seen_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ${system
           ? `ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                source_type = excluded.source_type,
                canonical_url = excluded.canonical_url,
                updated_at = excluded.updated_at`
           : "ON CONFLICT(id) DO NOTHING"}`,
      )
      .bind(
        sourceId,
        source.key,
        source.name,
        sourceType,
        source.url,
        system ? "platform_api" : "manual_review",
        system ? "active" : "pending",
        system ? "partner" : "unverified",
        now,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO event_source_endpoints (
           id, source_id, adapter, endpoint_url, status, schedule_hours,
           country_code, locale, timezone, max_pages, max_records, cursor,
           next_run_at, lease_until, failure_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?, 20, 25, ?, 0, 0, 0, ?, ?)
         ${system
           ? `ON CONFLICT(id) DO UPDATE SET
                adapter = excluded.adapter,
                endpoint_url = excluded.endpoint_url,
                schedule_hours = excluded.schedule_hours,
                country_code = excluded.country_code,
                locale = excluded.locale,
                timezone = excluded.timezone,
                max_pages = excluded.max_pages,
                max_records = excluded.max_records,
                lease_until = 0,
                updated_at = excluded.updated_at`
           : "ON CONFLICT(id) DO NOTHING"}`,
      )
      .bind(
        endpointId(source.key),
        sourceId,
        source.adapter ?? "firecrawl_map",
        source.url,
        source.scheduleHours ?? 24,
        source.countryCode,
        source.locale ?? (source.countryCode === "GB"
          ? "en-GB"
          : EUROPE_COUNTRIES.find((area) => area.countryCode === source.countryCode)?.locale ?? "en"),
        source.timezone,
        source.cursor ?? 0,
        now,
        now,
      ),
  ];
}

export async function ensureDiscoveryCatalog() {
  const db = await ensureDatabase();
  const installed = await db
    .prepare(
      `SELECT version FROM discovery_catalog_state
       WHERE catalog_key = 'classicsgo-sources' LIMIT 1`,
    )
    .first<{ version: number }>();
  if (installed?.version === DISCOVERY_SOURCE_CATALOG_VERSION) return;

  const groups = await Promise.all([
    ...SYSTEM_DISCOVERY_ENDPOINTS.map((source) =>
      catalogSourceStatements(db, source, true),
    ),
    ...DISCOVERY_SOURCE_CATALOG.map((source) =>
      catalogSourceStatements(db, source, false),
    ),
  ]);
  const statements = groups.flat();
  for (let offset = 0; offset < statements.length; offset += 40) {
    await db.batch(statements.slice(offset, offset + 40));
  }
  if (!installed || installed.version < 2) {
    await db.batch([
      db.prepare(
        `UPDATE event_source_endpoints SET status = 'retired', lease_until = 0,
           updated_at = CURRENT_TIMESTAMP
         WHERE source_id IN (
           SELECT id FROM event_sources
           WHERE source_key = 'firecrawl_search'
         )`,
      ),
      db.prepare(
        `UPDATE event_sources SET status = 'paused', updated_at = CURRENT_TIMESTAMP
         WHERE source_key = 'firecrawl_search'`,
      ),
    ]);
  }
  const now = Math.floor(Date.now() / 1_000);
  await db
    .prepare(
      `INSERT INTO discovery_catalog_state (
         catalog_key, version, installed_at, updated_at
       ) VALUES ('classicsgo-sources', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(catalog_key) DO UPDATE SET
         version = excluded.version,
         installed_at = excluded.installed_at,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(DISCOVERY_SOURCE_CATALOG_VERSION, now)
    .run();
}

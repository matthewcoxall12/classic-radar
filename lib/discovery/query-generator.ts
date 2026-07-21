import { DISCOVERY_AREAS } from "@/lib/discovery/geography";
import { getRuntimeEnv } from "@/lib/runtime-env";

export type DiscoveryQuery = {
  key: string;
  query: string;
  countryCode: string;
  locale: string;
  timezone: string;
  area: string;
};

function normalizedIndex(index: number, count: number) {
  return ((index % count) + count) % count;
}

function webQueryAt(index: number): DiscoveryQuery {
  const area = DISCOVERY_AREAS[normalizedIndex(index, DISCOVERY_AREAS.length)];
  const localized = area.searchTerms?.slice(0, 3).map((term) => `"${term}"`) ?? [];
  const concepts = [
    '"classic car"',
    '"historic vehicle"',
    "autojumble",
    ...localized,
  ].join(" OR ");
  return {
    key: `web:${area.key}`,
    query: `(${concepts}) (show OR meet OR rally OR calendar OR event) "${area.label}"`,
    countryCode: area.countryCode,
    locale: area.locale,
    timezone: area.timezone,
    area: area.label,
  };
}

export function discoveryQueryCount() {
  return DISCOVERY_AREAS.length;
}

export function discoveryQueryAt(
  index: number,
): DiscoveryQuery {
  return webQueryAt(index);
}

export function generateDiscoveryQueries(
  cursor: number,
  limit: number,
) {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  return Array.from({ length: boundedLimit }, (_, offset) =>
    discoveryQueryAt(cursor + offset),
  );
}

export function discoveryQueryBatchSize() {
  const raw = getRuntimeEnv()?.DISCOVERY_QUERY_BATCH_SIZE;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) ? Math.max(1, Math.min(4, parsed)) : 3;
}

export function discoveryQueryStride(endpointUrl: string, batchSize: number) {
  try {
    const shards = Number.parseInt(new URL(endpointUrl).searchParams.get("shards") ?? "1", 10);
    return Math.max(1, Math.min(32, Number.isInteger(shards) ? shards : 1)) * batchSize;
  } catch {
    return batchSize;
  }
}

export function generateShardedDiscoveryQueries(
  endpointUrl: string,
  cursor: number,
  limit: number,
) {
  let shards = 1;
  try {
    const parsed = Number.parseInt(new URL(endpointUrl).searchParams.get("shards") ?? "1", 10);
    shards = Math.max(1, Math.min(32, Number.isInteger(parsed) ? parsed : 1));
  } catch {
    // The provider validates its endpoint before any network request.
  }
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  return Array.from({ length: boundedLimit }, (_, offset) =>
    discoveryQueryAt(cursor + offset * shards),
  );
}

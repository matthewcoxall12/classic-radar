import Fuse from "fuse.js";
import { getDistance } from "geolib";

export type DedupeCandidate = {
  id: string;
  title: string;
  venue: string;
  organiserName: string;
  startDate: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  officialUrl: string;
};

export type DedupeScore = {
  candidateId: string;
  score: number;
  decision: "merge" | "review" | "distinct";
  components: {
    title: number;
    date: number;
    distance: number;
    venueOrganiser: number;
    geography: number;
    exactUrl: boolean;
  };
};

function normalized(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function dayDifference(left: string, right: string) {
  return Math.abs(
    new Date(`${left}T00:00:00Z`).getTime() -
      new Date(`${right}T00:00:00Z`).getTime(),
  ) / 86_400_000;
}

function wordOverlap(left: string, right: string) {
  const first = new Set(normalized(left).split(" ").filter(Boolean));
  const second = new Set(normalized(right).split(" ").filter(Boolean));
  if (!first.size || !second.size) return 0;
  const overlap = [...first].filter((word) => second.has(word)).length;
  return overlap / Math.max(first.size, second.size);
}

export function scoreDuplicate(
  incoming: Omit<DedupeCandidate, "id">,
  existing: DedupeCandidate[],
): DedupeScore | null {
  if (!existing.length) return null;
  const exactUrl = existing.find(
    (item) =>
      item.officialUrl === incoming.officialUrl &&
      item.startDate === incoming.startDate &&
      (normalized(item.title) === normalized(incoming.title) ||
        wordOverlap(item.title, incoming.title) >= 0.55 ||
        wordOverlap(item.venue, incoming.venue) >= 0.7),
  );
  if (exactUrl) {
    return {
      candidateId: exactUrl.id,
      score: 100,
      decision: "merge",
      components: {
        title: 40,
        date: 25,
        distance: 20,
        venueOrganiser: 10,
        geography: 5,
        exactUrl: true,
      },
    };
  }

  const fuse = new Fuse(existing, {
    keys: ["title"],
    includeScore: true,
    ignoreLocation: true,
    threshold: 1,
  });
  const titleScores = new Map(
    fuse.search(incoming.title).map((result) => [result.item.id, 1 - (result.score ?? 1)]),
  );
  let best: DedupeScore | null = null;
  for (const item of existing) {
    const title = Math.round((titleScores.get(item.id) ?? 0) * 40);
    const days = dayDifference(incoming.startDate, item.startDate);
    const date = days === 0 ? 25 : days <= 1 ? 18 : days <= 3 ? 8 : 0;
    let distance = 0;
    if (
      incoming.latitude != null && incoming.longitude != null &&
      item.latitude != null && item.longitude != null
    ) {
      const metres = getDistance(
        { latitude: incoming.latitude, longitude: incoming.longitude },
        { latitude: item.latitude, longitude: item.longitude },
        10,
      );
      distance = metres <= 500 ? 20 : metres <= 2_000 ? 15 : metres <= 10_000 ? 5 : 0;
    }
    const venueOrganiser = Math.round(
      Math.max(
        wordOverlap(incoming.venue, item.venue),
        wordOverlap(incoming.organiserName, item.organiserName),
      ) * 10,
    );
    const geography = incoming.countryCode === item.countryCode ? 5 : 0;
    const score = title + date + distance + venueOrganiser + geography;
    const result: DedupeScore = {
      candidateId: item.id,
      score,
      decision: score >= 86 ? "merge" : score >= 65 ? "review" : "distinct",
      components: { title, date, distance, venueOrganiser, geography, exactUrl: false },
    };
    if (!best || result.score > best.score) best = result;
  }
  return best;
}

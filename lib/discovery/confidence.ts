import type { DiscoveryMethod } from "@/lib/discovery-payload";
import type { RawEventFinding } from "@/lib/discovery/types";

const methodBase: Record<DiscoveryMethod, number> = {
  organizer_feed: 94,
  partner_api: 92,
  ical: 92,
  json_ld: 90,
  rss: 78,
  social_api: 78,
  licensed_search: 62,
  firecrawl: 62,
  eventbrite: 92,
  microdata: 80,
  opengraph: 52,
  manual_import: 100,
};

export function scoreExtractionConfidence(finding: RawEventFinding) {
  let score = finding.rawConfidence ?? methodBase[finding.method];
  const breakdown: Record<string, number | string | boolean> = {
    method: finding.method,
    methodBase: score,
  };
  if (finding.startDate) {
    score += 2;
    breakdown.date = 2;
  } else {
    score -= 20;
    breakdown.missingDate = -20;
  }
  if (finding.venue && finding.town) {
    score += 2;
    breakdown.location = 2;
  } else {
    score -= 14;
    breakdown.incompleteLocation = -14;
  }
  if (finding.latitude != null && finding.longitude != null) {
    score += 2;
    breakdown.coordinates = 2;
  }
  if (finding.officialUrl && finding.officialUrl === finding.sourceUrl) {
    score += 2;
    breakdown.canonicalSource = 2;
  }
  if (!finding.description || finding.description.length < 20) {
    score -= 5;
    breakdown.thinDescription = -5;
  }
  if (finding.method === "opengraph" && !finding.startDate) {
    score = Math.min(score, 45);
    breakdown.lowConfidenceCap = 45;
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    breakdown,
  };
}

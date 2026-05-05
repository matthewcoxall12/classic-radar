import type { NormalisedEvent } from "./event-extractor.ts";
import type { SourceClassification } from "./source-weights.ts";

export type ConfidenceResult = {
  score: number;
  reasons: string[];
  canAutoPublish: boolean;
};

export function scoreCandidate(
  candidate: NormalisedEvent & { sourceUrl?: string; sourceTitle?: string; sourceCount?: number; rawText?: string },
  sourceClassification: SourceClassification
): ConfidenceResult {
  let score = sourceClassification.baseWeight / 2;
  const reasons = [`Base source weight ${sourceClassification.baseWeight}.`];
  const rawText = [candidate.title, candidate.description, candidate.rawText].filter(Boolean).join(" ");

  if (candidate.start_date) {
    score += 25;
    reasons.push("Exact start date present.");
  } else {
    score -= 35;
    reasons.push("Date missing.");
  }
  if (candidate.venue_name || candidate.town) {
    score += 15;
    reasons.push("Venue or town present.");
  } else {
    score -= 30;
    reasons.push("Location missing.");
  }
  if (candidate.postcode) score += 15;
  if (candidate.booking_url) score += 10;
  if (candidate.event_type && candidate.event_type !== "Classic car show") score += 10;
  if ((candidate.sourceCount ?? 1) > 1) score += 10;
  if (candidate.sourceTitle && candidate.title && candidate.sourceTitle.toLowerCase().includes(candidate.title.toLowerCase().slice(0, 12))) score += 5;
  if (candidate.image_url) score += 3;
  if (/soon|tbc|date to be announced|to be confirmed/i.test(rawText)) score -= 20;
  if (/2020|2021|2022|2023|2024|2025|archive|past event/i.test(rawText)) score -= 50;
  if (/track day|new car|dealership|motorsport championship|formula|lease/i.test(rawText)) score -= 30;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    reasons,
    canAutoPublish: score >= 75 && Boolean(candidate.start_date && (candidate.town || candidate.venue_name || candidate.postcode) && candidate.sourceUrl)
  };
}

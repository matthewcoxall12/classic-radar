export function isCalendarDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function normaliseClockTime(value: string): string | null {
  const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

export function agentRunStatus(failed: boolean, errorCount: number): "failed" | "partial" | "completed" {
  if (failed) return "failed";
  return errorCount > 0 ? "partial" : "completed";
}

const EVENT_TYPES = new Set([
  "Classic car show",
  "Cars & coffee",
  "Club meet",
  "Autojumble",
  "Rally / road run",
  "Motorsport",
  "Museum / venue event",
  "American / hot rod",
  "Vintage / pre-war",
  "Marque-specific"
]);

export function normaliseEventType(value: unknown): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (EVENT_TYPES.has(raw)) return raw;
  if (/autojumble|auto\s+jumble|swap\s+meet/i.test(raw)) return "Autojumble";
  if (/cars?\s*(?:and|&)\s*coffee|coffee|breakfast/i.test(raw)) return "Cars & coffee";
  if (/american|hot\s*rod|street\s*rod|muscle\s+car|custom\s+car/i.test(raw)) return "American / hot rod";
  if (/pre[ -]?war|vintage|veteran|edwardian/i.test(raw)) return "Vintage / pre-war";
  if (/rallycross|race|racing|hill.?climb|motorsport|track\s*day|circuit|sprint|festival\s+of\s+speed/i.test(raw)) return "Motorsport";
  if (/road\s+run|road\s+tour|touring|scenic\s+drive|drive\s*out|\brally\b|^run$/i.test(raw)) return "Rally / road run";
  if (/museum|heritage\s+cent(?:re|er)|venue\s+event|open\s+day/i.test(raw)) return "Museum / venue event";
  if (/marque|\b(?:austin|alfa\s+romeo|aston\s+martin|audi|bentley|bmw|citro[eë]n|ferrari|fiat|ford|jaguar|land\s+rover|lotus|mercedes|mg|mini|morgan|morris|peugeot|porsche|renault|rolls[ -]royce|saab|triumph|volkswagen|volvo)\b/i.test(raw)) return "Marque-specific";
  if (/club\s+meet|owners?\s+club|register|gathering|\bmeet\b/i.test(raw)) return "Club meet";
  return "Classic car show";
}

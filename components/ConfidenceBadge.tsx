export function ConfidenceBadge({ score }: { score: number }) {
  const label = score >= 85 ? "High confidence" : score >= 75 ? "Good confidence" : score >= 60 ? "Needs checking" : "Low confidence";
  const style =
    score >= 85
      ? "bg-racing text-paper"
      : score >= 75
        ? "bg-moss text-paper"
        : score >= 60
          ? "bg-brass text-ink"
          : "bg-oxblood text-paper";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${style}`}>{label}</span>;
}

import { cn } from "@/lib/utils";

const typeStyles: Record<string, string> = {
  "Classic car show": "bg-racing/10 text-racing",
  "Cars & coffee": "bg-brass/15 text-[#704c15]",
  "Club meet": "bg-moss/15 text-racing",
  Autojumble: "bg-oxblood/10 text-oxblood",
  "Rally / road run": "bg-ink/10 text-ink",
  Motorsport: "bg-cobalt/10 text-cobalt",
  "Museum / venue event": "bg-[#d7e8de] text-racing",
  "American / hot rod": "bg-oxblood/12 text-oxblood",
  "Vintage / pre-war": "bg-brass/15 text-[#704c15]",
  "Marque-specific": "bg-[#dce8f0] text-ink",
  "Austin / Mini / marque-specific": "bg-[#dce8f0] text-ink"
};

export function EventTypeBadge({ type, className }: { type: string; className?: string }) {
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-bold", typeStyles[type] ?? "bg-ink/10 text-ink", className)}>{type}</span>;
}

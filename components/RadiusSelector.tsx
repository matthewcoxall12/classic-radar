const radii = [
  { label: "10", value: "10" },
  { label: "25", value: "25" },
  { label: "50", value: "50" },
  { label: "100", value: "100" },
  { label: "200", value: "200" },
  { label: "UK-wide", value: "uk" }
];

export function RadiusSelector({ defaultValue = "50" }: { defaultValue?: string }) {
  return (
    <select name="radius" defaultValue={defaultValue} className="focus-ring min-h-12 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm font-bold text-ink">
      {radii.map((radius) => (
        <option key={radius.value} value={radius.value}>
          {radius.label === "UK-wide" ? radius.label : `${radius.label} miles`}
        </option>
      ))}
    </select>
  );
}

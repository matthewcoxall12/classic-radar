import { upsertSourceRegistryEntry } from "@/app/admin/settings/actions";
import type { SourceRegistryEntry } from "@/lib/types";

const sourceTypes = [
  "aggregator",
  "club",
  "museum",
  "motorsport",
  "organiser",
  "council",
  "marketplace",
  "social",
  "federation"
];

const formats = ["html"];

export function SourceRegistryManager({ entries }: { entries: SourceRegistryEntry[] }) {
  return (
    <div className="grid gap-5">
      <form action={upsertSourceRegistryEntry} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
        <h2 className="text-xl font-black">Add source domain</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_130px]">
          <label className="grid gap-1 text-sm font-bold">Source name<input name="source_name" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
          <label className="grid gap-1 text-sm font-bold">Type<select name="source_type" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3">{sourceTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-bold">Weight<input name="priority_weight" type="number" min="0" max="100" defaultValue="50" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_150px_150px]">
          <label className="grid gap-1 text-sm font-bold">Start URL<input name="start_url" type="url" required className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
          <label className="grid gap-1 text-sm font-bold">Format<select name="format_hint" defaultValue="html" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3">{formats.map((format) => <option key={format}>{format}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-bold">Frequency<select name="crawl_frequency" defaultValue="daily" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3"><option>six_hourly</option><option>daily</option><option>weekly</option></select></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
          <label className="grid gap-1 text-sm font-bold">Country code<input name="country_code" defaultValue="GB" maxLength={2} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3 uppercase" /></label>
          <label className="grid gap-1 text-sm font-bold">Region (optional)<input name="region" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
        </div>
        <label className="grid gap-1 text-sm font-bold">Notes<textarea name="notes" rows={2} className="focus-ring rounded-md border border-ink/15 bg-paper px-3 py-2" /></label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-bold"><input name="is_active" type="checkbox" defaultChecked /> Active</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input name="requires_review" type="checkbox" /> Requires review</label>
        </div>
        <button className="focus-ring w-fit rounded-md bg-racing px-4 py-2 text-sm font-black text-paper">Save source</button>
      </form>
      <div className="overflow-hidden rounded-lg border border-ink/10 bg-paper shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-cream text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Weight</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Last checked</th>
                <th className="px-4 py-3">Last error</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 font-black">{entry.domain}<div className="text-xs font-semibold text-muted">{entry.source_name}</div><a href={entry.start_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-racing">Open source</a></td>
                  <td className="px-4 py-3">{entry.source_type}</td>
                  <td className="px-4 py-3 font-black">{entry.priority_weight}</td>
                  <td className="px-4 py-3">{entry.is_active ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-muted">{entry.last_checked_at ? new Date(entry.last_checked_at).toLocaleString("en-GB") : "Never"}</td>
                  <td className="px-4 py-3 text-oxblood">{entry.last_error}</td>
                  <td className="px-4 py-3 text-muted">{entry.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-3">
        <h2 className="text-xl font-black">Edit source weights</h2>
        {entries.map((entry) => (
          <form key={entry.id} action={upsertSourceRegistryEntry} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
            <input type="hidden" name="id" value={entry.id} />
            <input type="hidden" name="source_key" value={entry.source_key} />
            <div className="grid gap-3 md:grid-cols-[1fr_180px_130px]">
              <label className="grid gap-1 text-sm font-bold">Source name<input name="source_name" defaultValue={entry.source_name ?? ""} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
              <label className="grid gap-1 text-sm font-bold">Type<select name="source_type" defaultValue={entry.source_type ?? "unknown"} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3">{sourceTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-bold">Weight<input name="priority_weight" type="number" min="0" max="100" defaultValue={entry.priority_weight} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_150px_150px]">
              <label className="grid gap-1 text-sm font-bold">Start URL<input name="start_url" type="url" defaultValue={entry.start_url} required className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
              <label className="grid gap-1 text-sm font-bold">Format<select name="format_hint" defaultValue={entry.format_hint ?? "html"} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3">{formats.map((format) => <option key={format}>{format}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-bold">Frequency<select name="crawl_frequency" defaultValue={entry.crawl_frequency ?? "daily"} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3"><option>six_hourly</option><option>daily</option><option>weekly</option></select></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
              <label className="grid gap-1 text-sm font-bold">Country code<input name="country_code" defaultValue={entry.country_code ?? "GB"} maxLength={2} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3 uppercase" /></label>
              <label className="grid gap-1 text-sm font-bold">Region (optional)<input name="region" defaultValue={entry.region ?? ""} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
            </div>
            <label className="grid gap-1 text-sm font-bold">Notes<textarea name="notes" rows={2} defaultValue={entry.notes ?? ""} className="focus-ring rounded-md border border-ink/15 bg-paper px-3 py-2" /></label>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-bold"><input name="is_active" type="checkbox" defaultChecked={entry.is_active} /> Active</label>
                <label className="flex items-center gap-2 text-sm font-bold"><input name="requires_review" type="checkbox" defaultChecked={Boolean(entry.requires_review)} /> Requires review</label>
              </div>
              <button className="focus-ring rounded-md bg-racing px-4 py-2 text-sm font-black text-paper">Update source</button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}

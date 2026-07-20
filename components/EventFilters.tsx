import { Search } from "lucide-react";
import { LocationSearch } from "@/components/LocationSearch";
import { RadiusSelector } from "@/components/RadiusSelector";
import { eventTypes } from "@/lib/events";

export function EventFilters({
  searchParams
}: {
  searchParams: { q?: string; location?: string; lat?: string; lng?: string; radius?: string; date?: string; types?: string | string[] };
}) {
  const selectedTypes = Array.isArray(searchParams.types) ? searchParams.types : searchParams.types ? [searchParams.types] : [];
  return (
    <form action="/events" className="rounded-xl border border-ink/10 bg-paper/95 p-4 shadow-soft backdrop-blur md:p-5">
      <div className="grid gap-4">
        <label className="block">
          <span className="mb-1 block font-condensed text-xs font-black uppercase tracking-wider text-muted">Event or organiser</span>
          <input name="q" maxLength={120} defaultValue={searchParams.q ?? ""} aria-label="Search by show, meet, venue or club" className="focus-ring min-h-12 w-full rounded-md border border-ink/15 bg-paper px-3 text-base font-semibold" />
        </label>
        <div className="min-w-0">
          <span className="mb-1 block font-condensed text-xs font-black uppercase tracking-wider text-muted">Town, city or postcode</span>
          <LocationSearch defaultValue={searchParams.location ?? ""} defaultLatitude={searchParams.lat ?? ""} defaultLongitude={searchParams.lng ?? ""} />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(130px,180px)_minmax(150px,190px)_1fr] sm:items-end">
          <label>
            <span className="mb-1 block font-condensed text-xs font-black uppercase tracking-wider text-muted">Radius</span>
            <RadiusSelector defaultValue={searchParams.radius ?? "50"} />
          </label>
          <label>
            <span className="mb-1 block font-condensed text-xs font-black uppercase tracking-wider text-muted">Date</span>
            <select name="date" defaultValue={searchParams.date ?? "all"} className="focus-ring min-h-12 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm font-bold">
              <option value="weekend">This weekend</option>
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
              <option value="all">All upcoming</option>
            </select>
          </label>
          <button className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-racing px-5 py-2 text-sm font-black text-paper">
            <Search className="h-4 w-4" />
            Find events
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {eventTypes.map((type) => (
          <label key={type} className="cursor-pointer">
            <input className="peer sr-only" type="checkbox" name="types" value={type} defaultChecked={selectedTypes.includes(type)} />
            <span className="inline-flex rounded-full border border-ink/15 bg-cream px-3 py-2 text-xs font-bold text-ink transition peer-checked:border-racing peer-checked:bg-racing peer-checked:text-paper">
              {type}
            </span>
          </label>
        ))}
      </div>
    </form>
  );
}

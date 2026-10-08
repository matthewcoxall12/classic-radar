import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { LocationSearch } from "@/components/LocationSearch";
import { RadiusSelector } from "@/components/RadiusSelector";
import { eventTypes } from "@/lib/events";
export function EventFilters({
  searchParams,
  compact = false,
}: {
  searchParams: {
    q?: string;
    location?: string;
    lat?: string;
    lng?: string;
    radius?: string;
    date?: string;
    types?: string | string[];
    sort?: string;
  };
  compact?: boolean;
}) {
  const selected = Array.isArray(searchParams.types)
    ? searchParams.types
    : searchParams.types
      ? [searchParams.types]
      : [];
  return (
    <form
      action="/events"
      className={`search-panel ${compact ? "search-panel-hero" : ""}`}
    >
      <div className="search-primary">
        <div className="search-location">
          <LocationSearch
            defaultValue={searchParams.location ?? ""}
            defaultLatitude={searchParams.lat ?? ""}
            defaultLongitude={searchParams.lng ?? ""}
          />
        </div>
        <label className="search-radius">
          <span>Distance</span>
          <RadiusSelector defaultValue={searchParams.radius ?? "50"} />
        </label>
        <label className="search-date">
          <span>When</span>
          <select
            name="date"
            defaultValue={searchParams.date ?? "all"}
            className="field-control"
          >
            <option value="all">All upcoming dates</option>
            <option value="weekend">This weekend</option>
            <option value="7">Next 7 days</option>
            <option value="30">Next 30 days</option>
          </select>
        </label>
        <button className="search-submit">
          <Search size={18} aria-hidden="true" />
          Find events
        </button>
      </div>
      <details
        className="search-refinements"
        open={selected.length > 0 || Boolean(searchParams.q)}
      >
        <summary>
          <SlidersHorizontal size={15} aria-hidden="true" />
          More filters <span>Keyword & event categories</span>
        </summary>
        <div className="search-secondary">
          <label>
            <span>Event, venue or organiser</span>
            <input
              name="q"
              placeholder="Try Silverstone, MG or breakfast meet"
              maxLength={120}
              defaultValue={searchParams.q ?? ""}
              className="field-control"
            />
          </label>
          <label>
            <span>Sort results</span>
            <select
              name="sort"
              defaultValue={searchParams.sort ?? "date"}
              className="field-control"
            >
              <option value="date">Soonest first</option>
              <option value="distance">Nearest first (local search)</option>
            </select>
          </label>
        </div>
        <fieldset className="category-filters">
          <legend className="sr-only">Event categories</legend>
          {eventTypes.map((type) => (
            <label key={type}>
              <input
                className="peer sr-only"
                type="checkbox"
                name="types"
                value={type}
                defaultChecked={selected.includes(type)}
              />
              <span>{type}</span>
            </label>
          ))}
        </fieldset>
      </details>
      <div className="search-footnote">
        <span>Small local meets. Great days out.</span>
        <Link href="/events?radius=uk">Clear search</Link>
      </div>
    </form>
  );
}

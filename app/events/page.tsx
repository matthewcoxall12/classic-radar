import type { Metadata } from "next";
import { CalendarSearch, MapPin } from "lucide-react";
import Link from "next/link";
import { EventCard } from "@/components/EventCard";
import { EventFilters } from "@/components/EventFilters";
import { getViewer } from "@/lib/auth";
import { getEvents, getViewerEventState } from "@/lib/events";
import { hasValidCoordinatePair } from "@/lib/geocoding";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = {
  title: "Classic car events",
  description: "Search classic car shows, meets, autojumbles, rallies, club events and museum days across the UK and Europe.",
  alternates: { canonical: "/events" }
};

export default async function EventsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const types = Array.isArray(params.types) ? params.types : params.types ? [params.types] : [];
  const radius = typeof params.radius === "string" ? params.radius : "50";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const latitude = typeof params.lat === "string" ? params.lat : undefined;
  const longitude = typeof params.lng === "string" ? params.lng : undefined;
  const localSearch = Boolean(
    (typeof params.location === "string" && params.location.trim()) ||
      hasValidCoordinatePair(latitude, longitude)
  );
  const pageSize = localSearch ? 200 : 31;
  const hasLocation = Boolean(
    (typeof params.location === "string" && params.location.trim()) ||
      hasValidCoordinatePair(latitude, longitude) ||
      radius === "uk" || radius === "europe"
  );
  const [viewer, events] = await Promise.all([
    getViewer(),
    hasLocation
      ? getEvents({
          q: typeof params.q === "string" ? params.q : undefined,
          location: typeof params.location === "string" ? params.location : undefined,
          lat: latitude,
          lng: longitude,
          radius,
          date: typeof params.date === "string" ? params.date : "all",
          types,
          page: String(page)
        }, pageSize)
      : Promise.resolve([])
  ]);
  const hasNextPage = !localSearch && events.length > 30;
  const displayedEvents = hasNextPage ? events.slice(0, 30) : events;
  const state = await getViewerEventState(displayedEvents.map((event) => event.id), viewer?.id);

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-7 max-w-3xl">
        <p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">Live event calendar</p>
        <h1 className="mt-2 font-serif text-5xl font-semibold">Find classic car events</h1>
        <p className="mt-3 leading-7 text-muted">Search near home or browse across the UK and Europe. Listings link to the official organiser wherever possible.</p>
      </div>
      <EventFilters searchParams={params} />
      {hasLocation ? <p className="mt-6 text-sm font-bold text-muted">{localSearch ? displayedEvents.length : `Page ${page}`} · upcoming events</p> : null}
      <div className="mt-4 grid gap-5">
        {!hasLocation ? <SearchPrompt /> : displayedEvents.length ? displayedEvents.map((event) => (
          <EventCard key={event.id} event={event} signedIn={Boolean(viewer)} canSave={Boolean(viewer)} isSaved={state.saved.has(event.id)} isGoing={state.going.has(event.id)} />
        )) : <EmptyState />}
      </div>
      {!localSearch && (page > 1 || hasNextPage) ? (
        <nav aria-label="Event result pages" className="mt-8 flex items-center justify-between gap-4">
          {page > 1 ? <Link href={pageHref(params, page - 1)} className="focus-ring inline-flex min-h-10 items-center rounded-md border border-ink/15 bg-paper px-4 text-sm font-bold">← Previous</Link> : <span />}
          {hasNextPage ? <Link href={pageHref(params, page + 1)} className="focus-ring inline-flex min-h-10 items-center rounded-md bg-racing px-4 text-sm font-black text-paper">Next page →</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}

function pageHref(params: { [key: string]: string | string[] | undefined }, page: number) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key === "page" || value == null) return;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, value);
  });
  query.set("page", String(page));
  return `/events?${query.toString()}`;
}

function SearchPrompt() {
  return <div className="rounded-xl border border-dashed border-ink/20 bg-paper p-10 text-center"><MapPin className="mx-auto h-9 w-9 text-racing" /><h2 className="mt-3 font-serif text-2xl font-semibold">Where would you like to go?</h2><p className="mt-2 text-muted">Enter a postcode, town or city, use your current location, or choose a country-wide view.</p></div>;
}

function EmptyState() {
  return <div className="rounded-xl border border-dashed border-ink/20 bg-paper p-10 text-center"><CalendarSearch className="mx-auto h-9 w-9 text-racing" /><h2 className="mt-3 font-serif text-2xl font-semibold">No matching events yet</h2><p className="mt-2 text-muted">Try a wider radius, remove a category or browse all upcoming dates.</p></div>;
}

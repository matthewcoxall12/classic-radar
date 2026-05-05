import { EventCard } from "@/components/EventCard";
import { EventFilters } from "@/components/EventFilters";
import { getEvents } from "@/lib/events";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function EventsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const types = Array.isArray(params.types) ? params.types : params.types ? [params.types] : [];
  const radius = typeof params.radius === "string" ? params.radius : "50";
  const hasLocation = Boolean(
    (typeof params.location === "string" && params.location.trim()) ||
      (typeof params.lat === "string" && typeof params.lng === "string") ||
      radius === "uk"
  );
  const events = hasLocation
    ? await getEvents({
        q: typeof params.q === "string" ? params.q : undefined,
        location: typeof params.location === "string" ? params.location : undefined,
        lat: typeof params.lat === "string" ? params.lat : undefined,
        lng: typeof params.lng === "string" ? params.lng : undefined,
        radius,
        date: typeof params.date === "string" ? params.date : "all",
        types
      })
    : [];

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black md:text-4xl">Classic car events</h1>
        <p className="mt-2 text-muted">Filter by location, radius, date and event type.</p>
      </div>
      <EventFilters searchParams={params} />
      <div className="mt-6 grid gap-4">
        {!hasLocation ? <SearchPrompt /> : events.length ? events.map((event) => <EventCard key={event.id} event={event} />) : <EmptyState />}
      </div>
    </section>
  );
}

function SearchPrompt() {
  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-8 text-center shadow-soft">
      <h2 className="text-xl font-black">Search by location to see events</h2>
      <p className="mt-2 text-muted">Enter a postcode or town, use your current location, or choose UK-wide.</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-8 text-center shadow-soft">
      <h2 className="text-xl font-black">No events found</h2>
      <p className="mt-2 text-muted">Try widening the radius, clearing type filters or choosing all upcoming dates.</p>
    </div>
  );
}

import { AuthForm } from "@/components/AuthForm";
import { EventCard } from "@/components/EventCard";
import { getSavedEvents } from "@/lib/events";

export default async function MyEventsPage() {
  const events = await getSavedEvents();

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black">My Events</h1>
      <p className="mt-2 text-muted">Saved events and reminder preferences live here.</p>
      <div className="mt-6"><AuthForm /></div>
      <div className="mt-6 grid gap-4">
        {events.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </section>
  );
}

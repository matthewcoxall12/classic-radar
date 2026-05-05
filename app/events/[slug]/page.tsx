import { ExternalLink, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { SaveEventButton } from "@/components/SaveEventButton";
import { getEventBySlug } from "@/lib/events";
import { formatEventDate } from "@/lib/utils";

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-lg border border-ink/10 bg-paper p-5 shadow-soft md:p-8">
        <div className="flex flex-wrap gap-2">
          <EventTypeBadge type={event.event_type} />
          <ConfidenceBadge score={event.confidence_score} />
          {event.is_verified ? <span className="rounded-full bg-racing/10 px-3 py-1 text-xs font-black text-racing">Verified</span> : null}
        </div>
        <h1 className="mt-4 text-3xl font-black md:text-5xl">{event.title}</h1>
        <p className="mt-3 text-lg font-bold text-racing">{formatEventDate(event)}</p>
        <div className="mt-5 grid gap-4 rounded-md bg-cream p-4 md:grid-cols-2">
          <Info label="Venue" value={event.venue_name} />
          <Info label="Town / county" value={[event.town, event.county].filter(Boolean).join(", ")} />
          <Info label="Address" value={event.address} />
          <Info label="Postcode" value={event.postcode} />
          <Info label="Price" value={event.price_text ?? "Unknown"} />
          <Info label="Booking" value={event.booking_required ? "Booking required" : "Check organiser link"} />
          <Info label="Organiser" value={event.organiser_name} />
          <Info label="Last checked" value={event.last_checked_at ? new Date(event.last_checked_at).toLocaleDateString("en-GB") : "Not yet checked"} />
        </div>
        <p className="mt-6 leading-8 text-muted">{event.description}</p>
        <div className="mt-6 rounded-md border border-oxblood/20 bg-oxblood/5 p-4 text-sm font-bold text-oxblood">
          Please check the organiser link before travelling, as event details can change.
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {event.booking_url ? (
            <a href={event.booking_url} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-racing px-4 py-2 text-sm font-black text-paper">
              Booking/info link
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          {event.organiser_url ? (
            <a href={event.organiser_url} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink/15 px-4 py-2 text-sm font-black text-ink">
              Organiser
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          <SaveEventButton eventId={event.id} />
        </div>
        <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-muted">
          <MapPin className="h-4 w-4 text-racing" />
          Confidence score {event.confidence_score}/100 from {event.source_count} source{event.source_count === 1 ? "" : "s"}.
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-1 font-bold text-ink">{value || "Unknown"}</div>
    </div>
  );
}

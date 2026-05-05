import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { SaveEventButton } from "@/components/SaveEventButton";
import { ButtonLink } from "@/components/ui/Button";
import type { ClassicEvent } from "@/lib/types";
import { formatEventDate, locationLabel } from "@/lib/utils";

export function EventCard({ event }: { event: ClassicEvent }) {
  return (
    <article className="rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <EventTypeBadge type={event.event_type} />
          <ConfidenceBadge score={event.confidence_score} />
          {event.booking_required ? <span className="rounded-full bg-oxblood/10 px-3 py-1 text-xs font-bold text-oxblood">Booking required</span> : null}
        </div>
        <div>
          <h2 className="text-xl font-black text-ink">{event.title}</h2>
          <div className="mt-2 grid gap-2 text-sm font-semibold text-muted md:grid-cols-2">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-racing" />
              {formatEventDate(event)}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-racing" />
              {locationLabel(event)}
            </span>
          </div>
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-muted">{event.description}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-ink">
          {event.distance_miles != null ? <span>{event.distance_miles} miles away</span> : <span>Distance unavailable</span>}
          {event.price_text ? <span>{event.price_text}</span> : <span>Price unknown</span>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ButtonLink href={`/events/${event.slug}`} variant="primary">
            View details
          </ButtonLink>
          {event.booking_url ? (
            <a
              className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-4 py-2 text-sm font-bold text-ink transition hover:border-racing/40"
              href={event.booking_url}
              target="_blank"
              rel="noreferrer"
            >
              Book / More info
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          <SaveEventButton eventId={event.id} />
        </div>
      </div>
    </article>
  );
}

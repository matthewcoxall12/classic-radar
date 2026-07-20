import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { EventActions } from "@/components/EventActions";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { ButtonLink } from "@/components/ui/Button";
import type { ClassicEvent } from "@/lib/types";
import { formatEventDate, locationLabel, safeExternalUrl } from "@/lib/utils";

type Props = {
  event: ClassicEvent;
  isSaved?: boolean;
  isGoing?: boolean;
  signedIn?: boolean;
  canSave?: boolean;
};

export function EventCard({ event, isSaved = false, isGoing = false, signedIn = false, canSave = false }: Props) {
  const returnTo = `/events/${event.slug}`;
  const officialUrl = safeExternalUrl(event.booking_url) || safeExternalUrl(event.organiser_url);
  const distanceMiles = event.distance_miles == null ? null : Number(event.distance_miles);
  const distanceLabel = distanceMiles != null && Number.isFinite(distanceMiles) && distanceMiles >= 0
    ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(distanceMiles)
    : null;
  return (
    <article className="overflow-hidden rounded-xl border border-ink/10 bg-paper shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="grid md:grid-cols-[180px_1fr]">
        <div className="hidden min-h-full bg-[url('/images/event-country-show.webp')] bg-cover bg-center md:block" role="img" aria-label="Classic cars gathered at a countryside event" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <EventTypeBadge type={event.event_type} />
            <ConfidenceBadge score={event.confidence_score} />
            {event.is_verified ? <span className="rounded-full bg-racing/10 px-3 py-1 text-xs font-black text-racing">Verified</span> : null}
          </div>
          <h2 className="mt-3 font-serif text-2xl font-semibold leading-tight text-ink sm:text-3xl">{event.title}</h2>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-muted sm:grid-cols-2">
            <span className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-racing" />{formatEventDate(event)}</span>
            <span className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-racing" />{locationLabel(event) || event.country_code}</span>
          </div>
          {event.description ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted">{event.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-ink">
            {distanceLabel ? <span>{distanceLabel} miles away</span> : null}
            <span>{event.price_text || "See organiser for price"}</span>
          </div>
          <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={returnTo}>View details</ButtonLink>
              {officialUrl ? (
                <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-4 text-sm font-bold text-ink">Official page <ExternalLink className="h-4 w-4" /></a>
              ) : null}
            </div>
            <EventActions eventId={event.id} returnTo={returnTo} signedIn={signedIn} canSave={canSave} initialSaved={isSaved} initialGoing={isGoing} goingCount={event.going_count ?? 0} />
          </div>
        </div>
      </div>
    </article>
  );
}

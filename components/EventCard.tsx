import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { EventActions } from "@/components/EventActions";
import { EventImage } from "@/components/EventImage";
import type { ClassicEvent } from "@/lib/types";
import { formatEventDate, locationLabel, safeExternalUrl } from "@/lib/utils";
type Props = {
  event: ClassicEvent;
  isSaved?: boolean;
  isGoing?: boolean;
  signedIn?: boolean;
  canSave?: boolean;
};
export function EventCard({
  event,
  isSaved = false,
  isGoing = false,
  signedIn = false,
  canSave = false,
}: Props) {
  const href = `/events/${event.slug}`;
  const officialUrl =
    safeExternalUrl(event.booking_url) || safeExternalUrl(event.organiser_url);
  const distance =
    event.distance_miles == null ? null : Number(event.distance_miles);
  const validDistance =
    distance != null && Number.isFinite(distance) && distance >= 0;
  return (
    <article className="event-card">
      <div className="event-card-photo">
        <EventImage type={event.event_type} seed={event.id} />
      </div>
      <div className="event-card-body">
        <div className="event-card-tags">
          <span>{event.event_type}</span>
          <span
            className={
              event.is_verified ? "verification verified" : "verification"
            }
          >
            {event.is_verified
              ? "Verified listing"
              : "Not independently verified"}
          </span>
        </div>
        <h2>
          <Link href={href}>{event.title}</Link>
        </h2>
        <div className="event-facts">
          <p>
            <CalendarDays aria-hidden="true" size={16} />
            <span>{formatEventDate(event)}</span>
          </p>
          <p>
            <MapPin aria-hidden="true" size={16} />
            <span>{locationLabel(event) || event.country_code}</span>
          </p>
        </div>
        <div className="event-admission">
          <span>{event.price_text || "Check organiser for admission"}</span>
          {validDistance && (
            <span>
              {new Intl.NumberFormat("en-GB", {
                maximumFractionDigits: 1,
              }).format(distance!)}{" "}
              miles away
            </span>
          )}
        </div>
        {!event.is_verified && (
          <p className="verification-note">
            Check the date and public-access requirements with the organiser.
          </p>
        )}
        <div className="event-card-links">
          <Link href={href}>
            View event <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          {officialUrl && (
            <a href={officialUrl} target="_blank" rel="noopener noreferrer">
              Organiser <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          )}
        </div>
        <div className="event-card-actions">
          <EventActions
            eventId={event.id}
            returnTo={href}
            signedIn={signedIn}
            canSave={canSave}
            initialSaved={isSaved}
            initialGoing={isGoing}
            goingCount={event.going_count ?? 0}
          />
        </div>
      </div>
    </article>
  );
}

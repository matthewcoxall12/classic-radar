import type { Metadata } from "next";
import { CalendarDays, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { EventImage } from "@/components/EventImage";
import { EventCard } from "@/components/EventCard";
import { EventReviews } from "@/components/EventReviews";
import { getEventReviews } from "@/lib/event-reviews";
import { canReviewEvent, parseReviewPage } from "@/lib/event-reviews-validation";
import { eventImageUrl } from "@/lib/event-photography";
import { notFound } from "next/navigation";
import { EventActions } from "@/components/EventActions";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { getViewer } from "@/lib/auth";
import { getEventBySlug, getViewerEventState, getEvents } from "@/lib/events";
import { absoluteUrl } from "@/lib/site";
import { formatEventDate, locationLabel, safeExternalUrl } from "@/lib/utils";

type PageProps = { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  if (!event) return { title: "Event not found" };
  const title = event.status === "cancelled" ? `Cancelled: ${event.title}` : event.title;
  const description = event.status === "cancelled"
    ? `This event has been cancelled. Check the organiser for updates. ${event.description || event.title}`
    : event.description || `${event.title} classic car event details, date, location and official organiser link.`;
  const image = eventImageUrl(event);
  return {
    title,
    description: description.slice(0, 160),
    alternates: { canonical: `/events/${event.slug}` },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: description.slice(0, 160),
      images: image ? [image] : [],
    },
    openGraph: {
      type: "article",
      title,
      description: description.slice(0, 160),
      url: `/events/${event.slug}`,
      images: image ? [image] : [],
    },
  };
}

export default async function EventDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const [event, viewer] = await Promise.all([
    getEventBySlug(slug),
    getViewer(),
  ]);
  if (!event) notFound();
  const cancelled = event.status === "cancelled";
  const image = eventImageUrl(event);
  const officialUrl =
    (cancelled ? null : safeExternalUrl(event.booking_url)) || safeExternalUrl(event.organiser_url);
  const organiserUrl = safeExternalUrl(event.organiser_url);
  const reportUrl = `mailto:matthewcoxall@googlemail.com?subject=${encodeURIComponent(`Report event listing: ${event.title}`)}&body=${encodeURIComponent(`Event: ${event.title}\nListing: ${absoluteUrl(`/events/${event.slug}`)}\nEvent ID: ${event.id}\n\nPlease tell us what is incorrect or inappropriate, including any useful public source links:\n`)}`;
  const reviewPage = parseReviewPage((await searchParams)?.review_page);
  const [state, reviews] = await Promise.all([
    getViewerEventState([event.id], viewer?.id),
    canReviewEvent(event) ? getEventReviews(event.id, viewer?.id, reviewPage) : Promise.resolve(null),
  ]);
  const eventData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    startDate: `${event.start_date}${event.start_time ? `T${event.start_time}` : ""}`,
    endDate: event.end_date
      ? `${event.end_date}${event.end_time ? `T${event.end_time}` : ""}`
      : undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    aggregateRating: reviews && !reviews.unavailable && reviews.count > 0 && reviews.average != null ? {
      "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count, bestRating: 5, worstRating: 1,
    } : undefined,
    location: {
      "@type": "Place",
      name: event.venue_name,
      address: [
        event.address,
        event.town,
        event.county,
        event.postcode,
        event.country_code,
      ]
        .filter(Boolean)
        .join(", "),
    },
    image: image ? absoluteUrl(image) : undefined,
    url: absoluteUrl(`/events/${event.slug}`),
    organizer: event.organiser_name
      ? {
          "@type": "Organization",
          name: event.organiser_name,
          url: organiserUrl || undefined,
        }
      : undefined,
  };

  const address = [
    event.venue_name,
    event.address,
    event.town,
    event.county,
    event.postcode,
    event.country_code,
  ]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(", ");
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.latitude != null && event.longitude != null ? `${event.latitude},${event.longitude}` : address)}`;
  const nearby = await getEvents(
    event.latitude != null && event.longitude != null
      ? {
          lat: String(event.latitude),
          lng: String(event.longitude),
          radius: "50",
          sort: "date",
        }
      : { radius: "europe", types: [event.event_type] },
    12,
  );
  const related = nearby.filter((item) => item.id !== event.id).slice(0, 3);
  return (
    <section className="page-shell finder-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(eventData).replaceAll("<", "\\u003c"),
        }}
      />
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <Link href="/">Home</Link> /{" "}
        <Link href="/events?radius=uk">Events</Link> / {event.event_type}
      </nav>
      {cancelled ? <div role="status" className="mb-6 rounded-lg border border-oxblood/30 bg-oxblood/10 p-5 text-oxblood"><h2 className="font-serif text-3xl font-semibold">This event has been cancelled</h2><p className="mt-2 leading-7">Please do not travel to this event. Contact the organiser for updates or booking questions. You can find other upcoming events below.</p></div> : null}
      <div className="detail-hero">
        <EventImage
          type={event.event_type}
          event={event}
          sizes="(max-width: 1280px) 100vw, 1200px"
          priority
        />
      </div>
      <div className="detail-layout">
        <article>
          <div className="flex flex-wrap gap-2">
            <EventTypeBadge type={event.event_type} />
            <span className="verification text-xs">
              {event.is_verified
                ? "Verified listing"
                : "Not independently verified"}
            </span>
          </div>
          <h1 className="detail-title">{event.title}</h1>
          <div className="event-facts">
            <p>
              <CalendarDays size={18} />
              {formatEventDate(event)}
            </p>
            <p>
              <MapPin size={18} />
              {locationLabel(event) || event.country_code}
            </p>
          </div>
          <h2 className="mt-8 font-serif text-3xl font-semibold">
            About the event
          </h2>
          <p className="mt-4 whitespace-pre-line text-sm leading-8 text-muted">
            {event.description ||
              "The organiser has not supplied a description. Visit the official event page for details."}
          </p>
          <div className="mt-8 flex gap-3 border-y border-ink/15 py-5 text-sm leading-7">
            <ShieldCheck className="shrink-0 text-racing" />
            <p>
              {!event.is_verified
                ? "This listing has not been independently verified. "
                : ""}
              Confirm dates, admission, booking and public access with the
              organiser before travelling.
            </p>
          </div>
          {!cancelled ? <div className="mt-6">
            <EventActions
              eventId={event.id}
              returnTo={`/events/${event.slug}`}
              signedIn={Boolean(viewer)}
              canSave={Boolean(viewer?.canUseRoadbook)}
              initialSaved={state.saved.has(event.id)}
              initialGoing={state.going.has(event.id)}
              goingCount={event.going_count ?? 0}
            />
          </div> : <p className="mt-6 text-sm font-bold text-oxblood">Saving and marking attendance are unavailable for cancelled events.</p>}
          <p className="mt-5 text-sm text-muted">Incorrect details, duplicate listing or unsuitable content? <a href={reportUrl} className="focus-ring font-bold underline">Report this event</a>.</p>
          <EventReviews event={event} viewerId={viewer?.id} page={reviewPage} data={reviews} />
        </article>
        <aside className="detail-panel" aria-label="Plan your visit">
          <p className="eyebrow">{cancelled ? "Cancelled event" : "Plan your visit"}</p>
          <h2 className="font-serif text-3xl mt-2">The essential details</h2>
          <dl>
            <Info label="Venue" value={event.venue_name} />
            <Info label="Address" value={address} />
            <Info
              label="Admission"
              value={event.price_text || "Check with organiser"}
            />
            <Info
              label="Booking"
              value={
                cancelled ? "Cancelled — contact the organiser about existing bookings" : event.booking_required
                  ? "Advance booking required"
                  : "Check organiser page"
              }
            />
            <Info label="Organiser" value={event.organiser_name} />
            <Info
              label="Last checked"
              value={
                event.last_checked_at
                  ? new Date(event.last_checked_at).toLocaleDateString("en-GB")
                  : "Awaiting refresh"
              }
            />
          </dl>
          {officialUrl ? (
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button-primary"
            >
              {cancelled ? "Organiser updates" : "Official event page"} <ExternalLink size={16} />
            </a>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Official link not supplied.
            </p>
          )}
          {!cancelled ? <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Get directions <ExternalLink size={15} />
          </a> : null}
        </aside>
      </div>
      {related.length > 0 && (
        <section className="editorial-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Make a day of it</p>
              <h2>
                {event.latitude != null && event.longitude != null
                  ? "More events within 50 miles"
                  : "More events of this kind"}
              </h2>
            </div>
          </div>
          <div className="event-grid home-events">
            {related.map((item) => (
              <EventCard key={item.id} event={item} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="font-condensed text-xs font-bold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-ink">{value || "Not supplied"}</dd>
    </div>
  );
}

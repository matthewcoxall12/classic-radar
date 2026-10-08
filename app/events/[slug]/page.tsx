import type { Metadata } from "next";
import { CalendarDays, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { EventImage } from "@/components/EventImage";
import { EventCard } from "@/components/EventCard";
import { eventPhotograph } from "@/lib/photography";
import { notFound } from "next/navigation";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { EventActions } from "@/components/EventActions";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { getViewer } from "@/lib/auth";
import { getEventBySlug, getViewerEventState, getEvents } from "@/lib/events";
import { absoluteUrl } from "@/lib/site";
import { formatEventDate, locationLabel, safeExternalUrl } from "@/lib/utils";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  if (!event) return { title: "Event not found" };
  const description =
    event.description ||
    `${event.title} classic car event details, date, location and official organiser link.`;
  const image =
    safeExternalUrl(event.image_url) ||
    eventPhotograph(event.event_type, event.id).src;
  return {
    title: event.title,
    description: description.slice(0, 160),
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: {
      type: "article",
      title: event.title,
      description: description.slice(0, 160),
      url: `/events/${event.slug}`,
      images: [image],
    },
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [event, viewer] = await Promise.all([
    getEventBySlug(slug),
    getViewer(),
  ]);
  if (!event) notFound();
  const officialUrl =
    safeExternalUrl(event.booking_url) || safeExternalUrl(event.organiser_url);
  const organiserUrl = safeExternalUrl(event.organiser_url);
  const state = await getViewerEventState([event.id], viewer?.id);
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
    eventStatus: "https://schema.org/EventScheduled",
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
    image:
      safeExternalUrl(event.image_url) ||
      absoluteUrl(eventPhotograph(event.event_type, event.id).src),
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
      <div className="detail-hero">
        <EventImage type={event.event_type} seed={event.id} sizes="(max-width: 1280px) 100vw, 1200px" priority />
      </div>
      <div className="detail-layout">
        <article>
          <div className="flex flex-wrap gap-2">
            <EventTypeBadge type={event.event_type} />
            <ConfidenceBadge score={event.confidence_score} />
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
          <div className="mt-6">
            <EventActions
              eventId={event.id}
              returnTo={`/events/${event.slug}`}
              signedIn={Boolean(viewer)}
              canSave={Boolean(viewer)}
              initialSaved={state.saved.has(event.id)}
              initialGoing={state.going.has(event.id)}
              goingCount={event.going_count ?? 0}
            />
          </div>
        </article>
        <aside className="detail-panel" aria-label="Plan your visit">
          <p className="eyebrow">Plan your visit</p>
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
                event.booking_required
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
              Official event page <ExternalLink size={16} />
            </a>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Official link not supplied.
            </p>
          )}
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Get directions <ExternalLink size={15} />
          </a>
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

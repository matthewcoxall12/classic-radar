import type { Metadata } from "next";
import { CalendarDays, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { EventActions } from "@/components/EventActions";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { getViewer } from "@/lib/auth";
import { getEventBySlug, getViewerEventState } from "@/lib/events";
import { absoluteUrl } from "@/lib/site";
import { formatEventDate, locationLabel, safeExternalUrl } from "@/lib/utils";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  if (!event) return { title: "Event not found" };
  const description = event.description || `${event.title} classic car event details, date, location and official organiser link.`;
  const image = safeExternalUrl(event.image_url) || "/images/event-country-show.webp";
  return {
    title: event.title,
    description: description.slice(0, 160),
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: { type: "article", title: event.title, description: description.slice(0, 160), url: `/events/${event.slug}`, images: [image] }
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [event, viewer] = await Promise.all([getEventBySlug(slug), getViewer()]);
  if (!event) notFound();
  const officialUrl = safeExternalUrl(event.booking_url) || safeExternalUrl(event.organiser_url);
  const organiserUrl = safeExternalUrl(event.organiser_url);
  const state = await getViewerEventState([event.id], viewer?.id);
  const eventData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    startDate: `${event.start_date}${event.start_time ? `T${event.start_time}` : ""}`,
    endDate: event.end_date ? `${event.end_date}${event.end_time ? `T${event.end_time}` : ""}` : undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: event.venue_name, address: [event.address, event.town, event.county, event.postcode, event.country_code].filter(Boolean).join(", ") },
    image: safeExternalUrl(event.image_url) || absoluteUrl("/images/event-country-show.webp"),
    url: absoluteUrl(`/events/${event.slug}`),
    organizer: event.organiser_name ? { "@type": "Organization", name: event.organiser_name, url: organiserUrl || undefined } : undefined
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventData).replaceAll("<", "\\u003c") }} />
      <article className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-soft">
        <div className="h-56 bg-[url('/images/event-paddock.webp')] bg-cover bg-center sm:h-72" />
        <div className="p-6 sm:p-9">
          <div className="flex flex-wrap gap-2"><EventTypeBadge type={event.event_type} /><ConfidenceBadge score={event.confidence_score} />{event.is_verified ? <span className="rounded-full bg-racing/10 px-3 py-1 text-xs font-black text-racing">Verified listing</span> : null}</div>
          <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight sm:text-6xl">{event.title}</h1>
          <div className="mt-5 grid gap-3 rounded-xl bg-cream p-5 text-sm font-bold sm:grid-cols-2">
            <span className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-racing" />{formatEventDate(event)}</span>
            <span className="flex items-start gap-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-racing" />{locationLabel(event) || event.country_code}</span>
          </div>
          {event.description ? <p className="mt-7 whitespace-pre-line text-base leading-8 text-muted">{event.description}</p> : null}
          <dl className="mt-7 grid gap-5 border-y border-ink/10 py-6 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Venue" value={event.venue_name} /><Info label="Full address" value={[event.address, event.town, event.county, event.postcode].filter(Boolean).join(", ")} /><Info label="Price" value={event.price_text || "Check with organiser"} /><Info label="Booking" value={event.booking_required ? "Advance booking required" : "Check organiser page"} /><Info label="Organiser" value={event.organiser_name} /><Info label="Last checked" value={event.last_checked_at ? new Date(event.last_checked_at).toLocaleDateString("en-GB") : "Awaiting refresh"} />
          </dl>
          <div className="mt-6 flex items-start gap-2 rounded-md border border-brass/30 bg-brass/10 p-4 text-sm font-bold text-ink"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-racing" />Event details can change. Please check the official organiser page before travelling or booking accommodation.</div>
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {officialUrl ? <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-racing px-5 text-sm font-black text-paper">Official event page <ExternalLink className="h-4 w-4" /></a> : null}
            </div>
            <EventActions eventId={event.id} returnTo={`/events/${event.slug}`} signedIn={Boolean(viewer)} canSave={Boolean(viewer)} initialSaved={state.saved.has(event.id)} initialGoing={state.going.has(event.id)} goingCount={event.going_count ?? 0} />
          </div>
        </div>
      </article>
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="font-condensed text-xs font-bold uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1 font-bold text-ink">{value || "Not supplied"}</dd></div>;
}

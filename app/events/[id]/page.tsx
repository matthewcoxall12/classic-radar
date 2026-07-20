import {
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Tag,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { buildEventStructuredData, eventStartIso } from "@/lib/event-seo";
import {
  getPublishedEvent,
  safeOfficialUrl,
  type PublicMotoringEvent,
} from "@/lib/public-events";
import { publicSiteUrl } from "@/lib/site-url";
import styles from "./event-detail.module.css";

type EventPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

const loadEvent = cache(getPublishedEvent);

function eventDateLabel(event: PublicMotoringEvent) {
  const dateFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: event.timezone || "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const start = dateFormat.format(
    new Date(`${event.startDate}T12:00:00Z`),
  );
  if (!event.endDate) return start;
  const end = dateFormat.format(new Date(`${event.endDate}T12:00:00Z`));
  return `${start} to ${end}`;
}

function checkedDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function verificationLabel(
  value: PublicMotoringEvent["sourceVerification"],
) {
  switch (value) {
    case "organizer_verified":
      return "Organiser verified";
    case "partner_verified":
      return "Partner verified";
    case "source_checked":
      return "Source checked";
    case "curated":
      return "Curated listing";
    default:
      return null;
  }
}

function metadataDescription(event: PublicMotoringEvent) {
  const description = `${event.description} ${eventDateLabel(event)} at ${event.venue}, ${event.town}.`;
  if (description.length <= 160) return description;
  const shortened = description
    .slice(0, 157)
    .replace(/\s+\S*$/, "")
    .trimEnd();
  return `${shortened}…`;
}

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) {
    return {
      title: "Event not found | ClassicsGo",
      robots: { index: false, follow: false },
    };
  }

  const siteUrl = publicSiteUrl();
  const canonical = new URL(`/events/${event.id}`, siteUrl);
  const imageUrl = new URL(event.image, siteUrl);
  const title = `${event.title} | ClassicsGo`;
  const description = metadataDescription(event);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "ClassicsGo",
      title,
      description,
      images: [
        {
          url: imageUrl,
          alt: `Illustrative classic motoring scene for ${event.title}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) notFound();

  const siteUrl = publicSiteUrl();
  const pageUrl = new URL(`/events/${event.id}`, siteUrl);
  const officialUrl = safeOfficialUrl(event.officialUrl);
  const sourceUrl = event.sourceUrl ? safeOfficialUrl(event.sourceUrl) : null;
  const structuredData = buildEventStructuredData(event, pageUrl);
  const lastChecked = checkedDate(event.sourceLastCheckedAt);
  const sourceStatus = verificationLabel(event.sourceVerification);

  return (
    <SecondaryPageShell
      eyebrow={`${event.category} · ${event.town}`}
      title={event.title}
      intro={event.description}
      note="Event details linked to the organiser’s official source"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />

      <section className={styles.detailSection}>
        <div className={`shell ${styles.detailGrid}`}>
          <article className={styles.eventPanel}>
            <figure className={styles.eventImage}>
              <Image
                src={event.image}
                alt={`Illustrative classic motoring scene for ${event.title}`}
                fill
                priority
                unoptimized
                sizes="(max-width: 900px) calc(100vw - 24px), 760px"
              />
              <figcaption>Illustrative image · check the official source for event photography</figcaption>
            </figure>

            <div className={styles.eventCopy}>
              <p className={styles.kicker}>Plan your visit</p>
              <h2>Event details</h2>
              <dl className={styles.factGrid}>
                <div>
                  <dt><CalendarDays size={17} /> Date</dt>
                  <dd><time dateTime={eventStartIso(event)}>{eventDateLabel(event)}</time></dd>
                </div>
                <div>
                  <dt><Clock3 size={17} /> Starts</dt>
                  <dd>{event.startTime}</dd>
                </div>
                <div>
                  <dt><MapPin size={17} /> Venue</dt>
                  <dd>{event.venue}<br />{event.town}, {event.postcode}</dd>
                </div>
                <div>
                  <dt><Tag size={17} /> Admission</dt>
                  <dd>{event.price}</dd>
                </div>
                <div>
                  <dt><Users size={17} /> Community</dt>
                  <dd>
                    {typeof event.goingCount === "number"
                      ? `${event.goingCount.toLocaleString("en-GB")} going`
                      : "Attendance total unavailable"}
                  </dd>
                </div>
              </dl>
            </div>
          </article>

          <aside className={styles.sourcePanel} aria-labelledby="official-source-heading">
            <ShieldCheck size={28} aria-hidden="true" />
            <p className={styles.kicker}>Before you travel</p>
            <h2 id="official-source-heading">Check the official source</h2>
            <p>
              Times, admission and access can change. Confirm the latest details
              directly with the organiser before setting out.
            </p>
            {officialUrl ? (
              <a
                className={styles.officialButton}
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${event.officialLabel} for ${event.title} (opens in a new tab)`}
              >
                {event.officialLabel} <ExternalLink size={17} />
              </a>
            ) : (
              <p className={styles.sourceWarning}>
                The organiser link is being re-checked. Please search for the
                venue’s official event listing before travelling.
              </p>
            )}
            {(sourceStatus || lastChecked || (sourceUrl && sourceUrl !== officialUrl)) && (
              <div className={styles.sourceMeta}>
                {sourceStatus && <strong>{sourceStatus}</strong>}
                {lastChecked && <small>Source last checked {lastChecked}</small>}
                {sourceUrl && sourceUrl !== officialUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View listing source <ExternalLink size={13} />
                  </a>
                )}
              </div>
            )}
            <Link className={styles.backLink} href="/#events">
              Find more events near you
            </Link>
          </aside>
        </div>
      </section>
    </SecondaryPageShell>
  );
}

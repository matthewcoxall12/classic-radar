import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin, Bookmark } from "lucide-react";
import { EventCard } from "@/components/EventCard";
import { EventFilters } from "@/components/EventFilters";
import { getViewer } from "@/lib/auth";
import {
  getUpcomingEvents,
  getViewerEventState,
  eventTypes,
} from "@/lib/events";
import { photographs } from "@/lib/photography";
export const metadata: Metadata = { alternates: { canonical: "/" } };
export default async function HomePage() {
  const [viewer, events] = await Promise.all([
    getViewer(),
    getUpcomingEvents(3),
  ]);
  const state = await getViewerEventState(
    events.map((e) => e.id),
    viewer?.id,
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">For the love of the drive</p>
          <h1>Find your next great motoring day.</h1>
          <p className="hero-intro">
            The village meet. The legendary circuit. The Sunday worth getting up
            for. Discover classic car events across the UK and Europe.
          </p>
          <Link className="text-link" href="/events?radius=uk">
            Explore the calendar <ArrowUpRight size={20} />
          </Link>
          <span className="hero-edition">
            CLASSICSGO / THE OPEN ROAD AWAITS
          </span>
        </div>
        <figure className="hero-photo">
          <Image
            src={photographs.racing.src}
            alt={photographs.racing.alt}
            fill
            priority
            sizes="(max-width: 800px) 100vw, 55vw"
          />
          <figcaption>
            Jaguar E-Type, Goodwood 2014 ·{" "}
            <Link href="/photography">Nic Redhead / CC BY-SA 2.0</Link>
          </figcaption>
        </figure>
      </section>
      <section className="home-search page-shell">
        <h2 className="sr-only">Find an event near you</h2>
        <EventFilters compact searchParams={{ radius: "50", date: "all" }} />
      </section>
      <section className="page-shell editorial-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Dates for your diary</p>
            <h2>Coming up on the calendar</h2>
          </div>
          <Link className="text-link" href="/events?radius=uk">
            All upcoming events <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="event-grid home-events">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              signedIn={Boolean(viewer)}
              canSave={Boolean(viewer)}
              isSaved={state.saved.has(event.id)}
              isGoing={state.going.has(event.id)}
            />
          ))}
          {!events.length && (
            <div className="empty-state">
              <h3>The next chapter is on its way.</h3>
              <p>Search the calendar or share an event for review.</p>
              <Link href="/submit-event">Submit an event →</Link>
            </div>
          )}
        </div>
      </section>
      <section className="category-section">
        <div className="page-shell">
          <p className="eyebrow">Follow your passion</p>
          <h2>A day out for every enthusiast.</h2>
          <div className="category-links">
            {eventTypes.map((type, i) => (
              <Link
                key={type}
                href={`/events?radius=uk&types=${encodeURIComponent(type)}`}
              >
                <span className="category-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {type}
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="page-shell editorial-section">
        <div className="editorial-split">
          <figure className="editorial-photo">
            <Image
              src={photographs.gathering.src}
              alt={photographs.gathering.alt}
              fill
              sizes="(max-width: 800px) 100vw, 50vw"
            />
            <figcaption>
              Illustrative photograph ·{" "}
              <Link href="/photography">Calreyn88 / CC BY-SA 4.0</Link>
            </figcaption>
          </figure>
          <div className="editorial-copy">
            <p className="eyebrow">Small meets. Lasting memories.</p>
            <h2>There’s more to discover close to home.</h2>
            <p>
              Find the breakfast meet down the road, a museum open day or a
              club’s next gathering. Set your distance and let the calendar do
              the searching.
            </p>
            <Link className="button-primary" href="/events">
              Find events near you <MapPin size={17} />
            </Link>
          </div>
        </div>
      </section>
      <section className="roadbook-section">
        <div className="page-shell roadbook-inner">
          <div>
            <p className="eyebrow">Your own motoring calendar</p>
            <h2>Keep the good days in sight.</h2>
            <p>
              A free ClassicsGo account lets you save events, mark the days
              you’re going and share a listing with our reviewers.
            </p>
            <Link href="/sign-in" className="button-light">
              Create your free account <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="roadbook-features">
            <p>
              <Bookmark />
              Save your discoveries
            </p>
            <p>
              <CalendarDays />
              Mark the days you’re going
            </p>
            <p>
              <MapPin />
              Explore a little further
            </p>
            <span>
              Roadbook route planning and tailored alerts are coming later.{" "}
              <Link href="/membership">See what’s available →</Link>
            </span>
          </div>
        </div>
      </section>
      <section className="page-shell organiser-strip">
        <div>
          <p className="eyebrow">Clubs & organisers</p>
          <h2>Give your next gathering a place on the calendar.</h2>
        </div>
        <Link className="button-primary" href="/submit-event">
          Add an event <ArrowUpRight size={18} />
        </Link>
      </section>
    </>
  );
}

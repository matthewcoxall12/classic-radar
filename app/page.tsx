import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Building2, CalendarSearch, MapPin, Radar, Route, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EventCard } from "@/components/EventCard";
import { EventFilters } from "@/components/EventFilters";
import { getViewer } from "@/lib/auth";
import { getUpcomingEvents, getViewerEventState } from "@/lib/events";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [viewer, events] = await Promise.all([getViewer(), getUpcomingEvents(3)]);
  const state = await getViewerEventState(events.map((event) => event.id), viewer?.id);

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink/10 bg-cream">
        <div className="mx-auto grid max-w-7xl px-4 pt-9 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:pt-12">
          <div className="relative z-10 flex flex-col justify-center rounded-t-2xl border border-b-0 border-ink/10 bg-paper/85 p-7 shadow-soft sm:p-10 lg:rounded-l-2xl lg:rounded-tr-none lg:border-b lg:border-r-0 lg:p-12">
            <p className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-oxblood">UK &amp; European classic car events</p>
            <h1 className="mt-4 font-serif text-5xl font-semibold leading-[0.95] tracking-tight text-ink sm:text-6xl xl:text-7xl">Your next great motoring day starts here.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
              ClassicsGo finds classic car shows, small local meets, autojumbles, road runs, club gatherings and museum events—then links you directly to the official organiser.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-racing">
              <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4" /> Organiser links</span>
              <span className="flex items-center gap-2"><Radar className="h-4 w-4" /> Continuously discovered</span>
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Search near you</span>
            </div>
          </div>
          <div className="relative min-h-[340px] overflow-hidden border border-ink/10 bg-[url('/images/hero-roadster.webp')] bg-cover bg-center shadow-soft lg:min-h-[520px] lg:rounded-r-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-ink/15 via-transparent to-transparent" />
            <div className="absolute bottom-5 right-5 rounded-md border border-paper/20 bg-racing/90 px-3 py-2 text-xs font-bold text-paper backdrop-blur">Built for weekends worth remembering</div>
          </div>
        </div>
        <div className="relative z-20 mx-auto -mt-2 max-w-6xl px-4 pb-12 sm:px-6 lg:-mt-14">
          <EventFilters searchParams={{ radius: "50", date: "30" }} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">Fresh from the calendar</p><h2 className="mt-2 font-serif text-4xl font-semibold">Upcoming events</h2></div>
          <Link href="/events?radius=uk" className="inline-flex items-center gap-2 text-sm font-black text-racing">Explore all events <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-7 grid gap-5">
          {events.length ? events.map((event) => (
            <EventCard key={event.id} event={event} isSaved={state.saved.has(event.id)} isGoing={state.going.has(event.id)} signedIn={Boolean(viewer)} canSave={Boolean(viewer)} />
          )) : (
            <div className="rounded-xl border border-dashed border-ink/20 bg-paper p-8 text-center">
              <CalendarSearch className="mx-auto h-9 w-9 text-racing" />
              <h3 className="mt-3 font-serif text-2xl font-semibold">The live calendar is being filled</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">Our discovery runs collect and verify listings before they appear. Search again shortly, or tell us about an event we should include.</p>
              <Link href="/submit-event" className="mt-4 inline-flex font-bold text-racing">Submit an event →</Link>
            </div>
          )}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-paper">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-3xl text-center"><p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">Everything in one place</p><h2 className="mt-2 font-serif text-4xl font-semibold">From village-green meets to landmark shows</h2><p className="mt-3 leading-7 text-muted">We combine official calendars, clubs, venues and public event sources so enthusiasts can spend less time searching and more time driving.</p></div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            <Feature icon={<CalendarSearch />} title="Deep event discovery">Regular searches across club calendars, museums, organisers and regional sources.</Feature>
            <Feature icon={<MapPin />} title="Truly local results">Use a town, postcode or browser location, then choose the distance you are willing to travel.</Feature>
            <Feature icon={<ShieldCheck />} title="Clear source confidence">Every listing keeps its organiser link and verification signals, so you can check before setting off.</Feature>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-racing p-8 text-paper shadow-soft sm:p-10">
          <Route className="h-9 w-9 text-brass" /><h2 className="mt-5 font-serif text-4xl font-semibold">Make weekends easier with Roadbook</h2><p className="mt-4 leading-7 text-paper/70">Free members can search, save events, mark attendance and submit listings. Roadbook membership will add multi-stop plans, tailored alerts, extra saved areas and an ad-free experience.</p><Link href="/membership" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-brass px-5 text-sm font-black text-racing">Compare membership <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-[url('/images/event-paddock.webp')] bg-cover bg-center p-8 shadow-soft sm:p-10">
          <div className="max-w-md rounded-xl bg-paper/95 p-6 backdrop-blur"><Building2 className="h-8 w-8 text-oxblood" /><h2 className="mt-4 font-serif text-3xl font-semibold">Run a club or venue?</h2><p className="mt-3 leading-7 text-muted">Keep your calendar accurate, reach nearby enthusiasts and help us uncover the small events that deserve a bigger audience.</p><Link href="/clubs" className="mt-5 inline-flex items-center gap-2 font-black text-racing">Work with ClassicsGo <ArrowRight className="h-4 w-4" /></Link></div>
        </div>
      </section>
    </>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <article className="rounded-xl border border-ink/10 bg-cream p-6"><span className="grid h-11 w-11 place-items-center rounded-full bg-racing/10 text-racing">{icon}</span><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{children}</p></article>;
}

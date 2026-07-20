import type { Metadata } from "next";
import { Bookmark, Crown, MapPin, Settings, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { AccountSecurityControls } from "@/components/AccountSecurityControls";
import { EventCard } from "@/components/EventCard";
import { ProfileForm } from "@/components/ProfileForm";
import { SignOutButton } from "@/components/SignOutButton";
import { requireViewer } from "@/lib/auth";
import { getGoingEvents, getSavedEvents, getViewerEventState } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requested = typeof params.tab === "string" ? params.tab : "overview";
  const tab = ["overview", "saved", "going", "profile", "security"].includes(requested) ? requested : "overview";
  const viewer = await requireViewer(`/account${tab === "overview" ? "" : `?tab=${tab}`}`);
  const supabase = await createClient();
  const [{ data: profile }, going, saved] = await Promise.all([
    supabase.from("profiles").select("display_name,home_location,home_postcode,home_radius_miles,tier").eq("id", viewer.id).single(),
    getGoingEvents(viewer.id),
    getSavedEvents(viewer.id)
  ]);
  const displayed = tab === "saved" ? saved : tab === "going" ? going : [];
  const eventState = await getViewerEventState(displayed.map((event) => event.id), viewer.id);
  const safeProfile = {
    display_name: profile?.display_name || viewer.displayName,
    home_location: profile?.home_location || null,
    home_postcode: profile?.home_postcode || null,
    home_radius_miles: profile?.home_radius_miles || 50
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-5 border-b border-ink/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">My account</p><h1 className="mt-2 font-serif text-5xl font-semibold">Welcome, {viewer.displayName}</h1><p className="mt-2 text-sm text-muted">{viewer.email} · {viewer.tier === "roadbook" ? "Roadbook member" : "Free member"}</p></div>
        <SignOutButton />
      </div>
      <nav aria-label="Account sections" className="mt-6 flex gap-2 overflow-x-auto pb-1">
        <Tab href="/account" active={tab === "overview"} icon={<MapPin className="h-4 w-4" />}>Overview</Tab>
        <Tab href="/account?tab=going" active={tab === "going"} icon={<Users className="h-4 w-4" />}>Going ({going.length})</Tab>
        <Tab href="/account?tab=saved" active={tab === "saved"} icon={<Bookmark className="h-4 w-4" />}>Saved ({saved.length})</Tab>
        <Tab href="/account?tab=profile" active={tab === "profile"} icon={<Settings className="h-4 w-4" />}>Preferences</Tab>
        <Tab href="/account?tab=security" active={tab === "security"} icon={<ShieldCheck className="h-4 w-4" />}>Data & security</Tab>
      </nav>

      {tab === "overview" ? (
        <div className="mt-7 grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-xl border border-ink/10 bg-paper p-6 shadow-soft">
            <h2 className="font-serif text-3xl font-semibold">Your next outings</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Mark “I’m going” on any listing to keep it here and add to the public attendance count.</p>
            {going.length ? <div className="mt-5 grid gap-3">{going.slice(0, 3).map((event) => <Link key={event.id} href={`/events/${event.slug}`} className="flex items-center justify-between rounded-md bg-cream p-4 font-bold"><span>{event.title}<small className="mt-1 block font-normal text-muted">{event.start_date} · {event.town || event.country_code}</small></span><span aria-hidden>→</span></Link>)}</div> : <p className="mt-5 rounded-md bg-cream p-5 text-sm text-muted">Nothing planned yet. <Link href="/events?radius=uk" className="font-bold text-racing">Find an event</Link> and tap “I’m going”.</p>}
          </div>
          <div className="rounded-xl bg-racing p-6 text-paper shadow-soft">
            <Crown className="h-8 w-8 text-brass" /><h2 className="mt-4 font-serif text-3xl font-semibold">{viewer.tier === "roadbook" ? "Roadbook active" : "Roadbook is coming soon"}</h2>
            <p className="mt-3 text-sm leading-6 text-paper/70">{viewer.tier === "roadbook" ? "Your saved events, locations, alerts and planning tools are ready." : "Your free wishlist is ready now. Roadbook will add multiple saved areas, garage, alerts, reminders and trip plans."}</p>
            <Link href="/membership" className="mt-5 inline-flex font-black text-brass">See membership details →</Link>
          </div>
        </div>
      ) : null}

      {tab === "going" ? <EventList events={displayed} canSave state={eventState} empty="You have not marked any events as going yet." /> : null}
      {tab === "saved" ? <EventList events={displayed} canSave state={eventState} empty="Your wishlist is empty." /> : null}
      {tab === "profile" ? <div className="mt-7 max-w-2xl rounded-xl border border-ink/10 bg-paper p-6 shadow-soft"><h2 className="font-serif text-3xl font-semibold">Search preferences</h2><p className="mt-2 mb-5 text-sm leading-6 text-muted">These details make it faster to begin a local event search. Your exact browser location is never stored here automatically.</p><ProfileForm profile={safeProfile} /></div> : null}
      {tab === "security" ? <div className="mt-7 max-w-3xl"><AccountSecurityControls canDelete={!viewer.isAdmin && viewer.tier === "free"} /></div> : null}
    </section>
  );
}

function Tab({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <Link href={href} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold ${active ? "border-racing bg-racing text-paper" : "border-ink/15 bg-paper text-ink"}`}>{icon}{children}</Link>;
}

function EventList({ events, canSave, state, empty }: { events: Awaited<ReturnType<typeof getGoingEvents>>; canSave: boolean; state: Awaited<ReturnType<typeof getViewerEventState>>; empty: string }) {
  return <div className="mt-7 grid gap-5">{events.length ? events.map((event) => <EventCard key={event.id} event={event} signedIn canSave={canSave} isSaved={state.saved.has(event.id)} isGoing={state.going.has(event.id)} />) : <p className="rounded-xl border border-dashed border-ink/20 bg-paper p-8 text-center text-muted">{empty} <Link href="/events?radius=uk" className="font-bold text-racing">Browse events</Link>.</p>}</div>;
}

import type { Metadata } from "next";
import { BadgeCheck, CalendarPlus, Handshake, Radar } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For clubs and organisers",
  description: "Help ClassicsGo list accurate club calendars and classic car events.",
  alternates: { canonical: "/clubs" }
};

export default function ClubsPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">Clubs, venues &amp; organisers</p>
          <h1 className="mt-2 font-serif text-5xl font-semibold leading-tight sm:text-6xl">Put your dates where enthusiasts are looking.</h1>
          <p className="mt-5 text-lg leading-8 text-muted">ClassicsGo helps people discover the small club night as easily as the major show. Share a public calendar or official listing source and help us keep your details accurate.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/submit-event" className="focus-ring inline-flex min-h-11 items-center rounded-md bg-racing px-5 text-sm font-black text-paper">Submit an event</Link>
            <a href="mailto:hello@classicsgo.com?subject=Club%20or%20organiser%20partnership" className="focus-ring inline-flex min-h-11 items-center rounded-md border border-ink/15 bg-paper px-5 text-sm font-black text-ink">Email hello@classicsgo.com</a>
          </div>
        </div>
        <div className="min-h-[360px] rounded-2xl bg-[url('/images/event-autojumble.webp')] bg-cover bg-center shadow-soft" role="img" aria-label="A classic vehicle event and autojumble" />
        <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:col-span-2">
          <Point icon={<CalendarPlus />} title="Free submissions">Tell us about individual public events at no listing charge.</Point>
          <Point icon={<Radar />} title="Calendar coverage">Provide an official public event or calendar page for regular discovery.</Point>
          <Point icon={<BadgeCheck />} title="Source accuracy">Official club and organiser information carries the strongest verification signal.</Point>
        </div>
        <div className="rounded-xl border border-brass/40 bg-brass/10 p-6 lg:col-span-2">
          <div className="flex items-start gap-3">
            <Handshake className="mt-1 h-7 w-7 shrink-0 text-racing" />
            <div>
              <h2 className="font-serif text-3xl font-semibold">Future local partnerships</h2>
              <p className="mt-2 leading-7 text-muted">We expect to offer clearly labelled opportunities for specialist garages, detailers, insurers, hospitality businesses and other firms that genuinely serve the classic motoring community. Contact hello@classicsgo.com to register interest; no advertising product is on sale yet.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-5">
      <span className="text-racing">{icon}</span>
      <h2 className="mt-3 text-lg font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}

import type { Metadata } from "next";
import { BellRing, Bookmark, Check, Crown, MapPinned, Route, Search } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "Membership", description: "Compare free ClassicsGo access with the upcoming paid Roadbook planning membership.", alternates: { canonical: "/membership" } };

const freeFeatures = ["Search and browse the full public event calendar", "Search by town, postcode, current location and distance", "Save events to a private wishlist", "Open official organiser and social links", "Mark “I’m going” and see public attendance", "Submit missing events for review"];
const paidFeatures = ["Everything in Free", "Create trip and weekend roadbooks", "Follow multiple home or travel areas", "Garage and vehicle profiles", "Tailored event alerts and reminders", "Ad-free member experience"];

export default function MembershipPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl text-center"><p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">Choose your route</p><h1 className="mt-2 font-serif text-5xl font-semibold sm:text-6xl">Find for free. Plan with Roadbook.</h1><p className="mt-4 text-lg leading-8 text-muted">The event calendar remains open to everyone. Roadbook is the optional paid toolkit for enthusiasts who want to organise more weekends around the cars they love.</p></div>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Plan title="Free" price="£0" description="For discovering events and joining the community." features={freeFeatures} icon={<Search className="h-7 w-7" />} action={<Link href="/events?radius=uk" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-racing px-5 text-sm font-black text-racing">Find events</Link>} />
        <Plan title="Roadbook" price="Coming soon" description="For routes, alerts and deeper weekend planning." features={paidFeatures} featured icon={<Crown className="h-7 w-7" />} action={<Link href="/sign-in?return_to=%2Faccount" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md bg-brass px-5 text-sm font-black text-racing">Create a free account</Link>} />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Benefit icon={<Bookmark />} title="Private wishlist">Keep the events you do not want to lose.</Benefit><Benefit icon={<Route />} title="Weekend roadbooks">Group stops into plans worth sharing.</Benefit><Benefit icon={<MapPinned />} title="Multiple areas">Follow home, holiday and touring locations.</Benefit><Benefit icon={<BellRing />} title="Useful alerts">Hear about relevant new events and reminders.</Benefit>
      </div>
      <div className="mt-10 rounded-xl border border-brass/40 bg-brass/10 p-6 text-center"><p className="font-bold text-ink">Roadbook is not yet taking payments.</p><p className="mt-2 text-sm leading-6 text-muted">Pricing and billing terms will be shown clearly before launch. Creating a free account now does not start a trial or subscription.</p></div>
    </section>
  );
}

function Plan({ title, price, description, features, action, icon, featured = false }: { title: string; price: string; description: string; features: string[]; action: React.ReactNode; icon: React.ReactNode; featured?: boolean }) {
  return <article className={`rounded-2xl border p-7 shadow-soft sm:p-8 ${featured ? "border-brass bg-racing text-paper" : "border-ink/10 bg-paper"}`}><div className={`grid h-12 w-12 place-items-center rounded-full ${featured ? "bg-brass text-racing" : "bg-racing/10 text-racing"}`}>{icon}</div><h2 className="mt-5 font-serif text-4xl font-semibold">{title}</h2><p className={`mt-1 font-condensed text-2xl font-bold ${featured ? "text-brass" : "text-oxblood"}`}>{price}</p><p className={`mt-3 text-sm leading-6 ${featured ? "text-paper/70" : "text-muted"}`}>{description}</p><ul className="mt-6 grid gap-3">{features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm font-semibold"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-brass" : "text-racing"}`} />{feature}</li>)}</ul><div className="mt-7">{action}</div></article>;
}

function Benefit({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-ink/10 bg-paper p-5"><span className="text-racing">{icon}</span><h3 className="mt-3 font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{children}</p></div>;
}

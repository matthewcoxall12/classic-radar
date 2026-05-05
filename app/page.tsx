import { Gauge, MapPin, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { EventFilters } from "@/components/EventFilters";

export default async function HomePage() {
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-brass">UK classic car events</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-6xl">Find classic car events near you</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-paper/75">
            Discover shows, meets, autojumbles, rallies, club nights and museum days by town, postcode, radius and date.
          </p>
          <div className="mt-8 max-w-4xl">
            <EventFilters searchParams={{ radius: "50", date: "30" }} />
          </div>
        </div>
        <div className="rounded-lg border border-paper/10 bg-paper/8 p-5">
          <div className="grid gap-3">
            <TrustPoint icon={<MapPin className="h-5 w-5" />} title="Local-first" text="Start with your town or postcode and widen the radius only when you need to." />
            <TrustPoint icon={<ShieldCheck className="h-5 w-5" />} title="Source aware" text="Each event carries source confidence and a clear organiser link." />
            <TrustPoint icon={<Gauge className="h-5 w-5" />} title="Agent assisted" text="The discovery agent can run three times daily and sends uncertain finds to review." />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustPoint({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-md border border-paper/10 bg-ink/35 p-4">
      <div className="flex items-center gap-3 font-black text-paper">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-racing text-paper">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-paper/70">{text}</p>
    </div>
  );
}

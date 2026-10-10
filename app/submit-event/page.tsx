import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusForm } from "./StatusForm";

export const metadata: Metadata = { title: "My event listings", description: "Publish and manage your classic car events.", robots: { index: false, follow: false } };
export default async function SubmitEventPage() {
  const viewer = await requireViewer("/submit-event");
  const supabase = await createClient();
  const { data: events, error } = await supabase.from("events").select("id,title,slug,start_date,status").eq("created_by", viewer.id).order("start_date", { ascending: false }).limit(200);
  return <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">For organisers and enthusiasts</p><h1 className="mt-2 font-serif text-5xl font-semibold">My event listings</h1><p className="mt-3 max-w-2xl leading-7 text-muted">Add your classic car show, local meet, autojumble or road run for free. Listings go live immediately, and you can return here to keep the details up to date.</p><Link href="/submit-event/new" className="focus-ring mt-6 inline-flex min-h-12 items-center rounded-md bg-racing px-5 py-3 font-bold text-paper">Add an event</Link>
    {error ? <p role="alert" className="mt-6">We could not load your events. Please refresh and try again.</p> : events?.length ? <ul className="mt-8 grid gap-4">{events.map(event => <li key={event.id} className="rounded-lg border border-ink/15 bg-paper p-5"><p className="text-sm text-muted">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(`${event.start_date}T12:00:00Z`))} · {event.status === "cancelled" ? "Cancelled — hidden from the directory" : event.status === "published" ? "Published" : event.status}</p><h2 className="mt-1 font-serif text-2xl">{event.title}</h2><div className="mt-4 flex flex-wrap items-center gap-5">{["published", "cancelled"].includes(event.status) ? <Link href={`/events/${event.slug}`} className="focus-ring font-bold underline">View event</Link> : null}{["published", "cancelled"].includes(event.status) ? <><Link href={`/submit-event/${event.id}/edit`} className="focus-ring font-bold underline">Edit details</Link><StatusForm eventId={event.id} cancelled={event.status === "cancelled"} /></> : <p className="text-sm text-muted">This listing is managed by ClassicsGo. Contact us if you need help.</p>}</div></li>)}</ul> : <p className="mt-8 rounded-lg border border-ink/15 p-6">You have not added any events yet. Publish your first listing to help people discover it.</p>}
  </section>;
}

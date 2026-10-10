import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Shared Roadbook", robots: { index: false, follow: false } };
type SharedBook = { name: string; description: string; events: { id: string; slug: string; title: string; start_date: string; venue_name: string | null; town: string | null }[] };
export default async function SharedRoadbook({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_roadbook", { p_share_token: token });
  if (error || !data) notFound();
  const book = data as SharedBook;
  return <section className="mx-auto max-w-3xl px-4 py-12"><p className="text-sm font-bold uppercase tracking-widest text-oxblood">Shared ClassicsGo Roadbook</p><h1 className="mt-3 font-serif text-5xl">{book.name}</h1><p className="my-5 whitespace-pre-line leading-7 text-muted">{book.description}</p><ol className="space-y-5">{book.events.map((event, index) => <li key={event.id} className="rounded-xl border border-ink/10 bg-paper p-6"><p className="text-sm font-bold text-muted">Stop {index + 1} · {event.start_date}</p><Link className="mt-2 block font-serif text-3xl underline" href={`/events/${event.slug}`}>{event.title}</Link><p className="mt-2 text-muted">{[event.venue_name, event.town].filter(Boolean).join(", ")}</p></li>)}</ol><p className="mt-6 text-sm text-muted">Check event details and book directly with organisers. A shared plan does not reserve tickets.</p></section>;
}

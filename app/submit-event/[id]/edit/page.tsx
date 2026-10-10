import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitEventForm } from "@/components/SubmitEventForm";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export const metadata = { title: "Edit your event", robots: { index: false, follow: false } };
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/submit-event/${id}/edit`);
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", id).eq("created_by", viewer.id).in("status", ["published", "cancelled"]).maybeSingle();
  if (!event) notFound();
  return <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><Link href="/submit-event" className="focus-ring text-sm font-bold underline">Your events</Link><h1 className="mt-5 font-serif text-5xl font-semibold">Edit your event</h1><p className="mt-3 leading-7 text-muted">Changes appear immediately. A cancelled event stays hidden until you restore it from Your events.</p><SubmitEventForm event={event} /></section>;
}

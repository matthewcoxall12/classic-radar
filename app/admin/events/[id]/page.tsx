import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateAdminEvent } from "@/app/admin/events/actions";
import { getViewer } from "@/lib/auth";
import { eventTypes } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import type { ClassicEvent } from "@/lib/types";

export const metadata: Metadata = { title: "Edit event", robots: { index: false, follow: false } };

export default async function EditAdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const event = data as ClassicEvent;

  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-5 shadow-soft sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-condensed text-xs font-bold uppercase tracking-[0.16em] text-oxblood">Admin event editor</p><h2 className="mt-1 font-serif text-3xl font-semibold">Edit listing</h2><p className="mt-1 text-sm text-muted">Status: {event.status}. Publishing and cancellation stay on the event table.</p></div>
        <Link href="/admin/events" className="focus-ring rounded-md border border-ink/15 px-3 py-2 text-sm font-bold">← All events</Link>
      </div>
      <form action={updateAdminEvent} className="mt-6 grid gap-4">
        <input type="hidden" name="id" value={event.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Event name"><input name="title" required defaultValue={event.title} className="field-control" /></Field>
          <Field label="Event type"><select name="event_type" defaultValue={event.event_type} className="field-control">{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Start date"><input name="start_date" type="date" required defaultValue={event.start_date} className="field-control" /></Field>
          <Field label="End date"><input name="end_date" type="date" defaultValue={event.end_date ?? ""} className="field-control" /></Field>
          <Field label="Venue"><input name="venue_name" defaultValue={event.venue_name ?? ""} className="field-control" /></Field>
          <Field label="Town"><input name="town" defaultValue={event.town ?? ""} className="field-control" /></Field>
          <Field label="County / region"><input name="county" defaultValue={event.county ?? ""} className="field-control" /></Field>
          <Field label="Postcode"><input name="postcode" defaultValue={event.postcode ?? ""} className="field-control" /></Field>
          <Field label="Country code"><input name="country_code" required minLength={2} maxLength={2} defaultValue={event.country_code} className="field-control uppercase" /></Field>
          <Field label="Price"><input name="price_text" defaultValue={event.price_text ?? ""} className="field-control" /></Field>
          <Field label="Organiser"><input name="organiser_name" defaultValue={event.organiser_name ?? ""} className="field-control" /></Field>
          <Field label="Organiser URL"><input name="organiser_url" type="url" defaultValue={event.organiser_url ?? ""} className="field-control" /></Field>
          <Field label="Booking URL"><input name="booking_url" type="url" defaultValue={event.booking_url ?? ""} className="field-control" /></Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-bold"><input name="booking_required" type="checkbox" defaultChecked={event.booking_required === true} className="h-4 w-4 accent-racing" /> Advance booking required</label>
        </div>
        <Field label="Description"><textarea name="description" rows={7} defaultValue={event.description ?? ""} className="focus-ring rounded-md border border-ink/15 bg-paper px-3 py-2" /></Field>
        <button className="focus-ring w-fit rounded-md bg-racing px-5 py-3 text-sm font-black text-paper">Save event details</button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm font-bold">{label}{children}</label>;
}

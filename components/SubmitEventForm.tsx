"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { submitMissingEvent } from "@/app/submit-event/actions";
import { submissionTypes } from "@/lib/event-submission";

type EditableEvent = Record<string, string | number | boolean | null | undefined>;
const inputClass = "focus-ring min-h-11 rounded-md border border-ink/20 bg-paper px-3 py-2 font-normal";
export function SubmitEventForm({ event }: { event?: EditableEvent }) {
  const [state, formAction, pending] = useActionState(submitMissingEvent, { ok: false, message: "" });
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(event ?? {}).map(([name, value]) => [name, String(value ?? "").replace(/^(\d{2}:\d{2}):\d{2}$/, "$1")])));
  const [bookingRequired, setBookingRequired] = useState(event?.booking_required === true);
  const value = (name: string) => values[name] ?? "";
  const change = (name: string, next: string) => setValues(current => ({ ...current, [name]: next }));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const field = (name: string, label: string, type = "text", required = false, maxLength = 180) => <label className="grid gap-1 text-sm font-bold">{label}{required ? " *" : ""}<input name={name} type={type} lang="en-GB" required={required} maxLength={maxLength} min={type === "date" ? name === "end_date" ? value("start_date") || today : today : undefined} step={type === "time" ? 60 : undefined} value={value(name)} onChange={event => change(name, event.target.value)} className={inputClass} /></label>;
  if (state.ok) return <div role="status" className="mt-6 rounded-lg border border-racing/30 bg-paper p-6"><h2 className="font-serif text-3xl">{event ? "Changes saved" : "Your event is live"}</h2><p className="mt-3">{state.message}</p><div className="mt-5 flex flex-wrap gap-4"><Link href={state.eventUrl || "/events?radius=uk"} className="focus-ring rounded-md bg-racing px-4 py-3 font-bold text-paper">View event</Link><Link href="/submit-event" className="focus-ring px-4 py-3 font-bold underline">Manage your events</Link><Link href="/submit-event/new" className="focus-ring px-4 py-3 font-bold underline">Add another event</Link></div></div>;
  return <form action={formAction} className="mt-6 grid gap-6 rounded-lg border border-ink/10 bg-paper p-5 shadow-soft sm:p-7">
    {event?.id ? <input type="hidden" name="event_id" value={String(event.id)} /> : null}
    <p className="text-sm text-muted">Fields marked * are required. Your event appears publicly as soon as it saves.</p>
    <fieldset className="grid gap-4"><legend className="mb-3 font-serif text-2xl font-semibold">The event</legend>
      {field("title", "Event name", "text", true)}
      <label className="grid gap-1 text-sm font-bold">Event type *<select name="event_type" required value={value("event_type") || submissionTypes[0]} onChange={event => change("event_type", event.target.value)} className={inputClass}>{submissionTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-bold">What can visitors expect? *<textarea name="description" required minLength={30} maxLength={6000} rows={6} value={value("description")} onChange={event => change("description", event.target.value)} className={inputClass} /><span className="font-normal text-muted">Include who is welcome, access rules, vehicle eligibility and what happens in bad weather. Plain text; 30–6,000 characters.</span></label>
      <div className="grid gap-4 sm:grid-cols-2">{field("start_date", "Start date", "date", true)}{field("start_time", "Start time", "time")}{field("end_date", "End date", "date")}{field("end_time", "End time", "time")}</div><p className="text-sm text-muted">Times are local UK time, using the 24-hour clock (09:30 or 14:00). Leave a time blank if it is not confirmed. For an overnight event, include the following day as the end date.</p>
    </fieldset>
    <fieldset className="grid gap-4"><legend className="mb-3 font-serif text-2xl font-semibold">Where to go</legend>
      {field("venue_name", "Venue name", "text", true)}{field("address", "Street address", "text", true, 300)}
      <div className="grid gap-4 sm:grid-cols-2">{field("town", "Town or city", "text", true, 100)}{field("county", "County", "text", false, 100)}{field("postcode", "Full UK postcode", "text", true, 12)}</div><p className="text-sm text-muted">For a road run, use the starting point. The postcode puts your event into nearby searches.</p>
    </fieldset>
    <fieldset className="grid gap-4"><legend className="mb-3 font-serif text-2xl font-semibold">Organiser and admission</legend>
      {field("organiser_name", "Organiser or club name", "text", true)}{field("organiser_url", "Official website or public event link", "url", true, 1000)}
      {field("price_text", "Admission and display prices", "text", true, 250)}<p className="text-sm text-muted">For example: Free admission; or £5 adults, children free, display cars £10.</p>
      <label className="flex items-start gap-3 text-sm"><input name="booking_required" type="checkbox" checked={bookingRequired} onChange={event => setBookingRequired(event.target.checked)} className="mt-1 h-5 w-5 accent-racing" />Visitors or exhibitors must book in advance</label>{field("booking_url", "Ticket or booking link", "url", false, 1000)}
    </fieldset>
    <fieldset className="grid gap-4"><legend className="mb-3 font-serif text-2xl font-semibold">Event photograph</legend>
      <label className="grid gap-2 text-sm font-bold">{event?.image_url ? "Replace current photograph (optional)" : "Upload a photograph (optional)"}<input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="focus-ring min-h-11 max-w-full rounded-md border border-ink/20 p-2 font-normal" /><span className="font-normal text-muted">JPEG, PNG or WebP, up to 3 MB. Use a real event photo or your own event poster. Your existing photo stays unless you upload a replacement.</span></label>
      <label className="flex items-start gap-3 text-sm"><input name="image_rights" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-racing" />I own this image or have permission to publish it on ClassicsGo.</label>
    </fieldset>
    <label className="flex items-start gap-3 text-sm"><input name="accurate" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-racing" />I confirm these details are accurate, the event is relevant to classic motoring, and this information can be published publicly. I will update the listing if plans change.</label>
    {state.message ? <p role="alert" className="rounded-md bg-oxblood/10 p-3 text-sm font-bold text-oxblood">{state.message}</p> : null}
    <button disabled={pending} className="focus-ring min-h-12 rounded-md bg-racing px-4 py-3 font-black text-paper disabled:opacity-60">{pending ? "Saving your event…" : event ? "Save changes" : "Publish event"}</button>
  </form>;
}

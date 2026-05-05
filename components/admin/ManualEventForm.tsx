import { eventTypes } from "@/lib/events";
import { createManualEvent } from "@/app/admin/events/actions";

export function ManualEventForm() {
  return (
    <form action={createManualEvent} className="grid gap-4 rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">
          Event name
          <input name="title" required className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Event type
          <select name="event_type" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3">
            {eventTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Start date
          <input name="start_date" type="date" required className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Town
          <input name="town" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          County
          <input name="county" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-bold">
        Description
        <textarea name="description" rows={4} className="focus-ring rounded-md border border-ink/15 bg-paper px-3 py-2" />
      </label>
      <button className="focus-ring w-fit rounded-md bg-racing px-4 py-2 text-sm font-black text-paper">Save draft</button>
    </form>
  );
}

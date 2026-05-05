"use client";

import { useActionState } from "react";
import { submitMissingEvent } from "@/app/submit-event/actions";

const initialState = { ok: false, message: "" };

export function SubmitEventForm() {
  const [state, formAction, pending] = useActionState(submitMissingEvent, initialState);
  return (
    <form action={formAction} className="mt-6 grid gap-4 rounded-lg border border-ink/10 bg-paper p-5 shadow-soft">
      <label className="grid gap-1 text-sm font-bold">Event name<input name="event_name" required className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
      <label className="grid gap-1 text-sm font-bold">Link<input name="event_url" type="url" required className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">Date if known<input name="event_date" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
        <label className="grid gap-1 text-sm font-bold">Location if known<input name="location_text" className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
      </div>
      <label className="grid gap-1 text-sm font-bold">Notes<textarea name="notes" rows={5} className="focus-ring rounded-md border border-ink/15 bg-paper px-3 py-2" /></label>
      <button disabled={pending} className="focus-ring rounded-md bg-racing px-4 py-2 text-sm font-black text-paper disabled:opacity-60">
        {pending ? "Submitting..." : "Submit for review"}
      </button>
      {state.message ? <p className={`text-sm font-bold ${state.ok ? "text-racing" : "text-oxblood"}`}>{state.message}</p> : null}
    </form>
  );
}

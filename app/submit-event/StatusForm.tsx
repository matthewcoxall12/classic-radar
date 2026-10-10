"use client";
import { useActionState } from "react";
import { setOwnEventStatus } from "./actions";
export function StatusForm({ eventId, cancelled }: { eventId: string; cancelled: boolean }) {
  const [state, action, pending] = useActionState(setOwnEventStatus, { ok: false, message: "" });
  return <form action={action}><input type="hidden" name="event_id" value={eventId} /><input type="hidden" name="status" value={cancelled ? "published" : "cancelled"} /><button disabled={pending} className="focus-ring min-h-11 font-bold text-oxblood underline disabled:opacity-60">{pending ? "Saving…" : cancelled ? "Restore listing" : "Cancel event"}</button>{state.message ? <p role={state.ok ? "status" : "alert"} className="mt-2 max-w-xs text-sm">{state.message}</p> : null}</form>;
}

import { CheckCircle2, CircleSlash, Pencil } from "lucide-react";
import { setEventStatus } from "@/app/admin/events/actions";
import Link from "next/link";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import type { ClassicEvent } from "@/lib/types";

export function AdminEventTable({ events }: { events: ClassicEvent[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-paper shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-cream text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3">
                  <div className="font-black text-ink">{event.title}</div>
                  <div className="mt-1"><EventTypeBadge type={event.event_type} /></div>
                </td>
                <td className="px-4 py-3 font-semibold">{event.start_date}</td>
                <td className="px-4 py-3 text-muted">{[event.town, event.county].filter(Boolean).join(", ")}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-ink/10 px-3 py-1 text-xs font-bold text-ink">{event.status}</span>
                </td>
                <td className="px-4 py-3 font-black">{event.confidence_score}</td>
                <td className="px-4 py-3">
                  <div className="flex min-w-36 flex-wrap items-center gap-2 text-muted">
                    <span title={event.is_verified ? "Verified" : "Not verified"}>
                      {event.is_verified ? <CheckCircle2 className="h-4 w-4 text-racing" /> : <CircleSlash className="h-4 w-4" />}
                    </span>
                    <Link href={`/admin/events/${event.id}`} className="focus-ring inline-flex items-center gap-1 rounded-md border border-ink/15 px-2.5 py-1.5 text-xs font-black text-ink"><Pencil className="h-3.5 w-3.5" /> Edit</Link>
                    {event.status !== "published" ? <StatusButton id={event.id} status="published">Publish</StatusButton> : <StatusButton id={event.id} status="draft">Unpublish</StatusButton>}
                    {event.status === "published" ? <StatusButton id={event.id} status="cancelled" muted>Cancel</StatusButton> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusButton({ id, status, muted = false, children }: { id: string; status: "draft" | "published" | "cancelled"; muted?: boolean; children: React.ReactNode }) {
  return (
    <form action={setEventStatus}>
      <input type="hidden" name="id" value={id} />
      <button name="status" value={status} className={`focus-ring rounded-md border px-2.5 py-1.5 text-xs font-black ${muted ? "border-oxblood/30 text-oxblood" : "border-racing/25 text-racing"}`}>
        {children}
      </button>
    </form>
  );
}

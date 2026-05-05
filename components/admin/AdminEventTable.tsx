import { CheckCircle2, CircleSlash, Pencil } from "lucide-react";
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
                  <div className="flex gap-2 text-muted">
                    <Pencil className="h-4 w-4" />
                    {event.is_verified ? <CheckCircle2 className="h-4 w-4 text-racing" /> : <CircleSlash className="h-4 w-4" />}
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

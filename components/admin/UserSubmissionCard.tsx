import { createDraftFromSubmission, mergeSubmission, rejectSubmission } from "@/app/admin/submissions/actions";
import { eventTypes } from "@/lib/events";
import type { UserSubmission } from "@/lib/types";
import { safeExternalUrl } from "@/lib/utils";

export function UserSubmissionCard({ submission }: { submission: UserSubmission }) {
  const sourceUrl = safeExternalUrl(submission.event_url);
  const submittedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(submission.created_at));

  return (
    <article className="rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-ink">{submission.event_name}</h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            {[submission.event_date, submission.location_text].filter(Boolean).join(" · ") || "Date and location not supplied"}
          </p>
          <p className="mt-1 text-xs font-bold text-muted">Submitted {submittedAt}</p>
          {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-sm font-black text-racing">Open submitted source</a> : null}
        </div>
        <span className="w-fit rounded-full bg-brass/20 px-3 py-1 text-xs font-black uppercase text-ink">{submission.status}</span>
      </div>
      {submission.notes ? <p className="mt-3 whitespace-pre-wrap rounded-md bg-cream p-3 text-sm leading-6 text-muted">{submission.notes}</p> : null}
      {submission.status === "pending" ? (
        <div className="mt-4 grid gap-3">
          <details className="rounded-md border border-ink/10 p-3" open={Boolean(submission.event_date)}>
            <summary className="cursor-pointer text-sm font-black">Create a reviewed draft</summary>
            <form action={createDraftFromSubmission} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={submission.id} />
              <label className="grid gap-1 text-sm font-bold">Start date<input name="start_date" type="date" required defaultValue={submission.event_date ?? ""} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
              <label className="grid gap-1 text-sm font-bold">Event type<select name="event_type" className="focus-ring min-h-10 rounded-md border border-ink/15 px-3">{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-bold sm:col-span-2">Town or place<input name="town" defaultValue={submission.location_text} maxLength={120} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
              <p className="text-xs leading-5 text-muted sm:col-span-2">This creates an unpublished, unverified draft. Review its full details in Events before publishing.</p>
              <button className="focus-ring w-fit rounded-md bg-racing px-3 py-2 text-xs font-black text-paper sm:col-span-2">Create draft</button>
            </form>
          </details>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <form action={mergeSubmission} className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={submission.id} />
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-bold">Existing event ID<input name="event_id" required aria-label="Existing event ID" className="focus-ring min-h-10 min-w-0 rounded-md border border-ink/15 px-3" /></label>
              <button className="focus-ring min-h-10 rounded-md border border-racing/25 px-3 text-xs font-black text-racing">Mark as duplicate</button>
            </form>
            <form action={rejectSubmission}>
              <input type="hidden" name="id" value={submission.id} />
              <button className="focus-ring min-h-10 rounded-md border border-oxblood/30 px-3 text-xs font-black text-oxblood">Reject submission</button>
            </form>
          </div>
        </div>
      ) : null}
    </article>
  );
}

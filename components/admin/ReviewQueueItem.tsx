import { approveReviewItem, mergeReviewItem, rejectReviewItem } from "@/app/admin/review/actions";
import type { ReviewQueueItemType } from "@/lib/types";

export function ReviewQueueItem({ item }: { item: ReviewQueueItemType }) {
  const title = String(item.proposed_event.title ?? item.proposed_event.event_name ?? "Untitled event");
  const sourceType = String(item.proposed_event.source_type ?? "unknown");
  const rawSnippet = String(item.proposed_event.raw_snippet ?? item.proposed_event.description ?? "");
  return (
    <article className="rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="mt-1 text-sm text-muted">{item.reason}</p>
          <p className="mt-2 text-xs font-black uppercase text-muted">Source type: {sourceType}</p>
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-bold text-racing">
              Source URL
            </a>
          ) : null}
        </div>
        <span className="rounded-full bg-brass/15 px-3 py-1 text-xs font-black text-ink">Confidence {item.confidence_score}</span>
      </div>
      {rawSnippet ? <p className="mt-3 rounded-md bg-cream p-3 text-sm text-muted">{rawSnippet}</p> : null}
      <pre className="mt-3 overflow-x-auto rounded-md bg-cream p-3 text-xs text-ink">{JSON.stringify(item.proposed_event, null, 2)}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={approveReviewItem}>
          <input type="hidden" name="id" value={item.id} />
          <button className="rounded-md bg-racing px-3 py-2 text-xs font-black text-paper">Approve as published</button>
        </form>
        <form action={rejectReviewItem}>
          <input type="hidden" name="id" value={item.id} />
          <button className="rounded-md bg-oxblood px-3 py-2 text-xs font-black text-paper">Reject</button>
        </form>
      </div>
      <details className="mt-3 rounded-md border border-ink/10 bg-paper p-3">
        <summary className="cursor-pointer text-sm font-black">Edit before publishing</summary>
        <form action={approveReviewItem} className="mt-3 grid gap-3">
          <input type="hidden" name="id" value={item.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold">Title<input name="title" defaultValue={title} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
            <label className="grid gap-1 text-sm font-bold">Start date<input name="start_date" type="date" defaultValue={String(item.proposed_event.start_date ?? "")} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
            <label className="grid gap-1 text-sm font-bold">Event type<input name="event_type" defaultValue={String(item.proposed_event.event_type ?? "Classic car show")} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
            <label className="grid gap-1 text-sm font-bold">Venue<input name="venue_name" defaultValue={String(item.proposed_event.venue_name ?? "")} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
            <label className="grid gap-1 text-sm font-bold">Town<input name="town" defaultValue={String(item.proposed_event.town ?? "")} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
            <label className="grid gap-1 text-sm font-bold">Postcode<input name="postcode" defaultValue={String(item.proposed_event.postcode ?? "")} className="focus-ring min-h-10 rounded-md border border-ink/15 px-3" /></label>
          </div>
          <label className="grid gap-1 text-sm font-bold">Description<textarea name="description" rows={3} defaultValue={String(item.proposed_event.description ?? "")} className="focus-ring rounded-md border border-ink/15 px-3 py-2" /></label>
          <button className="w-fit rounded-md bg-racing px-3 py-2 text-xs font-black text-paper">Publish edited event</button>
        </form>
      </details>
      <details className="mt-3 rounded-md border border-ink/10 bg-paper p-3">
        <summary className="cursor-pointer text-sm font-black">Merge with existing event</summary>
        <form action={mergeReviewItem} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="id" value={item.id} />
          <input name="event_id" aria-label="Existing event ID" className="focus-ring min-h-10 flex-1 rounded-md border border-ink/15 px-3" />
          <button className="rounded-md border border-ink/15 px-3 py-2 text-xs font-black">Mark merged</button>
        </form>
      </details>
    </article>
  );
}

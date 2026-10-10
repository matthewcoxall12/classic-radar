"use client";
import { useActionState, useState } from "react";
import { deleteEventReview, saveEventReview, type ReviewActionState } from "@/app/events/reviews/actions";
import type { EventReview } from "@/lib/event-reviews";

export function EventReviewForm({ eventId, ownReview }: { eventId: string; ownReview: EventReview | null }) {
  const [rating, setRating] = useState(ownReview ? String(ownReview.rating) : "");
  const [body, setBody] = useState(ownReview?.body ?? "");
  const [experience, setExperience] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [hasReview, setHasReview] = useState(Boolean(ownReview));
  const [state, action, pending] = useActionState(async (previous: ReviewActionState, data: FormData) => {
    const result = data.get("intent") === "delete"
      ? await deleteEventReview(previous, data)
      : await saveEventReview(previous, data);
    if (result.ok && result.deleted) { setHasReview(false); setRating(""); setBody(""); setExperience(false); setDeleteConfirmed(false); }
    else if (result.ok && result.saved) { setHasReview(true); setDeleteConfirmed(false); }
    return result;
  }, { ok: false, message: "" });
  return <form action={action} className="mt-6 grid gap-4 rounded-lg border border-ink/15 bg-paper p-5">
    <input type="hidden" name="event_id" value={eventId} />
    <h3 className="font-serif text-2xl font-semibold">{hasReview ? "Your review" : "Share your experience"}</h3>
    <p className="text-sm leading-6 text-muted">Share what helped you enjoy the day and what could be improved. Your profile display name and review are public; your email is not shown. One review per person, per event.</p>
    <label className="grid gap-2 text-sm font-bold">Your rating<select name="rating" required value={rating} onChange={event => setRating(event.target.value)} className="focus-ring min-h-11 rounded-md border border-ink/20 bg-paper px-3"><option value="">Choose a rating</option><option value="5">5 stars — Excellent</option><option value="4">4 stars — Good</option><option value="3">3 stars — Okay</option><option value="2">2 stars — Disappointing</option><option value="1">1 star — Poor</option></select></label>
    <label className="grid gap-2 text-sm font-bold">Your experience<textarea name="body" required minLength={20} maxLength={2000} rows={5} value={body} onChange={event => setBody(event.target.value)} className="focus-ring rounded-md border border-ink/20 bg-paper px-3 py-2 font-normal" /><span className="font-normal text-muted">{body.length.toLocaleString("en-GB")} / 2,000 characters. Be specific, fair and respectful. Do not include private contact details.</span></label>
    <label className="flex items-start gap-3 text-sm leading-6"><input name="experience" type="checkbox" required checked={experience} onChange={event => setExperience(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-racing" />This review reflects my own experience of this event and is suitable for public sharing.</label>
    <button name="intent" value="save" disabled={pending} className="focus-ring min-h-11 rounded-md bg-racing px-5 py-3 font-bold text-paper disabled:opacity-60">{pending ? "Saving…" : hasReview ? "Update your review" : "Publish your review"}</button>
    {hasReview ? <div className="mt-2 grid gap-2 border-t border-ink/10 pt-4"><label className="flex items-start gap-3 text-sm"><input name="delete_confirmed" type="checkbox" checked={deleteConfirmed} onChange={event => setDeleteConfirmed(event.target.checked)} className="h-5 w-5 shrink-0 accent-oxblood" />I want to permanently remove my review.</label><button name="intent" value="delete" formNoValidate disabled={pending || !deleteConfirmed} className="focus-ring min-h-11 w-fit font-bold text-oxblood underline disabled:opacity-50">Remove your review</button></div> : null}
    {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm font-bold ${state.ok ? "text-racing" : "text-oxblood"}`}>{state.message}</p> : null}
  </form>;
}

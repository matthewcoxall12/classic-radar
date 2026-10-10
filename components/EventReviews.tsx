import Link from "next/link";
import { Star } from "lucide-react";
import { EventReviewForm } from "@/components/EventReviewForm";
import { REVIEWS_PER_PAGE, type getEventReviews } from "@/lib/event-reviews";
import type { ClassicEvent } from "@/lib/types";
import { absoluteUrl } from "@/lib/site";

type ReviewData = Awaited<ReturnType<typeof getEventReviews>>;
export function EventReviews({ event, viewerId, data }: { event: ClassicEvent; viewerId?: string; page: number; data: ReviewData | null }) {
  if (!data) return <section id="reviews" className="mt-10 border-t border-ink/15 pt-7"><h2 className="font-serif text-3xl font-semibold">Member reviews</h2><p className="mt-3 text-sm leading-7 text-muted">{event.status === "cancelled" ? "Reviews are unavailable for cancelled events." : "Reviews open after the event's final day has finished in UK time. Come back afterwards to share your experience."}</p></section>;
  if (data.unavailable) return <section id="reviews" className="mt-10 border-t border-ink/15 pt-7"><h2 className="font-serif text-3xl font-semibold">Member reviews</h2><p role="status" className="mt-3 text-sm text-muted">Reviews could not be loaded. Please refresh the page to try again.</p></section>;
  const lastPage = Math.max(1, Math.ceil(data.count / REVIEWS_PER_PAGE));
  const page = data.page;
  return <section id="reviews" className="mt-10 border-t border-ink/15 pt-7">
    <h2 className="font-serif text-3xl font-semibold">Member reviews</h2>
    <p className="mt-3 flex items-center gap-2 font-bold">{data.count && data.average != null ? <><Star size={20} className="fill-brass text-brass" aria-hidden="true" />{data.average.toFixed(1)} out of 5 <span className="font-normal text-muted">from {data.count.toLocaleString("en-GB")} {data.count === 1 ? "review" : "reviews"}</span></> : "Be the first to review this event"}</p>
    <p className="mt-2 text-sm leading-6 text-muted">Members share their own opinions. Attendance is not independently verified.</p>
    {data.reviews.length ? <ol className="mt-6 grid gap-5">{data.reviews.map(review => {
      const report = `mailto:matthewcoxall@googlemail.com?subject=${encodeURIComponent(`Report event review: ${event.title}`)}&body=${encodeURIComponent(`Event: ${absoluteUrl(`/events/${event.slug}#reviews`)}\nReview ID: ${review.id}\n\nPlease explain what is inappropriate or incorrect:\n`)}`;
      return <li key={review.id} className="rounded-lg border border-ink/15 bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{review.reviewer_name}{review.id === data.ownReview?.id ? " · You" : ""}</h3><p className="flex items-center gap-1 text-sm font-bold"><Star size={15} className="fill-brass text-brass" aria-hidden="true" /><span>{review.rating} out of 5</span></p></div>
        <p className="mt-1 text-xs text-muted">{new Date(review.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}{review.updated_at > review.created_at ? " · Edited" : ""}</p>
        <p className="mt-4 whitespace-pre-line break-words text-sm leading-7">{review.body}</p>
        <a href={report} className="focus-ring mt-4 inline-flex min-h-11 items-center text-xs font-bold text-muted underline">Report this review</a>
      </li>;
    })}</ol> : data.count ? <p className="mt-6 text-sm text-muted">There are no reviews on this page. Use the page links below.</p> : <p className="mt-6 text-sm text-muted">No reviews yet. Useful details about access, atmosphere and facilities can help other enthusiasts plan their next visit.</p>}
    {lastPage > 1 ? <nav aria-label="Review pages" className="mt-5 flex flex-wrap items-center gap-5 text-sm font-bold">{page > 1 ? <Link href={`/events/${event.slug}?review_page=${Math.min(lastPage, page - 1)}#reviews`} className="focus-ring min-h-11 content-center underline">Previous reviews</Link> : null}<span>Page {page} of {lastPage}</span>{page < lastPage ? <Link href={`/events/${event.slug}?review_page=${page + 1}#reviews`} className="focus-ring min-h-11 content-center underline">Next reviews</Link> : null}</nav> : null}
    {viewerId ? <EventReviewForm eventId={event.id} ownReview={data.ownReview} /> : <p className="mt-6 rounded-lg bg-cream p-5 text-sm"><Link href={`/sign-in?return_to=${encodeURIComponent(`/events/${event.slug}#reviews`)}`} className="focus-ring font-bold underline">Sign in to write a review</Link>. Reviewing is free for ClassicsGo members.</p>}
  </section>;
}

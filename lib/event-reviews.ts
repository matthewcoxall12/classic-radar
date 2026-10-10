import { createClient } from "@/lib/supabase/server";
export type EventReview = {
  id: string; event_id: string; user_id?: string; rating: number; body: string;
  reviewer_name: string; created_at: string; updated_at: string;
};
export const REVIEWS_PER_PAGE = 10;
export async function getEventReviews(eventId: string, viewerId?: string, page = 1) {
  const supabase = await createClient();
  const from = (page - 1) * REVIEWS_PER_PAGE;
  const [list, summary, own] = await Promise.all([
    supabase.from("event_reviews").select("id,event_id,rating,body,reviewer_name,created_at,updated_at").eq("event_id", eventId).order("created_at", { ascending: false }).order("id").range(from, from + REVIEWS_PER_PAGE - 1),
    supabase.rpc("event_review_summary", { p_event_id: eventId }),
    viewerId ? supabase.from("event_reviews").select("id,event_id,user_id,rating,body,reviewer_name,created_at,updated_at").eq("event_id", eventId).eq("user_id", viewerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  let error = list.error || summary.error || own.error;
  const totals = summary.data?.[0];
  const count = Number(totals?.review_count ?? 0);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(count / REVIEWS_PER_PAGE)));
  let reviews = list.data;
  if (!error && currentPage !== page) {
    const offset = (currentPage - 1) * REVIEWS_PER_PAGE;
    const corrected = await supabase.from("event_reviews").select("id,event_id,rating,body,reviewer_name,created_at,updated_at").eq("event_id", eventId).order("created_at", { ascending: false }).order("id").range(offset, offset + REVIEWS_PER_PAGE - 1);
    reviews = corrected.data; error = corrected.error;
  }
  if (error) console.error("ClassicsGo event reviews query failed", { code: error.code });
  return {
    reviews: (reviews ?? []) as EventReview[], ownReview: own.data as EventReview | null,
    count, page: currentPage, average: totals?.average_rating == null ? null : Number(totals.average_rating),
    unavailable: Boolean(error),
  };
}

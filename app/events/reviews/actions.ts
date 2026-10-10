"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canReviewEvent, parseReviewInput } from "@/lib/event-reviews-validation";
export type ReviewActionState = { ok: boolean; message: string; saved?: { rating: number; body: string }; deleted?: boolean };

export async function saveEventReview(_previous: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  let committed = false;
  let saved: { rating: number; body: string } | undefined;
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) return { ok: false, message: "Please sign in with your account to write a review." };
    const eventId = String(formData.get("event_id") ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) return { ok: false, message: "This event could not be found. Please refresh the page." };
    const input = parseReviewInput(formData.get("rating"), formData.get("body"));
    if (formData.get("experience") !== "on") return { ok: false, message: "Please confirm the review reflects your own experience." };
    const { data: event, error: eventError } = await supabase.from("events").select("slug,start_date,end_date,status").eq("id", eventId).eq("status", "published").maybeSingle();
    if (eventError || !event || !canReviewEvent(event)) return { ok: false, message: "Reviews open after the event's final day has finished in UK time." };
    const { data: own, error: ownError } = await supabase.from("event_reviews").select("id").eq("event_id", eventId).eq("user_id", auth.user.id).maybeSingle();
    if (ownError) throw new Error("Your review could not be loaded. Please try again.");
    const result = own
      ? await supabase.from("event_reviews").update(input).eq("id", own.id).eq("user_id", auth.user.id).select("id").single()
      : await supabase.from("event_reviews").insert({ ...input, event_id: eventId, user_id: auth.user.id }).select("id").single();
    if (result.error) {
      console.error("ClassicsGo review save failed", { code: result.error.code });
      if (result.error.code === "23505") throw new Error("You already have a review for this event. Refresh to edit it.");
      if (result.error.message.includes("daily review writing limit")) throw new Error("You have reached today's review writing limit. Please try again tomorrow.");
      throw new Error("Your review could not be saved. Your text is still here; please try again.");
    }
    committed = true; saved = input;
    revalidatePath(`/events/${event.slug}`);
    return { ok: true, message: own ? "Your review has been updated." : "Your review is published. Thank you for helping other enthusiasts.", saved: input };
  } catch (error) {
    if (committed) return { ok: true, message: "Your review has been saved.", saved };
    return { ok: false, message: error instanceof Error ? error.message : "We could not save your review. Please try again." };
  }
}

export async function deleteEventReview(_previous: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  let committed = false;
  try {
    if (formData.get("delete_confirmed") !== "on") return { ok: false, message: "Please tick the confirmation box before removing your review." };
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { ok: false, message: "Please sign in again to remove your review." };
    const eventId = String(formData.get("event_id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, message: "This review could not be found." };
    const { data: deleted, error } = await supabase.from("event_reviews").delete().eq("event_id", eventId).eq("user_id", auth.user.id).select("id").maybeSingle();
    if (error || !deleted) return { ok: false, message: "Your review could not be removed. Please refresh and try again." };
    committed = true;
    const { data: event } = await supabase.from("events").select("slug").eq("id", eventId).maybeSingle();
    if (event) revalidatePath(`/events/${event.slug}`);
    return { ok: true, message: "Your review has been removed.", deleted: true };
  } catch {
    return committed ? { ok: true, message: "Your review has been removed.", deleted: true } : { ok: false, message: "We could not remove your review. Please try again." };
  }
}

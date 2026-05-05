"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export async function approveReviewItem(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return;
  const id = String(formData.get("id") ?? "");
  const { data: item } = await supabase.from("review_queue").select("*").eq("id", id).single();
  if (!item) return;
  const proposed = item.proposed_event as Record<string, string | number | boolean | null | undefined>;
  const title = String(formData.get("title") || proposed.title || proposed.event_name || "Reviewed event");
  const startDate = String(formData.get("start_date") || proposed.start_date || new Date().toISOString().slice(0, 10));
  const { data: event } = await supabase
    .from("events")
    .insert({
      title,
      slug: `${slugify(title)}-${startDate}`,
      description: String(formData.get("description") || proposed.description || ""),
      event_type: String(formData.get("event_type") || proposed.event_type || "Classic car show"),
      start_date: startDate,
      start_time: proposed.start_time ? String(proposed.start_time) : null,
      venue_name: String(formData.get("venue_name") || proposed.venue_name || ""),
      town: String(formData.get("town") || proposed.town || ""),
      county: String(formData.get("county") || proposed.county || ""),
      postcode: String(formData.get("postcode") || proposed.postcode || ""),
      latitude: typeof proposed.latitude === "number" ? proposed.latitude : null,
      longitude: typeof proposed.longitude === "number" ? proposed.longitude : null,
      booking_url: proposed.booking_url ? String(proposed.booking_url) : item.source_url,
      image_url: proposed.image_url ? String(proposed.image_url) : null,
      status: "published",
      confidence_score: item.confidence_score,
      is_verified: true,
      source_count: item.source_url ? 1 : 0,
      last_checked_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (event?.id && item.source_url) {
    await supabase.from("event_sources").insert({
      event_id: event.id,
      source_url: item.source_url,
      source_title: proposed.sourceTitle ? String(proposed.sourceTitle) : title,
      source_type: proposed.source_type ? String(proposed.source_type) : "unknown",
      raw_excerpt: proposed.raw_snippet ? String(proposed.raw_snippet) : null,
      confidence_score: item.confidence_score,
      last_seen_at: new Date().toISOString()
    });
  }
  await supabase.from("review_queue").update({ status: "approved" }).eq("id", id);
  revalidatePath("/admin/review");
}

export async function rejectReviewItem(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.from("review_queue").update({ status: "rejected" }).eq("id", String(formData.get("id") ?? ""));
  revalidatePath("/admin/review");
}

export async function mergeReviewItem(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return;
  const id = String(formData.get("id") ?? "");
  const existingEventId = String(formData.get("event_id") ?? "");
  if (!id || !existingEventId) return;
  await supabase
    .from("review_queue")
    .update({ status: "merged", reason: `Merged with existing event ${existingEventId}` })
    .eq("id", id);
  revalidatePath("/admin/review");
}

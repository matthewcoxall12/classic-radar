"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

type ProposedEvent = Record<string, string | number | boolean | null | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formOrProposed(formData: FormData, name: string, proposed: ProposedEvent, fallback = "") {
  const submitted = formData.get(name);
  return String(submitted == null || submitted === "" ? proposed[name] ?? fallback : submitted).trim();
}

async function adminContext() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return null;
  return { viewer, supabase: await createClient() };
}

export async function approveReviewItem(formData: FormData) {
  const context = await adminContext();
  if (!context) return;
  const { supabase, viewer } = context;
  const reviewId = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(reviewId)) return;

  const { data: item, error: itemError } = await supabase
    .from("review_queue")
    .select("*")
    .eq("id", reviewId)
    .eq("status", "pending")
    .maybeSingle();
  if (itemError || !item) return;

  const proposed = item.proposed_event as ProposedEvent;
  const proposedId = String(proposed.id ?? "");
  const title = formOrProposed(formData, "title", proposed, "Reviewed event").slice(0, 180);
  const startDate = formOrProposed(formData, "start_date", proposed, new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (title.length < 3 || !/^20\d{2}-\d{2}-\d{2}$/.test(startDate)) return;

  const eventPatch = {
    title,
    description: formOrProposed(formData, "description", proposed).slice(0, 4_000),
    event_type: formOrProposed(formData, "event_type", proposed, "Classic car show").slice(0, 80),
    start_date: startDate,
    start_time: proposed.start_time ? String(proposed.start_time) : null,
    end_date: proposed.end_date ? String(proposed.end_date) : null,
    end_time: proposed.end_time ? String(proposed.end_time) : null,
    timezone: String(proposed.timezone || "Europe/London").slice(0, 80),
    venue_name: formOrProposed(formData, "venue_name", proposed).slice(0, 180) || null,
    address: proposed.address ? String(proposed.address).slice(0, 500) : null,
    town: formOrProposed(formData, "town", proposed).slice(0, 120) || null,
    county: formOrProposed(formData, "county", proposed).slice(0, 120) || null,
    country_code: /^[A-Z]{2}$/.test(String(proposed.country_code)) ? String(proposed.country_code) : "GB",
    postcode: formOrProposed(formData, "postcode", proposed).slice(0, 16) || null,
    latitude: typeof proposed.latitude === "number" ? proposed.latitude : null,
    longitude: typeof proposed.longitude === "number" ? proposed.longitude : null,
    price_text: proposed.price_text ? String(proposed.price_text).slice(0, 120) : null,
    booking_required: Boolean(proposed.booking_required),
    booking_url: proposed.booking_url ? String(proposed.booking_url).slice(0, 2_000) : item.source_url,
    organiser_name: proposed.organiser_name ? String(proposed.organiser_name).slice(0, 180) : null,
    organiser_url: proposed.organiser_url ? String(proposed.organiser_url).slice(0, 2_000) : null,
    image_url: proposed.image_url ? String(proposed.image_url).slice(0, 2_000) : null,
    status: "published",
    confidence_score: item.confidence_score,
    is_verified: true,
    last_checked_at: new Date().toISOString()
  };

  let event: { id: string } | null = null;
  if (UUID_PATTERN.test(proposedId)) {
    const result = await supabase.from("events").update(eventPatch).eq("id", proposedId).select("id").maybeSingle();
    if (result.error) return;
    event = result.data;
  }
  if (!event) {
    const result = await supabase
      .from("events")
      .update(eventPatch)
      .eq("dedupe_key", item.candidate_key)
      .select("id")
      .maybeSingle();
    if (result.error) return;
    event = result.data;
  }
  if (!event) {
    const suffix = item.candidate_key.slice(0, 8);
    const result = await supabase
      .from("events")
      .insert({
        ...(UUID_PATTERN.test(proposedId) ? { id: proposedId } : {}),
        ...eventPatch,
        slug: String(proposed.slug || `${slugify(title)}-${startDate}-${suffix}`).slice(0, 180),
        dedupe_key: item.candidate_key,
        source_count: item.source_url ? 1 : 0
      })
      .select("id")
      .single();
    if (result.error || !result.data) return;
    event = result.data;
  }

  if (item.source_url) {
    const { error: sourceError } = await supabase.from("event_sources").upsert(
      {
        event_id: event.id,
        source_url: item.source_url,
        canonical_url: item.source_url,
        source_title: proposed.source_title ? String(proposed.source_title).slice(0, 300) : title,
        source_type: proposed.source_type ? String(proposed.source_type).slice(0, 40) : "unknown",
        provider: proposed.provider ? String(proposed.provider).slice(0, 80) : "admin_review",
        raw_excerpt: proposed.raw_excerpt ? String(proposed.raw_excerpt).slice(0, 1_000) : null,
        confidence_score: item.confidence_score,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "event_id,canonical_url" }
    );
    if (sourceError) return;
  }

  const { count } = await supabase
    .from("event_sources")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);
  await supabase.from("events").update({ source_count: count ?? 0 }).eq("id", event.id);
  await supabase
    .from("review_queue")
    .update({ status: "approved", reviewed_by: viewer.id, reviewed_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("status", "pending");
  revalidatePath("/admin/review");
  revalidatePath("/events");
}

export async function rejectReviewItem(formData: FormData) {
  const context = await adminContext();
  if (!context) return;
  const { supabase, viewer } = context;
  const reviewId = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(reviewId)) return;
  const { data: item } = await supabase.from("review_queue").select("proposed_event").eq("id", reviewId).eq("status", "pending").maybeSingle();
  if (!item) return;
  const proposed = item.proposed_event as ProposedEvent;
  const proposedId = String(proposed.id ?? "");
  if (UUID_PATTERN.test(proposedId)) await supabase.from("events").update({ status: "rejected" }).eq("id", proposedId).eq("status", "review");
  await supabase
    .from("review_queue")
    .update({ status: "rejected", reviewed_by: viewer.id, reviewed_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("status", "pending");
  revalidatePath("/admin/review");
}

export async function mergeReviewItem(formData: FormData) {
  const context = await adminContext();
  if (!context) return;
  const { supabase, viewer } = context;
  const reviewId = String(formData.get("id") ?? "");
  const existingEventId = String(formData.get("event_id") ?? "");
  if (!UUID_PATTERN.test(reviewId) || !UUID_PATTERN.test(existingEventId)) return;

  const { data: item } = await supabase.from("review_queue").select("*").eq("id", reviewId).eq("status", "pending").maybeSingle();
  const { data: target } = await supabase.from("events").select("id").eq("id", existingEventId).maybeSingle();
  if (!item || !target) return;
  const proposed = item.proposed_event as ProposedEvent;
  if (item.source_url) {
    const { error } = await supabase.from("event_sources").upsert(
      {
        event_id: target.id,
        source_url: item.source_url,
        canonical_url: item.source_url,
        source_title: proposed.source_title ? String(proposed.source_title).slice(0, 300) : String(proposed.title || "Merged source"),
        source_type: proposed.source_type ? String(proposed.source_type).slice(0, 40) : "unknown",
        provider: "admin_merge",
        confidence_score: item.confidence_score,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "event_id,canonical_url" }
    );
    if (error) return;
  }
  const proposedId = String(proposed.id ?? "");
  if (UUID_PATTERN.test(proposedId) && proposedId !== target.id) {
    await supabase.from("events").update({ status: "rejected" }).eq("id", proposedId).eq("status", "review");
  }
  const { count } = await supabase.from("event_sources").select("id", { count: "exact", head: true }).eq("event_id", target.id);
  await supabase.from("events").update({ source_count: count ?? 0 }).eq("id", target.id);
  await supabase
    .from("review_queue")
    .update({
      status: "merged",
      reason: `Merged with existing event ${target.id}`,
      reviewed_by: viewer.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", reviewId)
    .eq("status", "pending");
  revalidatePath("/admin/review");
  revalidatePath("/events");
}

"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { eventTypes } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { safeExternalUrl, slugify } from "@/lib/utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function adminClient() {
  const viewer = await getViewer();
  return viewer?.isAdmin ? createClient() : null;
}

export async function createManualEvent(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) return;

  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  const startDate = String(formData.get("start_date") ?? "").slice(0, 10);
  const town = String(formData.get("town") ?? "").trim().slice(0, 120);
  const requestedType = String(formData.get("event_type") ?? "Classic car show");
  if (title.length < 3 || !/^20\d{2}-\d{2}-\d{2}$/.test(startDate)) return;
  const eventType = eventTypes.includes(requestedType as (typeof eventTypes)[number]) ? requestedType : "Classic car show";

  await supabase.from("events").insert({
    title,
    slug: `${slugify(title)}-${Date.now().toString(36)}`,
    dedupe_key: slugify(`${title}-${startDate}-${town || "unknown"}`),
    event_type: eventType,
    start_date: startDate,
    town,
    county: String(formData.get("county") ?? "").trim().slice(0, 120),
    description: String(formData.get("description") ?? "").trim().slice(0, 4_000),
    status: "draft",
    confidence_score: 100,
    is_verified: true,
    source_count: 0,
    last_checked_at: new Date().toISOString()
  });

  revalidatePath("/admin/events");
}

export async function setEventStatus(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID_PATTERN.test(id) || !["draft", "published", "cancelled"].includes(status)) return;

  const patch = status === "published"
    ? { status, is_verified: true, last_checked_at: new Date().toISOString() }
    : { status };
  await supabase.from("events").update(patch).eq("id", id);
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/");
}

export async function updateAdminEvent(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) return;
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  const startDate = String(formData.get("start_date") ?? "").slice(0, 10);
  const endDate = String(formData.get("end_date") ?? "").slice(0, 10);
  const requestedType = String(formData.get("event_type") ?? "Classic car show");
  if (!UUID_PATTERN.test(id) || title.length < 3 || !/^20\d{2}-\d{2}-\d{2}$/.test(startDate)) return;
  if (endDate && (!/^20\d{2}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate)) return;
  const eventType = eventTypes.includes(requestedType as (typeof eventTypes)[number]) ? requestedType : "Classic car show";
  const countryCode = String(formData.get("country_code") ?? "GB").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return;

  const organiserUrlInput = String(formData.get("organiser_url") ?? "").trim();
  const bookingUrlInput = String(formData.get("booking_url") ?? "").trim();
  const organiserUrl = organiserUrlInput ? safeExternalUrl(organiserUrlInput) : null;
  const bookingUrl = bookingUrlInput ? safeExternalUrl(bookingUrlInput) : null;
  if ((organiserUrlInput && !organiserUrl) || (bookingUrlInput && !bookingUrl)) return;

  await supabase.from("events").update({
    title,
    event_type: eventType,
    start_date: startDate,
    end_date: endDate || null,
    venue_name: String(formData.get("venue_name") ?? "").trim().slice(0, 180) || null,
    town: String(formData.get("town") ?? "").trim().slice(0, 120) || null,
    county: String(formData.get("county") ?? "").trim().slice(0, 120) || null,
    postcode: String(formData.get("postcode") ?? "").trim().slice(0, 16) || null,
    country_code: countryCode,
    price_text: String(formData.get("price_text") ?? "").trim().slice(0, 120) || null,
    booking_required: formData.get("booking_required") === "on",
    booking_url: bookingUrl,
    organiser_name: String(formData.get("organiser_name") ?? "").trim().slice(0, 180) || null,
    organiser_url: organiserUrl,
    description: String(formData.get("description") ?? "").trim().slice(0, 4_000),
    updated_at: new Date().toISOString()
  }).eq("id", id);

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${id}`);
  revalidatePath("/events");
  revalidatePath("/");
}

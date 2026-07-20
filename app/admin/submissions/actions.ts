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

function validCalendarDate(value: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function createDraftFromSubmission(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) return;

  const submissionId = String(formData.get("id") ?? "");
  const startDate = String(formData.get("start_date") ?? "").slice(0, 10);
  const requestedType = String(formData.get("event_type") ?? "Classic car show");
  if (!UUID_PATTERN.test(submissionId) || !validCalendarDate(startDate)) return;
  const eventType = eventTypes.includes(requestedType as (typeof eventTypes)[number])
    ? requestedType
    : "Classic car show";

  const { data: submission, error: submissionError } = await supabase
    .from("user_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("status", "pending")
    .maybeSingle();
  if (submissionError || !submission) return;

  const title = String(submission.event_name).trim().slice(0, 180);
  const town = String(formData.get("town") ?? submission.location_text ?? "").trim().slice(0, 120);
  const sourceUrl = safeExternalUrl(String(submission.event_url ?? ""));
  const slugBase = slugify(title) || "submitted-event";
  const submissionSuffix = submissionId.replaceAll("-", "").slice(0, 10);
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      title,
      slug: `${slugBase}-${startDate}-${submissionSuffix}`.slice(0, 180),
      dedupe_key: `user-submission-${submissionId}`,
      description: String(submission.notes ?? "").trim().slice(0, 4_000),
      event_type: eventType,
      start_date: startDate,
      town: town || null,
      booking_url: sourceUrl,
      status: "draft",
      confidence_score: 50,
      is_verified: false,
      source_count: 0
    })
    .select("id")
    .single();
  if (eventError || !event) return;

  const { data: updatedSubmission, error: statusError } = await supabase
    .from("user_submissions")
    .update({ status: "approved" })
    .eq("id", submissionId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (statusError || !updatedSubmission) {
    await supabase.from("events").delete().eq("id", event.id).eq("status", "draft");
    return;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath("/admin/submissions");
}

export async function rejectSubmission(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) return;
  const submissionId = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(submissionId)) return;
  await supabase
    .from("user_submissions")
    .update({ status: "rejected" })
    .eq("id", submissionId)
    .eq("status", "pending");
  revalidatePath("/admin");
  revalidatePath("/admin/submissions");
}

export async function mergeSubmission(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) return;
  const submissionId = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  if (!UUID_PATTERN.test(submissionId) || !UUID_PATTERN.test(eventId)) return;

  const { data: event } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!event) return;
  await supabase
    .from("user_submissions")
    .update({ status: "merged" })
    .eq("id", submissionId)
    .eq("status", "pending");
  revalidatePath("/admin");
  revalidatePath("/admin/submissions");
}

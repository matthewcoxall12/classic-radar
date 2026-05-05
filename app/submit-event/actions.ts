"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitMissingEvent(_prevState: { ok: boolean; message: string }, formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return { ok: true, message: "Submission captured in demo mode." };

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please sign in before submitting an event." };

  const submission = {
    submitted_by: user.id,
    event_name: String(formData.get("event_name") ?? ""),
    event_url: String(formData.get("event_url") ?? ""),
    event_date: String(formData.get("event_date") ?? ""),
    location_text: String(formData.get("location_text") ?? ""),
    notes: String(formData.get("notes") ?? "")
  };

  const { error } = await supabase.from("user_submissions").insert(submission);
  if (error) return { ok: false, message: error.message };

  await supabase.from("review_queue").insert({
    proposed_event: submission,
    source_url: submission.event_url || null,
    reason: "User-submitted missing event.",
    confidence_score: 50
  });

  revalidatePath("/admin/review");
  return { ok: true, message: "Thanks. The event has been sent to the admin review queue." };
}

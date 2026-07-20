"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitMissingEvent(_prevState: { ok: boolean; message: string }, formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return { ok: false, message: "Please sign in before submitting an event." };

  const eventName = String(formData.get("event_name") ?? "").trim().slice(0, 180);
  const rawUrl = String(formData.get("event_url") ?? "").trim().slice(0, 1000);
  if (eventName.length < 3) return { ok: false, message: "Please enter the event name." };
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported link");
  } catch {
    return { ok: false, message: "Please enter a valid public event link." };
  }

  const submission = {
    submitted_by: userId,
    event_name: eventName,
    event_url: rawUrl,
    event_date: String(formData.get("event_date") ?? "").slice(0, 10),
    location_text: String(formData.get("location_text") ?? "").trim().slice(0, 250),
    notes: String(formData.get("notes") ?? "").trim().slice(0, 2000)
  };

  const { error } = await supabase.from("user_submissions").insert(submission);
  if (error) {
    console.error("ClassicsGo event submission failed", { code: error.code });
    return { ok: false, message: "We could not save that submission. Please check the details and try again." };
  }

  revalidatePath("/account");
  return { ok: true, message: "Thank you. We’ll verify the details before the event appears publicly." };
}

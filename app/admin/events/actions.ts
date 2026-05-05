"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export async function createManualEvent(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return;

  const title = String(formData.get("title") ?? "");
  if (!title) return;

  await supabase.from("events").insert({
    title,
    slug: `${slugify(title)}-${Date.now().toString(36)}`,
    event_type: String(formData.get("event_type") ?? "Classic car show"),
    start_date: String(formData.get("start_date") ?? new Date().toISOString().slice(0, 10)),
    town: String(formData.get("town") ?? ""),
    county: String(formData.get("county") ?? ""),
    description: String(formData.get("description") ?? ""),
    status: "draft",
    confidence_score: 100,
    is_verified: true,
    source_count: 0,
    last_checked_at: new Date().toISOString()
  });

  revalidatePath("/admin/events");
}

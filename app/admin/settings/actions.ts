"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function upsertSourceRegistryEntry(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return;
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const rawStartUrl = String(formData.get("start_url") ?? "").trim();
  let startUrl: URL;
  try {
    startUrl = new URL(rawStartUrl);
    if (startUrl.protocol !== "https:" || startUrl.username || startUrl.password) return;
  } catch {
    return;
  }
  const domain = startUrl.hostname.replace(/^www\./, "").toLowerCase();
  const requestedPriority = Number(formData.get("priority_weight") ?? 50);
  const frequency = String(formData.get("crawl_frequency") ?? "daily");
  const payload = {
    source_key: String(formData.get("source_key") || domain).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120),
    domain,
    source_name: String(formData.get("source_name") || domain).trim().slice(0, 180),
    start_url: startUrl.toString().slice(0, 2_000),
    source_type: String(formData.get("source_type") ?? "organiser").trim().slice(0, 40),
    priority_weight: Number.isFinite(requestedPriority) ? Math.min(100, Math.max(0, Math.round(requestedPriority))) : 50,
    crawl_frequency: ["six_hourly", "daily", "weekly"].includes(frequency) ? frequency : "daily",
    format_hint: "html",
    country_code: String(formData.get("country_code") ?? "GB").toUpperCase().slice(0, 2),
    region: String(formData.get("region") ?? "").trim().slice(0, 120) || null,
    is_active: formData.get("is_active") === "on",
    requires_review: formData.get("requires_review") === "on",
    notes: String(formData.get("notes") ?? "").trim().slice(0, 500)
  };
  if (!payload.source_key || !/^[A-Z]{2}$/.test(payload.country_code)) return;
  if (id) {
    await supabase.from("source_registry").update(payload).eq("id", id);
  } else {
    await supabase.from("source_registry").upsert(payload, { onConflict: "source_key" });
  }
  revalidatePath("/admin/settings");
}

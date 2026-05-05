"use server";

import { revalidatePath } from "next/cache";
import { runSourceDiscoveryAgent } from "@/lib/agent/source-agent";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export async function upsertSourceRegistryEntry(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return;
  const id = String(formData.get("id") ?? "");
  const payload = {
    domain: String(formData.get("domain") ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase(),
    source_name: String(formData.get("source_name") ?? ""),
    start_url: String(formData.get("start_url") ?? ""),
    source_type: String(formData.get("source_type") ?? "unknown"),
    priority_weight: Number(formData.get("priority_weight") ?? 50),
    crawl_frequency: String(formData.get("crawl_frequency") ?? "daily"),
    is_active: formData.get("is_active") === "on",
    requires_review: formData.get("requires_review") === "on",
    notes: String(formData.get("notes") ?? "")
  };
  if (!payload.start_url && payload.domain) payload.start_url = `https://${payload.domain}`;
  if (!payload.domain) return;
  if (id) {
    await supabase.from("source_registry").update(payload).eq("id", id);
  } else {
    await supabase.from("source_registry").upsert(payload, { onConflict: "domain" });
  }
  revalidatePath("/admin/settings");
}

export async function runSourceNow(formData: FormData) {
  const supabase = createServiceClient();
  if (!supabase) return;
  await runSourceDiscoveryAgent(supabase, {
    runType: "manual_deep",
    sourceId: String(formData.get("sourceId") ?? "")
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/agent-runs");
  revalidatePath("/admin/review");
}

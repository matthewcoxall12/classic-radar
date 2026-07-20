"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(_state: { ok: boolean; message: string }, formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return { ok: false, message: "Please sign in again before saving." };

  const displayName = String(formData.get("display_name") || "").trim().slice(0, 80);
  const homeLocation = String(formData.get("home_location") || "").trim().slice(0, 120);
  const homePostcode = String(formData.get("home_postcode") || "").trim().slice(0, 16).toUpperCase();
  const radius = Number(formData.get("home_radius_miles"));
  if (!displayName) return { ok: false, message: "Please enter a display name." };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      home_location: homeLocation || null,
      home_postcode: homePostcode || null,
      home_radius_miles: Number.isFinite(radius) ? Math.min(250, Math.max(5, radius)) : 50
    })
    .eq("id", userId);
  if (error) return { ok: false, message: "Your profile could not be saved. Please try again." };

  revalidatePath("/account");
  return { ok: true, message: "Your preferences have been saved." };
}

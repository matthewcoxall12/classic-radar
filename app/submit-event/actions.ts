"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeLocation } from "@/lib/geocoding";
import { eventImageExtension, MAX_EVENT_IMAGE_BYTES, parseEventSubmission } from "@/lib/event-submission";

export type EventSubmissionState = { ok: boolean; message: string; eventUrl?: string };

export async function submitMissingEvent(_previous: EventSubmissionState, formData: FormData): Promise<EventSubmissionState> {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, message: "Please sign in again before publishing your event. Your details have not been saved." };
  const userId = auth.user.id;
  const fields = Object.fromEntries([...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  let imagePath: string | undefined;
  let persistedSlug: string | undefined;
  try {
    const details = parseEventSubmission(fields);
    const editingId = fields.event_id;
    if (editingId && !/^[a-f0-9-]{36}$/i.test(editingId)) throw new Error("That event could not be found.");
    const id = editingId || randomUUID();
    let previous: { slug: string; image_url: string | null; status: string } | null = null;
    if (editingId) {
      const { data, error } = await supabase.from("events").select("slug,image_url,status").eq("id", id).eq("created_by", userId).in("status", ["published", "cancelled"]).maybeSingle();
      if (error || !data) throw new Error("You can only edit events published by your account.");
      previous = data;
    }
    const location = await geocodeLocation(details.postcode);
    if (!location) throw new Error("We could not locate that postcode. Check the venue postcode and try again.");
    let image_url = previous?.image_url ?? null;
    const image = formData.get("image");
    if (image instanceof File && image.size > 0) {
      if (fields.image_rights !== "on") throw new Error("Please confirm you have permission to publish the photograph.");
      if (image.size > MAX_EVENT_IMAGE_BYTES) throw new Error("Choose a photograph smaller than 3 MB.");
      const bytes = new Uint8Array(await image.arrayBuffer());
      const extension = eventImageExtension(bytes, image.type);
      imagePath = `${userId}/${id}/${randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("event-images").upload(imagePath, bytes, { contentType: image.type, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error("The photograph could not be uploaded. Try a smaller JPEG, PNG or WebP image.");
      image_url = supabase.storage.from("event-images").getPublicUrl(imagePath).data.publicUrl;
    }
    const slug = previous?.slug || `${details.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "classic-event"}-${details.start_date}-${id.slice(0, 8)}`;
    const row = { ...details, image_url, latitude: location.latitude, longitude: location.longitude };
    const result = editingId
      ? await supabase.from("events").update(row).eq("id", id).eq("created_by", userId).select("slug").single()
      : await supabase.from("events").insert({ ...row, id, slug, dedupe_key: createHash("sha256").update(`${details.title.toLowerCase().replace(/\s+/g, " ")}|${details.start_date}|${details.postcode}`).digest("hex"), created_by: userId, status: "published", is_verified: false, confidence_score: 0, source_count: 0 }).select("slug").single();
    if (result.error) {
      console.error("ClassicsGo event publishing failed", { code: result.error.code });
      if (result.error.code === "23505") throw new Error("This event appears to be listed already. Search the directory before adding it again.");
      if (result.error.message.includes("daily publishing limit")) throw new Error("You have reached the limit of 10 new events today. You can still edit your existing events.");
      throw new Error("We could not save your event. Your form is still here; please try again.");
    }
    persistedSlug = result.data.slug;
    if (imagePath && previous?.image_url) {
      const oldPath = previous.image_url.split("/storage/v1/object/public/event-images/")[1];
      if (oldPath?.startsWith(`${userId}/${id}/`)) await supabase.storage.from("event-images").remove([oldPath]);
    }
    revalidatePath("/events"); revalidatePath(`/events/${slug}`); revalidatePath("/submit-event"); revalidatePath("/account");
    return { ok: true, message: editingId ? previous?.status === "cancelled" ? "Your changes are saved. The event stays cancelled until you restore it from My event listings." : "Your changes are saved and live." : "Your event is published. Share its page with your club and visitors.", eventUrl: `/events/${result.data.slug}` };
  } catch (error) {
    // Once committed, never delete the photograph that the live listing uses.
    if (persistedSlug) {
      console.error("ClassicsGo post-publish refresh failed", { eventSlug: persistedSlug });
      return { ok: true, message: "Your event is saved and live.", eventUrl: `/events/${persistedSlug}` };
    }
    if (imagePath) await supabase.storage.from("event-images").remove([imagePath]);
    const image = formData.get("image");
    const retryImage = image instanceof File && image.size > 0 ? " Please select your photograph again before retrying." : "";
    return { ok: false, message: (error instanceof Error ? error.message : "We could not publish your event. Please try again.") + retryImage };
  }
}

export async function setOwnEventStatus(_previous: EventSubmissionState, formData: FormData): Promise<EventSubmissionState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, message: "Please sign in again to manage this event." };
  const id = String(formData.get("event_id") ?? "");
  const status = formData.get("status") === "published" ? "published" : "cancelled";
  const { data: updated, error } = await supabase.from("events").update({ status }).eq("id", id).eq("created_by", data.user.id).in("status", ["published", "cancelled"]).select("slug").maybeSingle();
  if (error || !updated) return { ok: false, message: "We could not change this event. Please refresh and try again." };
  revalidatePath("/submit-event"); revalidatePath("/events"); revalidatePath(`/events/${updated.slug}`);
  return { ok: true, message: status === "cancelled" ? "Event cancelled and removed from the directory." : "Your listing is restored." };
}

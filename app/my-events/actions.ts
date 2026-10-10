"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function changeRoadbook(form: FormData) {
  const viewer = await requireViewer("/my-events");
  if (!viewer.canUseRoadbook) redirect("/membership");
  const supabase = await createClient();
  const action = String(form.get("action") || ""); const id = String(form.get("roadbook_id") || "");
  let error: { message: string } | null = null; let selected = id;
  if (action === "create") {
    const name = String(form.get("name") || "").trim();
    if (name.length < 2 || name.length > 100) redirect("/my-events?notice=invalid");
    const result = await supabase.from("roadbooks").insert({ user_id: viewer.id, name, description: "", is_shared: false }).select("id").single();
    error = result.error; selected = result.data?.id || "";
  } else {
    if (!uuid.test(id)) redirect("/my-events?notice=invalid");
    const { data: owned } = await supabase.from("roadbooks").select("id").eq("id", id).eq("user_id", viewer.id).maybeSingle();
    if (!owned) redirect("/my-events?notice=unavailable");
    if (action === "details") {
      const name = String(form.get("name") || "").trim(); const description = String(form.get("description") || "").trim();
      if (name.length < 2 || name.length > 100 || description.length > 2000) redirect(`/my-events?book=${id}&notice=invalid`);
      ({ error } = await supabase.from("roadbooks").update({ name, description, is_shared: form.get("is_shared") === "on" }).eq("id", id).eq("user_id", viewer.id).select("id").single());
    } else if (action === "delete") {
      ({ error } = await supabase.from("roadbooks").delete().eq("id", id).eq("user_id", viewer.id).select("id").single()); selected = "";
    } else if (action === "add" || action === "remove" || action === "notes") {
      const eventId = String(form.get("event_id") || "");
      if (!uuid.test(eventId)) redirect(`/my-events?book=${id}&notice=invalid`);
      if (action === "remove") ({ error } = await supabase.from("roadbook_events").delete().eq("roadbook_id", id).eq("event_id", eventId));
      else if (action === "notes") {
        const notes = String(form.get("notes") || "").trim(); const position = Number(form.get("position"));
        if (notes.length > 2000 || !Number.isInteger(position) || position < 0 || position > 999) redirect(`/my-events?book=${id}&notice=invalid`);
        ({ error } = await supabase.from("roadbook_events").update({ notes, position }).eq("roadbook_id", id).eq("event_id", eventId).select("event_id").single());
      } else {
        const { data: existing } = await supabase.from("roadbook_events").select("event_id").eq("roadbook_id", id).eq("event_id", eventId).maybeSingle();
        if (!existing) ({ error } = await supabase.from("roadbook_events").insert({ roadbook_id: id, event_id: eventId, position: 0, notes: "" }));
      }
    } else redirect("/my-events?notice=invalid");
  }
  revalidatePath("/my-events");
  redirect(`/my-events?${selected ? `book=${encodeURIComponent(selected)}&` : ""}notice=${error ? "failed" : "saved"}`);
}

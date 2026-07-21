import {
  cleanString,
  integerNumber,
  jsonMemberError,
  jsonOk,
  MemberApiError,
  readMemberJson,
  requireId,
  requireMember,
  requireRoadbookMember,
} from "@/lib/member-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const roadbookId = requireId(body.roadbookId, "roadbook ID");
    const eventId = requireId(body.eventId, "event ID");
    const roadbook = await supabase.from("roadbooks").select("id").eq("id", roadbookId).eq("user_id", user.memberId).maybeSingle();
    if (roadbook.error) throw roadbook.error;
    if (!roadbook.data) throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    const event = await supabase.from("events").select("id").eq("id", eventId).eq("status", "published").maybeSingle();
    if (event.error || !event.data) throw new MemberApiError(404, "EVENT_NOT_FOUND", "That event is unavailable.");
    const count = await supabase.from("roadbook_events").select("event_id", { count: "exact" }).eq("roadbook_id", roadbookId);
    if (count.error) throw count.error;
    const alreadyAdded = (count.data ?? []).some((entry) => entry.event_id === eventId);
    if ((count.count ?? 0) >= 200 && !alreadyAdded) {
      throw new MemberApiError(409, "ROADBOOK_EVENT_LIMIT_REACHED", "A roadbook can contain up to 200 events. Remove one before adding another.");
    }
    const notes = cleanString(body.notes, 600);
    let position: number;
    if (body.position === undefined || body.position === null) {
      const last = await supabase.from("roadbook_events").select("position").eq("roadbook_id", roadbookId).order("position", { ascending: false }).limit(1).maybeSingle();
      if (last.error) throw last.error;
      position = (last.data?.position ?? -1) + 1;
    } else {
      position = integerNumber(body.position, "Position", 0, 10_000);
    }
    const saved = await supabase.from("roadbook_events").upsert({ roadbook_id: roadbookId, event_id: eventId, position, notes }, { onConflict: "roadbook_id,event_id" });
    if (saved.error) throw saved.error;
    return jsonOk({ roadbookEvent: { roadbookId, eventId, position, notes } }, { status: 201 });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    requireRoadbookMember(member);
    const url = new URL(request.url);
    let roadbookId = url.searchParams.get("roadbookId");
    let eventId = url.searchParams.get("eventId");
    if ((!roadbookId || !eventId) && request.headers.get("content-type")?.includes("application/json")) {
      const body = await readMemberJson(request);
      roadbookId ||= typeof body.roadbookId === "string" ? body.roadbookId : null;
      eventId ||= typeof body.eventId === "string" ? body.eventId : null;
    }
    const validRoadbookId = requireId(roadbookId, "roadbook ID");
    const validEventId = requireId(eventId, "event ID");
    const roadbook = await supabase.from("roadbooks").select("id").eq("id", validRoadbookId).eq("user_id", user.memberId).maybeSingle();
    if (roadbook.error) throw roadbook.error;
    if (!roadbook.data) throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    const removed = await supabase.from("roadbook_events").delete().eq("roadbook_id", validRoadbookId).eq("event_id", validEventId);
    if (removed.error) throw removed.error;
    return jsonOk({ removed: true, roadbookId: validRoadbookId, eventId: validEventId });
  } catch (error) {
    return jsonMemberError(error);
  }
}

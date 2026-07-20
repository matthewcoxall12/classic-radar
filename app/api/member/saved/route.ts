import { jsonMemberError, jsonOk, MemberApiError, readMemberJson, requestValue, requireId, requireMember } from "@/lib/member-data";

export const dynamic = "force-dynamic";

function eventJson(event: Record<string, unknown>) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    venue: event.venue_name,
    town: event.town,
    postcode: event.postcode,
    startDate: event.start_date,
    endDate: event.end_date,
    startTime: event.start_time,
    category: event.event_type,
    latitude: event.latitude,
    longitude: event.longitude,
    officialUrl: event.booking_url ?? event.organiser_url,
    officialLabel: "Official event page",
    price: event.price_text,
    image: event.image_url,
    featured: Boolean(event.is_verified),
  };
}

export async function GET() {
  try {
    const { supabase, user } = await requireMember();
    const { data, error } = await supabase
      .from("saved_events")
      .select("event_id,created_at,events(*)")
      .eq("user_id", user.memberId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return jsonOk({
      items: (data ?? []).map((row) => ({
        eventId: row.event_id,
        savedAt: row.created_at,
        event: eventJson(row.events as unknown as Record<string, unknown>),
      })),
    });
  } catch (error) { return jsonMemberError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, member } = await requireMember(request);
    const body = await readMemberJson(request);
    const eventId = requireId(body.eventId, "event ID");
    const exists = await supabase.from("events").select("id").eq("id", eventId).eq("status", "published").maybeSingle();
    if (exists.error || !exists.data) throw new MemberApiError(404, "EVENT_NOT_FOUND", "That event is unavailable.");
    const count = await supabase.from("saved_events").select("event_id", { count: "exact", head: true }).eq("user_id", user.memberId);
    if ((count.count ?? 0) >= (member.tier === "roadbook" ? 1_000 : 200)) throw new MemberApiError(409, "SAVED_EVENT_LIMIT_REACHED", "This account has reached its saved-event limit.");
    const { data, error } = await supabase.from("saved_events").upsert({ user_id: user.memberId, event_id: eventId }, { onConflict: "user_id,event_id" }).select("event_id,created_at").single();
    if (error || !data) throw error ?? new Error("The event could not be saved.");
    return jsonOk({ saved: { eventId: data.event_id, savedAt: data.created_at } }, { status: 201 });
  } catch (error) { return jsonMemberError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireMember(request);
    const eventId = await requestValue(request, "eventId", "event ID");
    const { error } = await supabase.from("saved_events").delete().eq("user_id", user.memberId).eq("event_id", eventId);
    if (error) throw error;
    return jsonOk({ removed: true, eventId });
  } catch (error) { return jsonMemberError(error); }
}

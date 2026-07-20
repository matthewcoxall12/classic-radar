import { jsonMemberError, jsonOk, MemberApiError, readMemberJson, requestValue, requireId, requireMember } from "@/lib/member-data";
import type { SupabaseClient } from "@supabase/supabase-js";

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

async function countGoing(supabase: SupabaseClient, eventId: string) {
  const result = await supabase.from("event_attendance").select("event_id", { count: "exact", head: true }).eq("event_id", eventId);
  return result.count ?? 0;
}

export async function GET() {
  try {
    const { supabase, user } = await requireMember();
    const { data, error } = await supabase
      .from("event_attendance")
      .select("event_id,created_at,events(*)")
      .eq("user_id", user.memberId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const items = await Promise.all((data ?? []).map(async (row) => ({
      eventId: row.event_id,
      goingAt: row.created_at,
      goingCount: await countGoing(supabase, row.event_id),
      event: eventJson(row.events as unknown as Record<string, unknown>),
    })));
    return jsonOk({ items });
  } catch (error) { return jsonMemberError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireMember(request);
    const eventId = requireId((await readMemberJson(request)).eventId, "event ID");
    const exists = await supabase.from("events").select("id").eq("id", eventId).eq("status", "published").maybeSingle();
    if (exists.error || !exists.data) throw new MemberApiError(404, "EVENT_NOT_FOUND", "That upcoming event is unavailable.");
    const { error } = await supabase.from("event_attendance").upsert({ user_id: user.memberId, event_id: eventId }, { onConflict: "user_id,event_id" });
    if (error) throw error;
    return jsonOk({ going: true, eventId, goingCount: await countGoing(supabase, eventId) }, { status: 201 });
  } catch (error) { return jsonMemberError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireMember(request);
    const eventId = await requestValue(request, "eventId", "event ID");
    const { error } = await supabase.from("event_attendance").delete().eq("user_id", user.memberId).eq("event_id", eventId);
    if (error) throw error;
    return jsonOk({ going: false, eventId, goingCount: await countGoing(supabase, eventId) });
  } catch (error) { return jsonMemberError(error); }
}

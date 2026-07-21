import {
  booleanValue,
  cleanString,
  jsonMemberError,
  jsonOk,
  MemberApiError,
  readMemberJson,
  requestValue,
  requireId,
  requireMember,
  requireRoadbookMember,
} from "@/lib/member-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ROADBOOK_SELECT = "id,name,description,share_token,is_shared,created_at,updated_at";
const EVENT_SELECT = "id,title,description,venue_name,town,postcode,start_date,end_date,start_time,event_type,latitude,longitude,booking_url,organiser_url,price_text,image_url,is_verified,status";

type RoadbookRow = {
  id: string;
  name: string;
  description: string;
  share_token: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

type RoadbookEventRow = {
  roadbook_id: string;
  event_id: string;
  position: number;
  notes: string;
  created_at: string;
  events: Record<string, unknown> | null;
};

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

const roadbookJson = (row: RoadbookRow, events: RoadbookEventRow[] = []) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isShared: row.is_shared,
  shareUrl: row.is_shared ? `/roadbook/${row.share_token}` : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  eventCount: events.length,
  events: events.flatMap((item) => item.events && item.events.status === "published" ? [{
    eventId: item.event_id,
    position: item.position,
    notes: item.notes,
    addedAt: item.created_at,
    event: eventJson(item.events),
  }] : []),
});

export async function GET() {
  try {
    const { supabase, member, user } = await requireMember();
    requireRoadbookMember(member);
    const roadbooks = await supabase.from("roadbooks").select(ROADBOOK_SELECT).eq("user_id", user.memberId).order("updated_at", { ascending: false });
    if (roadbooks.error) throw roadbooks.error;
    const rows = (roadbooks.data ?? []) as RoadbookRow[];
    if (!rows.length) return jsonOk({ items: [] });
    const entries = await supabase
      .from("roadbook_events")
      .select(`roadbook_id,event_id,position,notes,created_at,events(${EVENT_SELECT})`)
      .in("roadbook_id", rows.map((row) => row.id))
      .order("position", { ascending: true });
    if (entries.error) throw entries.error;
    const byRoadbook = new Map<string, RoadbookEventRow[]>();
    for (const entry of (entries.data ?? []) as unknown as RoadbookEventRow[]) {
      const list = byRoadbook.get(entry.roadbook_id) ?? [];
      list.push(entry);
      byRoadbook.set(entry.roadbook_id, list);
    }
    return jsonOk({ items: rows.map((row) => roadbookJson(row, byRoadbook.get(row.id))) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const name = cleanString(body.name, 100);
    if (name.length < 2) throw new MemberApiError(400, "VALIDATION_ERROR", "Roadbook name must be at least two characters.");
    const description = cleanString(body.description, 600);
    if (Object.prototype.hasOwnProperty.call(body, "isShared") && typeof body.isShared !== "boolean") {
      throw new MemberApiError(400, "VALIDATION_ERROR", "isShared must be true or false.");
    }
    const count = await supabase.from("roadbooks").select("id", { count: "exact", head: true }).eq("user_id", user.memberId);
    if (count.error) throw count.error;
    if ((count.count ?? 0) >= 20) {
      throw new MemberApiError(409, "ROADBOOK_LIMIT_REACHED", "Roadbook membership includes up to 20 roadbooks. Remove one before creating another.");
    }
    const created = await supabase.from("roadbooks").insert({ user_id: user.memberId, name, description, is_shared: booleanValue(body.isShared) }).select(ROADBOOK_SELECT).single();
    if (created.error || !created.data) throw created.error ?? new Error("The roadbook could not be created.");
    return jsonOk({ roadbook: roadbookJson(created.data as RoadbookRow) }, { status: 201 });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const id = requireId(body.id, "roadbook ID");
    const existing = await supabase.from("roadbooks").select(ROADBOOK_SELECT).eq("id", id).eq("user_id", user.memberId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    const row = existing.data as RoadbookRow;
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = cleanString(body.name, 100);
      if (name.length < 2) throw new MemberApiError(400, "VALIDATION_ERROR", "Roadbook name must be at least two characters.");
      updates.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) updates.description = cleanString(body.description, 600);
    if (Object.prototype.hasOwnProperty.call(body, "isShared")) {
      if (typeof body.isShared !== "boolean") throw new MemberApiError(400, "VALIDATION_ERROR", "isShared must be true or false.");
      if (!body.isShared || row.is_shared) updates.is_shared = body.isShared;
    }
    const enableSharing = body.isShared === true && !row.is_shared;
    if (!Object.keys(updates).length && !enableSharing) throw new MemberApiError(400, "VALIDATION_ERROR", "No editable roadbook fields were provided.");
    if (Object.keys(updates).length) {
      const saved = await supabase.from("roadbooks").update(updates).eq("id", id).eq("user_id", user.memberId);
      if (saved.error) throw saved.error;
    }
    if (enableSharing) {
      const rotated = await createSupabaseAdminClient().rpc(
        "rotate_managed_roadbook_share_token",
        { p_user_id: user.memberId, p_roadbook_id: id },
      );
      if (rotated.error || !rotated.data) throw rotated.error ?? new Error("The share link could not be created.");
    }
    const updated = await supabase.from("roadbooks").select(ROADBOOK_SELECT).eq("id", id).eq("user_id", user.memberId).single();
    if (updated.error || !updated.data) throw updated.error ?? new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    return jsonOk({ roadbook: roadbookJson(updated.data as RoadbookRow) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    requireRoadbookMember(member);
    const id = await requestValue(request, "id", "roadbook ID");
    const removed = await supabase.from("roadbooks").delete().eq("id", id).eq("user_id", user.memberId).select("id").maybeSingle();
    if (removed.error) throw removed.error;
    if (!removed.data) throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    return jsonOk({ removed: true, id });
  } catch (error) {
    return jsonMemberError(error);
  }
}

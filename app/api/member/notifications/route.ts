import { cleanString, jsonMemberError, jsonOk, MemberApiError, readMemberJson, requireId, requireMember } from "@/lib/member-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await requireMember();
    const { data, error } = await supabase.from("member_notifications").select("id,title,body,event_id,is_read,created_at").eq("user_id", user.memberId).order("is_read").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const items = (data ?? []).map((row) => ({ id: row.id, type: "event", title: row.title, body: row.body, eventId: row.event_id, href: row.event_id ? `/events/${row.event_id}` : null, read: row.is_read, createdAt: row.created_at }));
    return jsonOk({ items, unreadCount: items.filter((item) => !item.read).length });
  } catch (error) { return jsonMemberError(error); }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requireMember(request);
    const body = await readMemberJson(request);
    if (typeof body.read !== "boolean") throw new MemberApiError(400, "VALIDATION_ERROR", "read must be true or false.");
    let query = supabase.from("member_notifications").update({ is_read: body.read }).eq("user_id", user.memberId);
    if (body.all !== true) {
      if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 98) throw new MemberApiError(400, "VALIDATION_ERROR", "Choose between one and 98 notifications.");
      const ids = body.ids.map((id) => requireId(cleanString(id, 100), "notification ID"));
      query = query.in("id", ids);
    }
    const { error } = await query;
    if (error) throw error;
    return jsonOk({ updated: body.all === true ? "all" : body.ids, read: body.read });
  } catch (error) { return jsonMemberError(error); }
}

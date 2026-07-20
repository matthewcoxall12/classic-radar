import { booleanValue, cleanString, finiteNumber, integerNumber, jsonMemberError, jsonOk, memberEntitlements, MemberApiError, readMemberJson, requestValue, requireMember } from "@/lib/member-data";

export const dynamic = "force-dynamic";

function locationJson(row: Record<string, unknown>) {
  return { id: row.id, label: row.label, placeName: row.place_name, latitude: row.latitude, longitude: row.longitude, radiusMiles: row.radius_miles, isHome: Boolean(row.is_home), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function GET() {
  try {
    const { supabase, user } = await requireMember();
    const { data, error } = await supabase.from("member_locations").select("*").eq("user_id", user.memberId).order("is_home", { ascending: false }).order("created_at");
    if (error) throw error;
    return jsonOk({ items: (data ?? []).map(locationJson) });
  } catch (error) { return jsonMemberError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, member } = await requireMember(request);
    const body = await readMemberJson(request);
    const label = cleanString(body.label, 60);
    const placeName = cleanString(body.placeName, 120);
    if (label.length < 2 || placeName.length < 2) throw new MemberApiError(400, "VALIDATION_ERROR", "Enter a label and place name for this location.");
    const latitude = finiteNumber(body.latitude, "Latitude", -90, 90);
    const longitude = finiteNumber(body.longitude, "Longitude", -180, 180);
    const radiusMiles = integerNumber(body.radiusMiles ?? 50, "Radius", 5, 250);
    const count = await supabase.from("member_locations").select("id", { count: "exact", head: true }).eq("user_id", user.memberId);
    if ((count.count ?? 0) >= memberEntitlements(member).maxLocations) throw new MemberApiError(403, "LOCATION_LIMIT_REACHED", member.tier === "roadbook" ? "You have reached the ten-location limit." : "Free explorers can keep one home area. Upgrade for multiple locations.");
    const isHome = (count.count ?? 0) === 0 || booleanValue(body.isHome);
    if (isHome) await supabase.from("member_locations").update({ is_home: false }).eq("user_id", user.memberId);
    const { data, error } = await supabase.from("member_locations").insert({ user_id: user.memberId, label, place_name: placeName, latitude, longitude, radius_miles: radiusMiles, is_home: isHome }).select("*").single();
    if (error || !data) throw error ?? new Error("The location could not be saved.");
    if (isHome) await supabase.from("profiles").update({ home_location: placeName, latitude, longitude, home_radius_miles: radiusMiles }).eq("id", user.memberId);
    return jsonOk({ location: locationJson(data) }, { status: 201 });
  } catch (error) { return jsonMemberError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireMember(request);
    const id = await requestValue(request, "id", "location ID");
    const existing = await supabase.from("member_locations").select("id,is_home").eq("id", id).eq("user_id", user.memberId).maybeSingle();
    if (existing.error || !existing.data) throw new MemberApiError(404, "NOT_FOUND", "Location not found.");
    const { error } = await supabase.from("member_locations").delete().eq("id", id).eq("user_id", user.memberId);
    if (error) throw error;
    if (existing.data.is_home) await supabase.from("profiles").update({ home_location: null, latitude: null, longitude: null }).eq("id", user.memberId);
    return jsonOk({ removed: true, id });
  } catch (error) { return jsonMemberError(error); }
}

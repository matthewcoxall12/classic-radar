import { cleanString, integerNumber, jsonMemberError, jsonOk, memberEntitlements, MemberApiError, readMemberJson, requestValue, requireMember } from "@/lib/member-data";

export const dynamic = "force-dynamic";

function vehicleJson(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, make: row.make, model: row.model, year: row.year, interests: [], createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function GET() {
  try {
    const { supabase, user } = await requireMember();
    const { data, error } = await supabase.from("member_vehicles").select("*").eq("user_id", user.memberId).order("created_at");
    if (error) throw error;
    return jsonOk({ items: (data ?? []).map(vehicleJson) });
  } catch (error) { return jsonMemberError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, member } = await requireMember(request);
    if (memberEntitlements(member).maxVehicles < 1) throw new MemberApiError(403, "VEHICLE_LIMIT_REACHED", "The virtual garage is included with Roadbook membership.");
    const body = await readMemberJson(request);
    const name = cleanString(body.name, 80);
    const make = cleanString(body.make, 80);
    const model = cleanString(body.model, 80);
    if (name.length < 2 || make.length < 2 || model.length < 1) throw new MemberApiError(400, "VALIDATION_ERROR", "Enter a name, make and model for the vehicle.");
    const year = body.year === null || body.year === undefined || body.year === "" ? null : integerNumber(body.year, "Year", 1885, 2100);
    const count = await supabase.from("member_vehicles").select("id", { count: "exact", head: true }).eq("user_id", user.memberId);
    if ((count.count ?? 0) >= memberEntitlements(member).maxVehicles) throw new MemberApiError(403, "VEHICLE_LIMIT_REACHED", "You have reached the ten-vehicle limit.");
    const { data, error } = await supabase.from("member_vehicles").insert({ user_id: user.memberId, name, make, model, year }).select("*").single();
    if (error || !data) throw error ?? new Error("The vehicle could not be saved.");
    return jsonOk({ vehicle: vehicleJson(data) }, { status: 201 });
  } catch (error) { return jsonMemberError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireMember(request);
    const id = await requestValue(request, "id", "vehicle ID");
    const { error } = await supabase.from("member_vehicles").delete().eq("id", id).eq("user_id", user.memberId);
    if (error) throw error;
    return jsonOk({ removed: true, id });
  } catch (error) { return jsonMemberError(error); }
}

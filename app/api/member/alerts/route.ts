import type { SupabaseClient } from "@supabase/supabase-js";
import {
  booleanValue,
  cleanString,
  integerNumber,
  jsonMemberError,
  jsonOk,
  MemberApiError,
  optionalString,
  readMemberJson,
  requestValue,
  requireId,
  requireMember,
  requireRoadbookMember,
} from "@/lib/member-data";

export const dynamic = "force-dynamic";

const categories = new Set(["Show", "Meet", "Autojumble", "Motorsport", "Run"]);
const frequencies = new Set(["instant", "daily", "weekly"]);
const MAX_ALERTS_PER_MEMBER = 10;
const ALERT_SELECT = "id,name,location_id,event_type,marque,radius_miles,frequency,enabled,created_at,updated_at";

type AlertRow = {
  id: string;
  name: string;
  location_id: string | null;
  event_type: string | null;
  marque: string | null;
  radius_miles: number;
  frequency: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const alertJson = (row: AlertRow) => ({
  id: row.id,
  name: row.name,
  locationId: row.location_id,
  category: row.event_type,
  marque: row.marque,
  radiusMiles: row.radius_miles,
  frequency: row.frequency,
  enabled: row.enabled,
  active: row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function assertLocationOwner(
  supabase: SupabaseClient,
  userId: string,
  locationId: string | null,
) {
  if (!locationId) return;
  const location = await supabase
    .from("member_locations")
    .select("id")
    .eq("id", locationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (location.error || !location.data) {
    throw new MemberApiError(400, "INVALID_LOCATION", "Choose one of your saved locations.");
  }
}

function validatedCategory(value: unknown) {
  const category = optionalString(value, 40);
  if (category && !categories.has(category)) {
    throw new MemberApiError(400, "VALIDATION_ERROR", "Choose a valid event category.");
  }
  return category;
}

function validatedFrequency(value: unknown) {
  const frequency = cleanString(value ?? "instant", 20);
  if (!frequencies.has(frequency)) {
    throw new MemberApiError(400, "VALIDATION_ERROR", "Choose a valid alert frequency.");
  }
  return frequency;
}

export async function GET() {
  try {
    const { supabase, member, user } = await requireMember();
    requireRoadbookMember(member);
    const result = await supabase
      .from("alert_rules")
      .select(ALERT_SELECT)
      .eq("user_id", user.memberId)
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return jsonOk({ items: ((result.data ?? []) as AlertRow[]).map(alertJson) });
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
    if (name.length < 2) throw new MemberApiError(400, "VALIDATION_ERROR", "Alert name is required.");
    const locationId = body.locationId ? requireId(body.locationId, "location ID") : null;
    const category = validatedCategory(body.category);
    const marque = optionalString(body.marque, 80);
    const radiusMiles = body.radiusMiles === undefined || body.radiusMiles === null
      ? 50
      : integerNumber(body.radiusMiles, "Radius", 5, 250);
    const frequency = validatedFrequency(body.frequency);
    if (Object.prototype.hasOwnProperty.call(body, "enabled") && typeof body.enabled !== "boolean") {
      throw new MemberApiError(400, "VALIDATION_ERROR", "enabled must be true or false.");
    }
    if (!locationId && !category && !marque) {
      throw new MemberApiError(400, "VALIDATION_ERROR", "Choose a location, category or marque for the alert.");
    }
    await assertLocationOwner(supabase, user.memberId, locationId);
    const count = await supabase
      .from("alert_rules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.memberId);
    if (count.error) throw count.error;
    if ((count.count ?? 0) >= MAX_ALERTS_PER_MEMBER) {
      throw new MemberApiError(409, "LIMIT_REACHED", `Roadbook membership includes up to ${MAX_ALERTS_PER_MEMBER} event alerts.`);
    }
    const created = await supabase
      .from("alert_rules")
      .insert({
        user_id: user.memberId,
        name,
        location_id: locationId,
        event_type: category,
        marque,
        radius_miles: radiusMiles,
        frequency,
        enabled: booleanValue(body.enabled, true),
      })
      .select(ALERT_SELECT)
      .single();
    if (created.error || !created.data) throw created.error ?? new Error("The alert could not be created.");
    return jsonOk({ alert: alertJson(created.data as AlertRow) }, { status: 201 });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const id = requireId(body.id, "alert ID");
    const existing = await supabase.from("alert_rules").select(ALERT_SELECT).eq("id", id).eq("user_id", user.memberId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new MemberApiError(404, "NOT_FOUND", "Alert not found.");
    const row = existing.data as AlertRow;
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = cleanString(body.name, 100);
      if (name.length < 2) throw new MemberApiError(400, "VALIDATION_ERROR", "Alert name is required.");
      updates.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, "locationId")) {
      const locationId = body.locationId ? requireId(body.locationId, "location ID") : null;
      await assertLocationOwner(supabase, user.memberId, locationId);
      updates.location_id = locationId;
    }
    if (Object.prototype.hasOwnProperty.call(body, "category")) updates.event_type = validatedCategory(body.category);
    if (Object.prototype.hasOwnProperty.call(body, "marque")) updates.marque = optionalString(body.marque, 80);
    if (Object.prototype.hasOwnProperty.call(body, "radiusMiles")) updates.radius_miles = integerNumber(body.radiusMiles, "Radius", 5, 250);
    if (Object.prototype.hasOwnProperty.call(body, "frequency")) updates.frequency = validatedFrequency(body.frequency);
    if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
      if (typeof body.enabled !== "boolean") throw new MemberApiError(400, "VALIDATION_ERROR", "enabled must be true or false.");
      updates.enabled = body.enabled;
    }
    if (!Object.keys(updates).length) throw new MemberApiError(400, "VALIDATION_ERROR", "No editable alert fields were provided.");
    const finalLocation = Object.prototype.hasOwnProperty.call(updates, "location_id") ? updates.location_id : row.location_id;
    const finalCategory = Object.prototype.hasOwnProperty.call(updates, "event_type") ? updates.event_type : row.event_type;
    const finalMarque = Object.prototype.hasOwnProperty.call(updates, "marque") ? updates.marque : row.marque;
    if (!finalLocation && !finalCategory && !finalMarque) {
      throw new MemberApiError(400, "VALIDATION_ERROR", "An alert must keep a location, category or marque.");
    }
    const updated = await supabase.from("alert_rules").update(updates).eq("id", id).eq("user_id", user.memberId).select(ALERT_SELECT).single();
    if (updated.error || !updated.data) throw updated.error ?? new MemberApiError(404, "NOT_FOUND", "Alert not found.");
    return jsonOk({ alert: alertJson(updated.data as AlertRow) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    requireRoadbookMember(member);
    const id = await requestValue(request, "id", "alert ID");
    const removed = await supabase.from("alert_rules").delete().eq("id", id).eq("user_id", user.memberId).select("id").maybeSingle();
    if (removed.error) throw removed.error;
    if (!removed.data) throw new MemberApiError(404, "NOT_FOUND", "Alert not found.");
    return jsonOk({ removed: true, id });
  } catch (error) {
    return jsonMemberError(error);
  }
}

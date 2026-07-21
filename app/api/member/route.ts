import {
  cleanString,
  finiteNumber,
  integerNumber,
  jsonMemberError,
  jsonOk,
  memberEntitlements,
  MemberApiError,
  normalizeDigest,
  publicMember,
  readMemberJson,
  requireMember,
} from "@/lib/member-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { member } = await requireMember();
    return jsonOk({ member: publicMember(member), entitlements: memberEntitlements(member) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, member, user } = await requireMember(request);
    const body = await readMemberJson(request);
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
      const displayName = cleanString(body.displayName, 120);
      if (displayName.length < 2) throw new MemberApiError(400, "VALIDATION_ERROR", "Display name must be at least two characters.");
      updates.display_name = displayName;
      member.display_name = displayName;
    }
    if (Object.prototype.hasOwnProperty.call(body, "digestFrequency")) {
      const digest = normalizeDigest(body.digestFrequency);
      if (!memberEntitlements(member).canUseAlerts && digest !== "weekly") throw new MemberApiError(403, "MEMBERSHIP_REQUIRED", "Custom digest frequency is included with Roadbook membership.");
      updates.digest_frequency = digest;
      member.digest_frequency = digest;
    }
    if (Object.prototype.hasOwnProperty.call(body, "homeArea")) {
      if (body.homeArea === null) {
        Object.assign(updates, { home_location: null, latitude: null, longitude: null });
        Object.assign(member, { home_area_name: null, home_latitude: null, home_longitude: null });
      } else if (body.homeArea && typeof body.homeArea === "object" && !Array.isArray(body.homeArea)) {
        const homeArea = body.homeArea as Record<string, unknown>;
        const name = cleanString(homeArea.name, 120);
        if (name.length < 2) throw new MemberApiError(400, "VALIDATION_ERROR", "Enter a valid home-area name.");
        const latitude = finiteNumber(homeArea.latitude, "Latitude", -90, 90);
        const longitude = finiteNumber(homeArea.longitude, "Longitude", -180, 180);
        const radius = integerNumber(homeArea.radiusMiles ?? 50, "Radius", 5, 250);
        Object.assign(updates, { home_location: name, latitude, longitude, home_radius_miles: radius });
        Object.assign(member, { home_area_name: name, home_latitude: latitude, home_longitude: longitude, home_radius_miles: radius });
      } else {
        throw new MemberApiError(400, "VALIDATION_ERROR", "Home area must include a place name and coordinates.");
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "rotateCalendarToken")) {
      if (!memberEntitlements(member).canUseCalendarFeed) throw new MemberApiError(403, "MEMBERSHIP_REQUIRED", "Calendar feeds are included with Roadbook membership.");
      if (body.rotateCalendarToken !== true) throw new MemberApiError(400, "VALIDATION_ERROR", "rotateCalendarToken must be true.");
    }
    if (!Object.keys(updates).length && !body.rotateCalendarToken) throw new MemberApiError(400, "VALIDATION_ERROR", "No editable member fields were provided.");
    if (Object.keys(updates).length) {
      const { error } = await supabase.from("profiles").update(updates).eq("id", user.memberId);
      if (error) throw error;
    }
    if (body.rotateCalendarToken === true) {
      const rotated = await createSupabaseAdminClient().rpc(
        "rotate_managed_calendar_token",
        { p_user_id: user.memberId },
      );
      if (rotated.error || !rotated.data) throw rotated.error ?? new Error("Calendar link could not be replaced.");
      member.calendar_token = String(rotated.data);
    }
    return jsonOk({ member: publicMember(member), entitlements: memberEntitlements(member) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

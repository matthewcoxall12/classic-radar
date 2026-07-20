import {
  getSessionUser,
  requireAuthenticatedMutation,
  type AuthenticatedUser,
} from "@/lib/app-auth";
import { AuthSecurityError } from "@/lib/auth-security";
import { ensureDatabase } from "@/lib/database";
import { readJsonBody, RequestError } from "@/lib/request-safety";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type MemberTier = "free" | "roadbook";
export type DigestFrequency = "off" | "daily" | "weekly";
export type MemberDatabase = Awaited<ReturnType<typeof ensureDatabase>>;
export type MemberStatement = ReturnType<MemberDatabase["prepare"]>;

export type MemberRow = {
  id: string;
  email: string;
  display_name: string;
  tier: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  trial_started_at: string | null;
  home_area_name: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  home_radius_miles: number;
  digest_frequency: string;
  calendar_token: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  title: string;
  description: string;
  venue: string;
  town: string;
  postcode: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  category: string;
  latitude: number;
  longitude: number;
  official_url: string;
  official_label: string;
  price: string;
  image: string;
  featured: number;
};

export class MemberApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const EVENT_SELECT = `
  e.id, e.title, e.description, e.venue, e.town, e.postcode,
  e.start_date, e.end_date, e.start_time, e.category, e.latitude,
  e.longitude, e.official_url, e.official_label, e.price, e.image,
  e.featured
`;

export async function requireMember(request?: Request) {
  const isMutation =
    request && !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  const user: AuthenticatedUser | null = isMutation
    ? await requireAuthenticatedMutation(request)
    : await getSessionUser();
  if (!user) {
    throw new MemberApiError(
      401,
      "AUTH_REQUIRED",
      "Sign in to use member features.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const profileResult = await supabase
    .from("profiles")
    .select("id,display_name,tier,home_location,latitude,longitude,home_radius_miles,digest_frequency,created_at,updated_at")
    .eq("id", user.memberId)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  let profile = profileResult.data;
  if (!profile) {
    const created = await supabase
      .from("profiles")
      .insert({ id: user.memberId, display_name: cleanString(user.displayName, 120) })
      .select("id,display_name,tier,home_location,latitude,longitude,home_radius_miles,digest_frequency,created_at,updated_at")
      .single();
    if (created.error || !created.data) throw created.error ?? new Error("Profile could not be created.");
    profile = created.data;
  }
  const member: MemberRow = {
    id: profile.id,
    email: user.email.trim().toLowerCase(),
    display_name: profile.display_name || user.displayName,
    tier: profile.tier === "roadbook" ? "roadbook" : "free",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    subscription_expires_at: null,
    trial_started_at: null,
    home_area_name: profile.home_location,
    home_latitude: profile.latitude,
    home_longitude: profile.longitude,
    home_radius_miles: profile.home_radius_miles ?? 50,
    digest_frequency: profile.digest_frequency ?? "weekly",
    calendar_token: null,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
  const db = await ensureDatabase();
  return { db, supabase, member, user };
}

export function isRoadbookMember(member: MemberRow) {
  return member.tier === "roadbook";
}

export function requireRoadbookMember(member: MemberRow) {
  if (!isRoadbookMember(member)) {
    throw new MemberApiError(
      403,
      "MEMBERSHIP_REQUIRED",
      "This feature is included with Roadbook membership.",
    );
  }
}

export function memberEntitlements(member: MemberRow) {
  const paid = isRoadbookMember(member);
  return {
    canSaveEvents: true,
    maxLocations: paid ? 10 : 1,
    maxVehicles: paid ? 10 : 0,
    canUseRoadbooks: paid,
    canUseAlerts: paid,
    canUseCalendarFeed: paid,
    canUseAdvancedFilters: paid,
    isAdFree: paid,
    digestFrequencies: paid ? ["off", "daily", "weekly"] : ["weekly"],
  };
}

export function publicMember(member: MemberRow) {
  const paid = isRoadbookMember(member);
  const hasHomeArea =
    member.home_area_name !== null &&
    member.home_latitude !== null &&
    member.home_longitude !== null;

  return {
    email: member.email,
    displayName: member.display_name || member.email,
    tier: (paid ? "roadbook" : "free") as MemberTier,
    subscription: {
      status: member.subscription_status,
      expiresAt: member.subscription_expires_at,
    },
    membershipSource: member.stripe_subscription_id
      ? "stripe"
      : member.subscription_status === "trialing"
        ? "trial"
        : null,
    trialEligible:
      member.tier === "free" &&
      member.trial_started_at === null &&
      member.stripe_subscription_id === null,
    homeArea: hasHomeArea
      ? {
          name: member.home_area_name,
          latitude: member.home_latitude,
          longitude: member.home_longitude,
          radiusMiles: member.home_radius_miles,
        }
      : null,
    digestFrequency: normalizeDigest(member.digest_frequency),
    calendarFeedUrl:
      paid && member.calendar_token
        ? `/api/calendar/${member.calendar_token}`
        : null,
  };
}

export function eventFromRow(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    venue: row.venue,
    town: row.town,
    postcode: row.postcode,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    officialUrl: row.official_url,
    officialLabel: row.official_label,
    price: row.price,
    image: row.image,
    featured: Boolean(row.featured),
  };
}

export function jsonOk(data: Record<string, unknown>, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return Response.json({ ok: true, data }, { ...init, headers });
}

export function jsonMemberError(error: unknown) {
  if (error instanceof AuthSecurityError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof MemberApiError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof RequestError) {
    return Response.json(
      {
        ok: false,
        error: { code: "INVALID_REQUEST", message: error.message },
      },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const databaseMessage = error instanceof Error ? error.message : "";
  const constraint = databaseMessage.includes("member_locations_limit")
    ? {
        code: "LOCATION_LIMIT_REACHED",
        message: "This account has reached its followed-area limit.",
      }
    : databaseMessage.includes("member_vehicles_limit")
      ? {
          code: "VEHICLE_LIMIT_REACHED",
          message: "This account has reached its virtual-garage limit.",
        }
      : databaseMessage.includes("alert_rules_limit")
        ? {
            code: "LIMIT_REACHED",
            message: "Roadbook membership includes up to ten event watchlists.",
          }
        : databaseMessage.includes("saved_events_limit")
          ? {
              code: "SAVED_EVENT_LIMIT_REACHED",
              message: "This account has reached its saved-event limit.",
            }
          : databaseMessage.includes("event_attendance_limit")
            ? {
                code: "ATTENDANCE_LIMIT_REACHED",
                message: "This account has reached its upcoming attendance limit.",
              }
          : databaseMessage.includes("roadbooks_limit")
            ? {
                code: "ROADBOOK_LIMIT_REACHED",
                message: "This account has reached its roadbook limit.",
              }
            : databaseMessage.includes("roadbook_events_limit")
              ? {
                  code: "ROADBOOK_EVENT_LIMIT_REACHED",
                  message: "This roadbook has reached its event limit.",
                }
              : databaseMessage.includes("member_locations.member_email")
                ? {
                    code: "HOME_AREA_CONFLICT",
                    message: "A home area already exists. Refresh your roadbook and try again.",
                  }
                : null;
  if (constraint) {
    return Response.json(
      { ok: false, error: constraint },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("Member API error", error);
  return Response.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "The member service is temporarily unavailable.",
      },
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function readMemberJson(request: Request) {
  return readJsonBody(request, 12_000);
}

export function cleanString(value: unknown, limit = 200) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function optionalString(value: unknown, limit = 200) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = cleanString(value, limit);
  return cleaned || null;
}

export function finiteNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new MemberApiError(
      400,
      "VALIDATION_ERROR",
      `${field} must be between ${min} and ${max}.`,
    );
  }
  return value;
}

export function integerNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
) {
  const parsed = finiteNumber(value, field, min, max);
  if (!Number.isInteger(parsed)) {
    throw new MemberApiError(
      400,
      "VALIDATION_ERROR",
      `${field} must be a whole number.`,
    );
  }
  return parsed;
}

export function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeDigest(value: unknown): DigestFrequency {
  return value === "off" || value === "daily" ? value : "weekly";
}

export function requireId(value: unknown, label = "id") {
  const id = cleanString(value, 100);
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new MemberApiError(
      400,
      "VALIDATION_ERROR",
      `A valid ${label} is required.`,
    );
  }
  return id;
}

export async function requestValue(
  request: Request,
  key: string,
  label = key,
) {
  const queryValue = new URL(request.url).searchParams.get(key);
  if (queryValue) return requireId(queryValue, label);

  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await readMemberJson(request);
    return requireId(body[key], label);
  }

  throw new MemberApiError(
    400,
    "VALIDATION_ERROR",
    `A valid ${label} is required.`,
  );
}

export function createToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseStringList(value: unknown, maxItems = 12) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new MemberApiError(
      400,
      "VALIDATION_ERROR",
      `Choose no more than ${maxItems} interests.`,
    );
  }
  return value
    .map((item) => cleanString(item, 40))
    .filter((item, index, items) => item && items.indexOf(item) === index);
}

export function safeJsonStringList(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

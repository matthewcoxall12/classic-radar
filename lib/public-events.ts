import { type EventCategory, type MotoringEvent } from "@/lib/events";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type SupabaseEvent = {
  id: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  address: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  country_code: string | null;
  timezone: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  event_type: string | null;
  latitude: number | null;
  longitude: number | null;
  booking_url: string | null;
  organiser_url: string | null;
  price_text: string | null;
  image_url: string | null;
  is_verified: boolean | null;
  going_count: number | null;
  last_checked_at: string | null;
  updated_at: string;
};

export type EventSourceVerification =
  | "curated"
  | "source_checked"
  | "organizer_verified"
  | "partner_verified";

export type PublicMotoringEvent = MotoringEvent & {
  updatedAt?: string;
  sourceUrl?: string;
  sourceLastCheckedAt?: string;
  sourceVerification?: EventSourceVerification;
};

function category(value: string | null): EventCategory {
  const text = (value ?? "").toLowerCase();
  if (text.includes("autojumble") || text.includes("swap")) return "Autojumble";
  if (text.includes("motor") || text.includes("rally") || text.includes("race")) return "Motorsport";
  if (text.includes("run") || text.includes("tour")) return "Run";
  if (text.includes("meet") || text.includes("coffee") || text.includes("club")) return "Meet";
  if (text.includes("show") || text.includes("museum") || text.includes("vintage")) return "Show";
  return "Other";
}

function localImage(eventCategory: EventCategory) {
  if (eventCategory === "Autojumble") return "/images/event-autojumble.png";
  if (eventCategory === "Motorsport") return "/images/event-paddock.png";
  return "/images/event-country-show.png";
}

function safeHttps(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function supabaseEventToMotoringEvent(row: SupabaseEvent): PublicMotoringEvent {
  const eventCategory = category(row.event_type);
  const officialUrl = safeHttps(row.booking_url) ?? safeHttps(row.organiser_url) ?? "https://classicsgo.com";
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "See the official event page for full details.",
    venue: row.venue_name ?? row.address ?? row.town ?? "Venue to be confirmed",
    town: row.town ?? row.county ?? "Location to be confirmed",
    postcode: row.postcode ?? "",
    countryCode: row.country_code ?? "GB",
    adminArea: row.county ?? undefined,
    timezone: row.timezone ?? "Europe/London",
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    startTime: row.start_time?.slice(0, 5) ?? "All day",
    category: eventCategory,
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    officialUrl,
    officialLabel: row.booking_url ? "Official event page" : "Official website",
    price: row.price_text ?? "See official event page",
    image: safeHttps(row.image_url) ?? localImage(eventCategory),
    featured: Boolean(row.is_verified),
    updatedAt: row.updated_at,
    goingCount: Number(row.going_count ?? 0),
    sourceUrl: officialUrl,
    sourceLastCheckedAt: row.last_checked_at ?? undefined,
    sourceVerification: row.is_verified ? "organizer_verified" : row.last_checked_at ? "source_checked" : "curated",
  };
}

const fields = [
  "id", "title", "description", "venue_name", "address", "town", "county",
  "postcode", "country_code", "timezone", "start_date", "end_date", "start_time",
  "event_type", "latitude", "longitude", "booking_url", "organiser_url",
  "price_text", "image_url", "is_verified", "going_count", "last_checked_at", "updated_at",
].join(",");

export async function getPublishedEvent(id: string): Promise<PublicMotoringEvent | null> {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(fields)
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data) return null;
  return supabaseEventToMotoringEvent(data as unknown as SupabaseEvent);
}

export async function listIndexableEvents(requestedLimit = 24): Promise<PublicMotoringEvent[]> {
  const limit = Math.max(1, Math.min(5_000, Math.trunc(requestedLimit)));
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(fields)
    .eq("status", "published")
    .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
    .order("start_date", { ascending: true })
    .order("is_verified", { ascending: false })
    .limit(limit);
  if (error || !data) {
    console.error("[public-events] catalogue query failed", error?.code ?? "unknown");
    return [];
  }
  return (data as unknown as SupabaseEvent[]).map(supabaseEventToMotoringEvent);
}

export function safeOfficialUrl(value: string) {
  return safeHttps(value);
}

import { dateRange, eventSearchWindow } from "@/lib/event-search";
import { geocodeLocation, hasValidCoordinatePair } from "@/lib/geocoding";
import { createClient } from "@/lib/supabase/server";
import type {
  AgentRun,
  ClassicEvent,
  ReviewQueueItemType,
  SourceRegistryEntry,
} from "@/lib/types";

export const eventTypes = [
  "Classic car show",
  "Cars & coffee",
  "Club meet",
  "Autojumble",
  "Rally / road run",
  "Motorsport",
  "Museum / venue event",
  "American / hot rod",
  "Vintage / pre-war",
  "Marque-specific",
] as const;

export type EventSearchParams = {
  q?: string;
  location?: string;
  lat?: string;
  lng?: string;
  radius?: string;
  date?: string;
  types?: string[];
  page?: string;
  sort?: string;
};

export async function getEvents(
  params: EventSearchParams = {},
  limit = 200,
): Promise<ClassicEvent[]> {
  const range = dateRange(params.date);
  const supabase = await createClient();
  const broadSearch = ["uk", "europe"].includes(params.radius || "");
  const origin = broadSearch ? null : hasValidCoordinatePair(params.lat, params.lng)
    ? {
        latitude: Number(params.lat),
        longitude: Number(params.lng),
        label: "Current location",
      }
    : await geocodeLocation(params.location);
  const isLocalSearch = !broadSearch && Boolean(
    params.location?.trim() || hasValidCoordinatePair(params.lat, params.lng),
  );
  if (isLocalSearch && !origin) return [];

  const local = Boolean(origin && !broadSearch);
  const window = eventSearchWindow(params.page, limit);
  const radius = Number(params.radius || 50);
  const { data, error } = await supabase.rpc("search_public_events", {
    p_start_date: range.start,
    p_end_date: range.end,
    p_query: params.q?.trim().slice(0, 120) || null,
    p_types: params.types?.length ? params.types : null,
    p_country: params.radius === "uk" ? "GB" : null,
    p_latitude: local ? origin!.latitude : null,
    p_longitude: local ? origin!.longitude : null,
    p_radius_miles: Number.isFinite(radius) ? Math.min(250, Math.max(1, radius)) : 50,
    p_sort: params.sort === "distance" ? "distance" : "date",
    p_offset: window.offset,
    p_limit: window.limit,
  });
  if (error || !data) {
    console.error("ClassicsGo event query failed", error?.message);
    return [];
  }
  return data as ClassicEvent[];
}

export async function getUpcomingEvents(limit = 3) {
  return getEvents({ date: "all", radius: "europe" }, limit);
}

export async function getEventBySlug(
  slug: string,
): Promise<ClassicEvent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .in("status", ["published", "cancelled"])
    .maybeSingle();
  if (error)
    console.error("ClassicsGo event detail query failed", error.message);
  return (data as ClassicEvent | null) ?? null;
}

export async function getViewerEventState(eventIds: string[], userId?: string) {
  if (!userId || eventIds.length === 0)
    return { saved: new Set<string>(), going: new Set<string>() };
  const supabase = await createClient();
  const [savedResult, goingResult] = await Promise.all([
    supabase
      .from("saved_events")
      .select("event_id")
      .eq("user_id", userId)
      .in("event_id", eventIds),
    supabase
      .from("event_attendance")
      .select("event_id")
      .eq("user_id", userId)
      .in("event_id", eventIds),
  ]);
  return {
    saved: new Set((savedResult.data ?? []).map((row) => String(row.event_id))),
    going: new Set((goingResult.data ?? []).map((row) => String(row.event_id))),
  };
}

export async function getSavedEvents(userId: string): Promise<ClassicEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_events")
    .select("events(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? [])
    .map((row) => row.events as unknown as ClassicEvent | null)
    .filter((event): event is ClassicEvent => Boolean(event));
}

export async function getGoingEvents(userId: string): Promise<ClassicEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_attendance")
    .select("events(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? [])
    .map((row) => row.events as unknown as ClassicEvent | null)
    .filter((event): event is ClassicEvent => Boolean(event));
}

export async function getAdminEvents() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_date", { ascending: true });
  return error ? [] : ((data as ClassicEvent[] | null) ?? []);
}

export async function getReviewQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("review_queue")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : ((data as ReviewQueueItemType[] | null) ?? []);
}

export async function getAgentRuns() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(25);
  return error ? [] : ((data as AgentRun[] | null) ?? []);
}

export async function getSourceRegistry() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_registry")
    .select("*")
    .order("priority_weight", { ascending: false });
  return error ? [] : ((data as SourceRegistryEntry[] | null) ?? []);
}

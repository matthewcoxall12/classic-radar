import { geocodeLocation, hasValidCoordinatePair } from "@/lib/geocoding";
import { eventSearchTerms, eventTextMatches } from "@/lib/event-search";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun, ClassicEvent, ReviewQueueItemType, SourceRegistryEntry } from "@/lib/types";

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
  "Marque-specific"
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
};

function dateRange(filter?: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (filter === "weekend") {
    const daysUntilSaturday = (6 - start.getUTCDay() + 7) % 7;
    const saturday = new Date(start);
    saturday.setUTCDate(start.getUTCDate() + daysUntilSaturday);
    const sunday = new Date(saturday);
    sunday.setUTCDate(saturday.getUTCDate() + 1);
    return { start: isoDate(saturday), end: isoDate(sunday) };
  }
  if (filter === "7" || filter === "30") {
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + Number(filter));
    return { start: isoDate(start), end: isoDate(end) };
  }
  return { start: isoDate(start), end: null };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getEvents(params: EventSearchParams = {}, limit = 200): Promise<ClassicEvent[]> {
  const range = dateRange(params.date);
  const supabase = await createClient();
  const countryWide = params.radius === "uk" || params.radius === "europe";
  const isLocalSearch = !countryWide && Boolean(params.location?.trim() || hasValidCoordinatePair(params.lat, params.lng));
  const origin = !isLocalSearch
    ? null
    : hasValidCoordinatePair(params.lat, params.lng)
      ? { latitude: Number(params.lat), longitude: Number(params.lng), label: "Current location" }
      : await geocodeLocation(params.location);
  if (isLocalSearch && !origin) return [];
  const searchTerms = eventSearchTerms(params.q);

  let events: ClassicEvent[] = [];
  const radius = Number(params.radius || 50);
  if (origin && Number.isFinite(radius) && !["uk", "europe"].includes(params.radius || "")) {
    const { data, error } = await supabase.rpc("events_nearby", {
      p_latitude: origin.latitude,
      p_longitude: origin.longitude,
      p_radius_miles: Math.min(250, Math.max(1, radius)),
      p_limit: Math.min(200, Math.max(1, limit))
    });
    if (error || !data) {
      console.error("ClassicsGo nearby event query failed", error?.message);
      return [];
    }
    events = data as ClassicEvent[];
    events = events.filter((event) => event.start_date >= range.start && (!range.end || event.start_date <= range.end));
    if (params.types?.length) events = events.filter((event) => params.types!.includes(event.event_type));
  } else {
    const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
    const resultsPerPage = params.page ? Math.max(1, limit - 1) : limit;
    const offset = (page - 1) * resultsPerPage;
    let query = supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("start_date", range.start)
      .order("start_date", { ascending: true })
      .range(offset, offset + limit - 1);
    if (range.end) query = query.lte("start_date", range.end);
    if (params.types?.length) query = query.in("event_type", params.types);
    if (params.radius === "uk") query = query.eq("country_code", "GB");
    for (const term of searchTerms) {
      query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,event_type.ilike.%${term}%,venue_name.ilike.%${term}%,town.ilike.%${term}%,county.ilike.%${term}%,organiser_name.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error || !data) {
      console.error("ClassicsGo event query failed", error?.message);
      return [];
    }
    events = data as ClassicEvent[];
  }

  if (searchTerms.length) {
    events = events.filter((event) =>
      eventTextMatches(
        [event.title, event.description, event.venue_name, event.town, event.county, event.event_type, event.organiser_name],
        searchTerms
      )
    );
  }
  return events;
}

export async function getUpcomingEvents(limit = 3) {
  return getEvents({ date: "all", radius: "europe" }, limit);
}

export async function getEventBySlug(slug: string): Promise<ClassicEvent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) console.error("ClassicsGo event detail query failed", error.message);
  return (data as ClassicEvent | null) ?? null;
}

export async function getViewerEventState(eventIds: string[], userId?: string) {
  if (!userId || eventIds.length === 0) return { saved: new Set<string>(), going: new Set<string>() };
  const supabase = await createClient();
  const [savedResult, goingResult] = await Promise.all([
    supabase.from("saved_events").select("event_id").eq("user_id", userId).in("event_id", eventIds),
    supabase.from("event_attendance").select("event_id").eq("user_id", userId).in("event_id", eventIds)
  ]);
  return {
    saved: new Set((savedResult.data ?? []).map((row) => String(row.event_id))),
    going: new Set((goingResult.data ?? []).map((row) => String(row.event_id)))
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
  const { data, error } = await supabase.from("events").select("*").order("start_date", { ascending: true });
  return error ? [] : ((data as ClassicEvent[] | null) ?? []);
}

export async function getReviewQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("review_queue").select("*").order("created_at", { ascending: false });
  return error ? [] : ((data as ReviewQueueItemType[] | null) ?? []);
}

export async function getAgentRuns() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(25);
  return error ? [] : ((data as AgentRun[] | null) ?? []);
}

export async function getSourceRegistry() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("source_registry").select("*").order("priority_weight", { ascending: false });
  return error ? [] : ((data as SourceRegistryEntry[] | null) ?? []);
}

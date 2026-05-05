import { geocodeLocation } from "@/lib/geocoding";
import { sampleAgentRuns, sampleEvents, sampleReviewItems } from "@/lib/sample-data";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun, ClassicEvent, ReviewQueueItemType, SourceRegistryEntry } from "@/lib/types";
import { haversineMiles } from "@/lib/utils";

export const eventTypes = [
  "Classic car show",
  "Cars & coffee",
  "Club meet",
  "Autojumble",
  "Rally / road run",
  "Museum / venue event",
  "American / hot rod",
  "Vintage / pre-war",
  "Austin / Mini / marque-specific"
];

export type EventSearchParams = {
  q?: string;
  location?: string;
  lat?: string;
  lng?: string;
  radius?: string;
  date?: string;
  types?: string[];
};

function applyDateFilter(events: ClassicEvent[], filter?: string) {
  const now = new Date("2026-05-05T12:00:00Z");
  const end = new Date(now);
  if (filter === "weekend") {
    const day = now.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7;
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + daysUntilSaturday);
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    return events.filter((event) => {
      const date = new Date(`${event.start_date}T12:00:00`);
      return date >= saturday && date <= sunday;
    });
  }
  if (filter === "7") end.setDate(now.getDate() + 7);
  if (filter === "30") end.setDate(now.getDate() + 30);
  if (filter === "7" || filter === "30") {
    return events.filter((event) => {
      const date = new Date(`${event.start_date}T12:00:00`);
      return date >= now && date <= end;
    });
  }
  return events;
}

function hasTypedLocation(params: EventSearchParams) {
  return Boolean(params.location?.trim() || (params.lat && params.lng));
}

function localFilter(events: ClassicEvent[], params: EventSearchParams, origin?: { latitude: number; longitude: number } | null) {
  let filtered = events.filter((event) => event.status === "published");
  const query = params.q?.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((event) =>
      [event.title, event.description, event.town, event.county, event.venue_name, event.event_type]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }
  if (params.types?.length) {
    filtered = filtered.filter((event) => params.types!.includes(event.event_type));
  }
  filtered = applyDateFilter(filtered, params.date);
  if (hasTypedLocation(params) && !origin && params.radius !== "uk") {
    return [];
  }
  if (origin) {
    filtered = filtered.map((event) => ({
      ...event,
      distance_miles:
        event.latitude && event.longitude
          ? Math.round(haversineMiles(origin, { latitude: event.latitude, longitude: event.longitude }))
          : null
    }));
    if (params.radius && params.radius !== "uk") {
      const radius = Number(params.radius);
      filtered = filtered.filter((event) => event.distance_miles != null && event.distance_miles <= radius);
    }
    filtered.sort((a, b) => (a.distance_miles ?? 9999) - (b.distance_miles ?? 9999));
  } else {
    filtered.sort((a, b) => a.start_date.localeCompare(b.start_date));
  }
  return filtered;
}

export async function getEvents(params: EventSearchParams = {}) {
  const coordinateOrigin =
    params.lat && params.lng && Number.isFinite(Number(params.lat)) && Number.isFinite(Number(params.lng))
      ? { latitude: Number(params.lat), longitude: Number(params.lng), label: "Current location" }
      : null;
  const origin = coordinateOrigin ?? (await geocodeLocation(params.location));
  const supabase = await createClient();

  if (!supabase) {
    return localFilter(sampleEvents, params, origin);
  }

  let query = supabase.from("events").select("*").eq("status", "published").gte("start_date", new Date().toISOString().slice(0, 10));
  if (params.types?.length) query = query.in("event_type", params.types);
  const { data, error } = await query.order("start_date", { ascending: true });
  if (error || !data) return localFilter(sampleEvents, params, origin);
  return localFilter(data as ClassicEvent[], params, origin);
}

export async function getEventBySlug(slug: string) {
  const supabase = await createClient();
  if (!supabase) return sampleEvents.find((event) => event.slug === slug) ?? null;

  const { data } = await supabase.from("events").select("*").eq("slug", slug).single();
  return (data as ClassicEvent | null) ?? sampleEvents.find((event) => event.slug === slug) ?? null;
}

export async function getAdminEvents() {
  const supabase = await createClient();
  if (!supabase) return sampleEvents;
  const { data } = await supabase.from("events").select("*").order("start_date", { ascending: true });
  return (data as ClassicEvent[] | null) ?? sampleEvents;
}

export async function getReviewQueue() {
  const supabase = await createClient();
  if (!supabase) return sampleReviewItems;
  const { data } = await supabase.from("review_queue").select("*").order("created_at", { ascending: false });
  return (data as ReviewQueueItemType[] | null) ?? sampleReviewItems;
}

export async function getAgentRuns() {
  const supabase = await createClient();
  if (!supabase) return sampleAgentRuns;
  const { data } = await supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(25);
  return (data as AgentRun[] | null) ?? sampleAgentRuns;
}

export async function getSourceRegistry() {
  const supabase = await createClient();
  if (!supabase) {
    return [
      {
        id: "local-source-1",
        domain: "bicesterheritage.co.uk",
        source_name: "Bicester Heritage",
        start_url: "https://bicesterheritage.co.uk/events/",
        source_type: "venue_or_museum",
        priority_weight: 90,
        is_active: true,
        notes: "Local development registry entry.",
        created_at: new Date().toISOString()
      },
      {
        id: "local-source-2",
        domain: "facebook.com",
        source_name: "Facebook",
        start_url: "https://facebook.com/",
        source_type: "facebook",
        priority_weight: 50,
        is_active: true,
        notes: "Requires strong date and location.",
        created_at: new Date().toISOString()
      }
    ] satisfies SourceRegistryEntry[];
  }
  const { data } = await supabase.from("source_registry").select("*").order("priority_weight", { ascending: false });
  return (data as SourceRegistryEntry[] | null) ?? [];
}

export async function getSavedEvents() {
  const supabase = await createClient();
  if (!supabase) return sampleEvents.slice(0, 3);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("saved_events").select("events(*)").eq("user_id", user.id).order("created_at", { ascending: false });
  const rows = data as { events: ClassicEvent | null }[] | null;
  return rows?.map((row) => row.events).filter((event): event is ClassicEvent => Boolean(event)) ?? [];
}

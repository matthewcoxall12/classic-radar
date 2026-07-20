import { listIndexableEvents } from "@/lib/public-events";

const categories = new Set(["Show", "Meet", "Autojumble", "Motorsport", "Run", "Other"]);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function invalid(message: string) {
  return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

function coordinate(value: string | null, min: number, max: number) {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error("The supplied coordinates are invalid.");
  return parsed;
}

function miles(lat: number, lng: number, eventLat: number, eventLng: number) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latDelta = radians(eventLat - lat);
  const lngDelta = radians(eventLng - lng);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(eventLat)) * Math.sin(lngDelta / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

function cursorFor(event: { startDate: string; featured?: boolean; id: string }) {
  return `${event.startDate}|${event.featured ? 1 : 0}|${event.id}`;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const latitude = coordinate(params.get("lat"), -90, 90);
    const longitude = coordinate(params.get("lng"), -180, 180);
    if ((latitude === null) !== (longitude === null)) return invalid("Latitude and longitude must be supplied together.");
    const limit = Number(params.get("limit") ?? 24);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return invalid("Limit must be between 1 and 50.");
    const radius = Number(params.get("radiusMiles") ?? 50);
    if (latitude !== null && (!Number.isFinite(radius) || radius < 5 || radius > 250)) return invalid("Search radius must be between 5 and 250 miles.");
    const from = params.get("from") ?? new Date().toISOString().slice(0, 10);
    const to = params.get("to");
    if (!isoDate.test(from) || (to && !isoDate.test(to))) return invalid("Dates must use YYYY-MM-DD.");
    if (to && to < from) return invalid("The end date must not be before the start date.");
    const category = params.get("category");
    if (category && !categories.has(category)) return invalid("The event category is invalid.");
    const cursor = params.get("cursor");

    let events = await listIndexableEvents(5_000);
    events = events.filter((event) => (event.endDate ?? event.startDate) >= from && (!to || event.startDate <= to));
    if (category) events = events.filter((event) => event.category === category);
    if (latitude !== null && longitude !== null) {
      events = events.filter((event) => event.latitude !== 0 && event.longitude !== 0 && miles(latitude, longitude, event.latitude, event.longitude) <= radius);
    }
    if (cursor) {
      const index = events.findIndex((event) => cursorFor(event) === cursor);
      if (index >= 0) events = events.slice(index + 1);
    }
    const hasMore = events.length > limit;
    const page = events.slice(0, limit);
    return Response.json(
      {
        events: page,
        nextCursor: hasMore ? cursorFor(page[page.length - 1]) : null,
        hasMore,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "The event search could not be completed.");
  }
}

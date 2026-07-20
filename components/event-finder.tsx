"use client";

import {
  ArrowRight,
  Bell,
  Bookmark,
  CalendarDays,
  CalendarPlus,
  CarFront,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Crown,
  ExternalLink,
  LockKeyhole,
  LocateFixed,
  MapPin,
  Menu,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { type EventCategory, type MotoringEvent } from "@/lib/events";
import { mailto, SITE_EMAILS } from "@/lib/site-contact";

type Coordinates = { latitude: number; longitude: number };
type EventWithDistance = MotoringEvent & { distance: number | null };
type Viewer = { displayName: string; email: string } | null;
type MemberTier = "visitor" | "free" | "roadbook";

const categories: Array<"All events" | EventCategory> = [
  "All events",
  "Show",
  "Meet",
  "Autojumble",
  "Motorsport",
  "Run",
  "Other",
];

const dateFilters = ["All dates", "Next 30 days", "This weekend"] as const;
type DateFilter = (typeof dateFilters)[number];

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, withAccountSecurity(init));
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return (await response.json()) as T;
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  const prefix = "__Host-cme_csrf=";
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : "";
}

function withAccountSecurity(init?: RequestInit): RequestInit | undefined {
  if (!init?.method || init.method === "GET") return init;
  return {
    ...init,
    headers: {
      "X-CME-CSRF": csrfToken(),
      ...init.headers,
    },
  };
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function distanceInMiles(a: Coordinates, b: Coordinates) {
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(b.latitude - a.latitude);
  const lngDelta = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(haversine));
}

function eventDateLabel(event: MotoringEvent) {
  const start = new Date(`${event.startDate}T12:00:00`);
  const end = event.endDate ? new Date(`${event.endDate}T12:00:00`) : null;
  const startDay = start.toLocaleDateString("en-GB", { day: "numeric" });
  const month = start
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
  if (!end) return `${startDay} ${month}`;
  const endDay = end.toLocaleDateString("en-GB", { day: "numeric" });
  const endMonth = end
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
  return month === endMonth
    ? `${startDay}–${endDay} ${month}`
    : `${startDay} ${month}–${endDay} ${endMonth}`;
}

function cardDate(event: MotoringEvent) {
  const date = new Date(`${event.startDate}T12:00:00`);
  return {
    day: date.toLocaleDateString("en-GB", { day: "2-digit" }),
    month: date
      .toLocaleDateString("en-GB", { month: "short" })
      .toUpperCase(),
  };
}

function matchesDateFilter(event: MotoringEvent, filter: DateFilter) {
  const eventStart = new Date(`${event.startDate}T12:00:00`);
  const eventEnd = new Date(`${event.endDate ?? event.startDate}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (eventEnd < today) return false;
  if (filter === "All dates") return true;

  if (filter === "Next 30 days") {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 30);
    return eventEnd >= today && eventStart <= limit;
  }

  const day = today.getDay();
  const saturdayOffset = day === 0 ? -1 : 6 - day;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + saturdayOffset);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return eventEnd >= saturday && eventStart <= sunday;
}

function apiDateRange(filter: DateFilter) {
  const format = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (filter === "All dates") return { from: format(today), to: null };
  if (filter === "Next 30 days") {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 30);
    return { from: format(today), to: format(limit) };
  }
  const day = today.getDay();
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (day === 0 ? -1 : 6 - day));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return { from: format(saturday), to: format(sunday) };
}

function eventCursor(event: MotoringEvent | undefined) {
  return event
    ? `${event.startDate}|${event.featured ? 1 : 0}|${event.id}`
    : null;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function icsDate(value: string) {
  return value.replaceAll("-", "");
}

function icsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function downloadEventCalendar(event: MotoringEvent) {
  const lastDay = event.endDate ?? event.startDate;
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClassicsGo//Weekend Roadbook//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@classic-motoring-events`,
    `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `DTSTART;VALUE=DATE:${icsDate(event.startDate)}`,
    `DTEND;VALUE=DATE:${icsDate(addDays(lastDay, 1))}`,
    `SUMMARY:${icsText(event.title)}`,
    `LOCATION:${icsText(`${event.venue}, ${event.town}, ${event.postcode}`)}`,
    `DESCRIPTION:${icsText(`${event.description}\n${event.officialUrl}`)}`,
    `URL:${event.officialUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const href = URL.createObjectURL(new Blob([calendar], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = `${event.id}.ics`;
  link.click();
  URL.revokeObjectURL(href);
}

function EventCard({
  event,
  isSaved,
  isGoing,
  attendancePending,
  viewer,
  onToggleSave,
  onToggleAttendance,
}: {
  event: EventWithDistance;
  isSaved: boolean;
  isGoing: boolean;
  attendancePending: boolean;
  viewer: boolean;
  onToggleSave: (id: string) => void;
  onToggleAttendance: (id: string) => void;
}) {
  const date = cardDate(event);
  const goingCount = Math.max(0, event.goingCount ?? 0);
  const sourceCue = (() => {
    if (!event.sourceVerification && !event.sourceLastCheckedAt) return null;
    if (event.sourceVerification === "organizer_verified") return "Organiser verified";
    if (event.sourceVerification === "partner_verified") return "Partner verified";
    if (event.sourceVerification === "source_checked") return "Source checked";
    if (!event.sourceLastCheckedAt) return "Curated listing";
    const checked = new Date(event.sourceLastCheckedAt);
    return Number.isNaN(checked.getTime())
      ? "Curated listing"
      : `Checked ${checked.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  })();
  const safeSourceUrl = (() => {
    try {
      const url = new URL(event.sourceUrl ?? "");
      return url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  })();

  return (
    <article className="event-card">
      <div className="event-image-wrap">
        <Image
          src={event.image}
          alt={`Illustrative classic motoring scene for ${event.title}`}
          className="event-image"
          fill
          unoptimized
          sizes="(max-width: 560px) calc(100vw - 24px), (max-width: 1120px) 50vw, 33vw"
        />
        <div className="date-ticket" aria-label={eventDateLabel(event)}>
          <strong>{date.day}</strong>
          <span>{date.month}</span>
        </div>
        <button
          className={`save-button ${isSaved ? "is-saved" : ""}`}
          type="button"
          onClick={() => onToggleSave(event.id)}
          aria-label={isSaved ? `Remove ${event.title} from saved` : `Save ${event.title}`}
          aria-pressed={isSaved}
        >
          <Bookmark size={19} fill={isSaved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="event-card-body">
        <div className="event-meta-top">
          <span className="category-label">
            <Tag size={14} /> {event.category}
          </span>
          <span>
            {event.distance === null
              ? event.countryCode
              : `${event.distance.toFixed(event.distance < 10 ? 1 : 0)} miles`}
          </span>
        </div>
        <h3>
          <Link href={`/events/${event.id}`}>{event.title}</Link>
        </h3>
        <p className="venue-line">
          <MapPin size={16} />
          <span>
            {event.venue} · {event.town}
          </span>
        </p>
        <p className="event-description">{event.description}</p>
        {sourceCue && (
          safeSourceUrl ? (
            <a className="event-source-cue" href={safeSourceUrl} target="_blank" rel="noreferrer">
              <ShieldCheck size={14} /> {sourceCue}
            </a>
          ) : (
            <span className="event-source-cue"><ShieldCheck size={14} /> {sourceCue}</span>
          )
        )}
        <div className="event-details">
          <span>
            <CalendarDays size={15} /> {eventDateLabel(event)}
          </span>
          <span>
            <Clock3 size={15} /> {event.startTime}
          </span>
          <span>
            <Tag size={15} /> {event.price}
          </span>
        </div>
        <div className="community-attendance" aria-live="polite">
          <span>
            <Users size={16} />
            <strong>{goingCount.toLocaleString("en-GB")}</strong> going
          </span>
          <button
            className={isGoing ? "is-going" : undefined}
            type="button"
            disabled={attendancePending}
            onClick={() => onToggleAttendance(event.id)}
            aria-pressed={isGoing}
            aria-label={
              viewer
                ? isGoing
                  ? `Mark that you are no longer going to ${event.title}`
                  : `Say you are going to ${event.title}`
                : `Sign in to say you are going to ${event.title}`
            }
          >
            {isGoing && <CheckCircle2 size={15} />}
            {attendancePending
              ? "Updating…"
              : isGoing
                ? "Going"
                : viewer
                  ? "I’m going"
                  : "Sign in to go"}
          </button>
        </div>
        <div className="event-card-actions">
          <a
            className="official-link"
            href={event.officialUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${event.officialLabel} for ${event.title} (opens in a new tab)`}
          >
            {event.officialLabel} <ExternalLink size={16} />
          </a>
          <button
            className="calendar-link"
            type="button"
            onClick={() => downloadEventCalendar(event)}
            aria-label={`Add ${event.title} to calendar`}
          >
            <CalendarPlus size={16} /> Calendar
          </button>
        </div>
      </div>
    </article>
  );
}

export default function EventFinder({
  viewer,
  initialEvents = [],
}: {
  viewer: Viewer;
  initialEvents?: MotoringEvent[];
}) {
  const [location, setLocation] = useState("");
  const [activeLocation, setActiveLocation] = useState("the UK and Europe");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [radius, setRadius] = useState(50);
  const [category, setCategory] = useState<(typeof categories)[number]>(
    "All events",
  );
  const [dateFilter, setDateFilter] = useState<DateFilter>("All dates");
  const [visibleCount, setVisibleCount] = useState(6);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [going, setGoing] = useState<Set<string>>(new Set());
  const [attendancePending, setAttendancePending] = useState<Set<string>>(
    new Set(),
  );
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [eventData, setEventData] = useState<MotoringEvent[]>(initialEvents);
  const [eventPagePending, setEventPagePending] = useState(false);
  const [nextEventCursor, setNextEventCursor] = useState<string | null>(
    initialEvents.length >= 24 ? eventCursor(initialEvents.at(-1)) : null,
  );
  const [hasMoreEvents, setHasMoreEvents] = useState(initialEvents.length >= 24);
  const eventQueryHydrated = useRef(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [memberTier, setMemberTier] = useState<MemberTier>(
    viewer ? "free" : "visitor",
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [priceFilter, setPriceFilter] = useState("All admission");
  const [garageOnly, setGarageOnly] = useState(false);
  const [garageMarques, setGarageMarques] = useState<string[]>([]);
  const [memberLocations, setMemberLocations] = useState<Array<{
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    radiusMiles: number;
  }>>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("classic-motoring-saved");
        if (stored) setSaved(new Set(JSON.parse(stored) as string[]));
      } catch {
        // Saved events are a convenience; the finder still works without storage.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const eventSearchParams = (cursor?: string | null) => {
    const params = new URLSearchParams({ limit: "50" });
    const dates = apiDateRange(dateFilter);
    params.set("from", dates.from);
    if (dates.to) params.set("to", dates.to);
    if (category !== "All events") params.set("category", category);
    if (coordinates) {
      params.set("lat", String(coordinates.latitude));
      params.set("lng", String(coordinates.longitude));
      params.set("radiusMiles", String(radius));
    }
    if (cursor) params.set("cursor", cursor);
    return params;
  };

  useEffect(() => {
    if (!eventQueryHydrated.current) {
      eventQueryHydrated.current = true;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setEventPagePending(true);
      fetchJson<{
        events?: MotoringEvent[];
        nextCursor?: string | null;
        hasMore?: boolean;
      }>(`/api/events?${eventSearchParams().toString()}`, {
        signal: controller.signal,
      })
        .then((payload) => {
          setEventData(Array.isArray(payload.events) ? payload.events : []);
          setNextEventCursor(payload.nextCursor ?? null);
          setHasMoreEvents(Boolean(payload.hasMore && payload.nextCursor));
          setVisibleCount(6);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setNotice("Event results could not be refreshed. Please try again.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setEventPagePending(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The query builder deliberately derives from these four search controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, coordinates, dateFilter, radius]);

  const loadMoreEvents = async () => {
    if (eventPagePending || !hasMoreEvents || !nextEventCursor) return;
    setEventPagePending(true);
    try {
      const payload = await fetchJson<{
        events?: MotoringEvent[];
        nextCursor?: string | null;
        hasMore?: boolean;
      }>(`/api/events?${eventSearchParams(nextEventCursor).toString()}`);
      const incoming = Array.isArray(payload.events) ? payload.events : [];
      setEventData((current) => {
        const merged = new Map(current.map((event) => [event.id, event]));
        incoming.forEach((event) => merged.set(event.id, event));
        return [...merged.values()];
      });
      setVisibleCount((count) => count + Math.max(6, incoming.length));
      setNextEventCursor(payload.nextCursor ?? null);
      setHasMoreEvents(Boolean(payload.hasMore && payload.nextCursor));
    } catch {
      setNotice("More events could not be loaded. Please try again.");
    } finally {
      setEventPagePending(false);
    }
  };

  useEffect(() => {
    if (!viewer) return;
    const controller = new AbortController();

    Promise.all([
      fetchJson<{
        data?: {
          member?: {
            tier?: "free" | "roadbook";
            homeArea?: {
              name: string;
              latitude: number;
              longitude: number;
              radiusMiles: number;
            } | null;
          };
        };
      }>("/api/member", { signal: controller.signal }),
      fetchJson<{
        data?: { items?: Array<{ eventId: string; event?: MotoringEvent }> };
      }>(
        "/api/member/saved",
        { signal: controller.signal },
      ),
      fetchJson<{
        data?: {
          items?: Array<{
            id: string;
            label: string;
            latitude: number;
            longitude: number;
            radiusMiles: number;
          }>;
        };
      }>("/api/member/locations", { signal: controller.signal }),
      fetchJson<{ data?: { items?: Array<{ make?: string }> } }>(
        "/api/member/vehicles",
        { signal: controller.signal },
      ),
      fetchJson<{ data?: { items?: Array<{ eventId: string }> } }>(
        "/api/member/attendance",
        { signal: controller.signal },
      ),
    ])
      .then(([
        memberPayload,
        savedPayload,
        locationPayload,
        vehiclePayload,
        attendancePayload,
      ]) => {
        const member = memberPayload.data?.member;
        setMemberTier(member?.tier === "roadbook" ? "roadbook" : "free");
        if (member?.homeArea) {
          setLocation(member.homeArea.name);
          setActiveLocation(member.homeArea.name);
          setCoordinates({
            latitude: member.homeArea.latitude,
            longitude: member.homeArea.longitude,
          });
          setRadius(member.homeArea.radiusMiles);
        }

        const savedItems = savedPayload.data?.items ?? [];
        const cloudIds = new Set(savedItems.map((item) => item.eventId));
        const savedEventRows = savedItems
          .map((item) => item.event)
          .filter((event): event is MotoringEvent => Boolean(event));
        if (savedEventRows.length > 0) {
          setEventData((current) => {
            const merged = new Map(current.map((event) => [event.id, event]));
            savedEventRows.forEach((event) => merged.set(event.id, event));
            return [...merged.values()];
          });
        }
        setMemberLocations(locationPayload.data?.items ?? []);
        setGarageMarques(
          (vehiclePayload.data?.items ?? [])
            .map((vehicle) => vehicle.make?.trim())
            .filter((make): make is string => Boolean(make)),
        );
        const attendanceIds = new Set(
          (attendancePayload.data?.items ?? []).map((item) => item.eventId),
        );
        setGoing(attendanceIds);

        const returnUrl = new URL(window.location.href);
        const pendingGoingId = returnUrl.searchParams.get("going");
        if (pendingGoingId) {
          returnUrl.searchParams.delete("going");
          window.history.replaceState(
            null,
            "",
            `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`,
          );

          if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(pendingGoingId)) {
            setNotice("That event could not be marked as Going.");
          } else if (attendanceIds.has(pendingGoingId)) {
            setNotice("You’re already marked as going to that event.");
          } else {
            setAttendancePending((current) =>
              new Set(current).add(pendingGoingId),
            );
            void fetch(
              "/api/member/attendance",
              withAccountSecurity({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eventId: pendingGoingId }),
                signal: controller.signal,
              }),
            )
              .then(async (response) => {
                const payload = (await response.json()) as {
                  data?: { going?: boolean; goingCount?: number };
                  error?: { message?: string };
                };
                if (
                  !response.ok ||
                  !payload.data?.going ||
                  typeof payload.data.goingCount !== "number"
                ) {
                  throw new Error(
                    payload.error?.message ||
                      "Attendance could not be updated.",
                  );
                }
                setGoing((current) => new Set(current).add(pendingGoingId));
                setEventData((current) =>
                  current.map((item) =>
                    item.id === pendingGoingId
                      ? { ...item, goingCount: payload.data?.goingCount ?? 0 }
                      : item,
                  ),
                );
                setNotice(
                  "You’re going — the public event total has been updated.",
                );
              })
              .catch((error: unknown) => {
                if (
                  !(error instanceof DOMException && error.name === "AbortError")
                ) {
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "Attendance could not be updated. Please try again.",
                  );
                }
              })
              .finally(() => {
                if (controller.signal.aborted) return;
                setAttendancePending((current) => {
                  const next = new Set(current);
                  next.delete(pendingGoingId);
                  return next;
                });
              });
          }
        }
        let localIds: string[] = [];
        try {
          localIds = JSON.parse(
            window.localStorage.getItem("classic-motoring-saved") || "[]",
          ) as string[];
        } catch {
          localIds = [];
        }
        const combined = new Set([...cloudIds, ...localIds]);
        setSaved(combined);
        window.localStorage.setItem(
          "classic-motoring-saved",
          JSON.stringify([...combined]),
        );

        const missingCloudIds = localIds.filter((id) => !cloudIds.has(id));
        void Promise.all(
          missingCloudIds.slice(0, 100).map((eventId) =>
            fetch("/api/member/saved", withAccountSecurity({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eventId }),
            })),
          ),
        ).then((responses) => {
          if (responses.some((response) => !response.ok) || missingCloudIds.length > 100) {
            setNotice("Some device saves could not be synced. They remain saved on this device.");
          }
        }).catch(() => {
          setNotice("Some device saves could not be synced. They remain saved on this device.");
        });
      })
      .catch(() => {
        setNotice("Your account could not be synced just now; device saves still work.");
      });

    return () => controller.abort();
  }, [initialEvents, viewer]);

  const results = useMemo<EventWithDistance[]>(() => {
    return eventData
      .map((event) => ({
        ...event,
        distance: coordinates
          ? distanceInMiles(coordinates, {
              latitude: event.latitude,
              longitude: event.longitude,
            })
          : null,
      }))
      .filter((event) => event.distance === null || event.distance <= radius)
      .filter((event) => category === "All events" || event.category === category)
      .filter((event) => matchesDateFilter(event, dateFilter))
      .filter(
        (event) =>
          memberTier !== "roadbook" ||
          priceFilter === "All admission" ||
          (priceFilter === "Free" && event.price.toLowerCase().startsWith("free")) ||
          event.price === priceFilter,
      )
      .filter((event) => {
        if (!garageOnly || garageMarques.length === 0) return true;
        const haystack = `${event.title} ${event.description}`.toLowerCase();
        return garageMarques.some((marque) =>
          haystack.includes(marque.toLowerCase()),
        );
      })
      .filter((event) => !savedOnly || saved.has(event.id))
      .sort((a, b) => {
        const dateOrder = a.startDate.localeCompare(b.startDate);
        return dateOrder || (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY);
      });
  }, [category, coordinates, dateFilter, eventData, garageMarques, garageOnly, memberTier, priceFilter, radius, saved, savedOnly]);

  const toggleSave = (id: string) => {
    const removing = saved.has(id);
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(
          "classic-motoring-saved",
          JSON.stringify([...next]),
        );
      } catch {
        // Ignore unavailable local storage.
      }
      return next;
    });

    if (!viewer) {
      setNotice(
        removing
          ? "Removed from this device."
          : "Saved on this device — create a free account to sync it everywhere.",
      );
      return;
    }

    const request = removing
      ? fetch(`/api/member/saved?eventId=${encodeURIComponent(id)}`, withAccountSecurity({
          method: "DELETE",
        }))
      : fetch("/api/member/saved", withAccountSecurity({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: id }),
        }));

    void request.then((response) => {
      if (!response.ok) throw new Error();
      setNotice(removing ? "Removed from your roadbook." : "Saved to your roadbook.");
    }).catch(() => {
      setSaved((current) => {
        const restored = new Set(current);
        if (removing) restored.add(id);
        else restored.delete(id);
        try {
          window.localStorage.setItem(
            "classic-motoring-saved",
            JSON.stringify([...restored]),
          );
        } catch {
          // The cloud error is still surfaced when local storage is unavailable.
        }
        return restored;
      });
      setNotice("We could not sync that save. Please try again.");
    });
  };

  const toggleAttendance = (id: string) => {
    if (!viewer) {
      const returnTo = `/?going=${encodeURIComponent(id)}#events`;
      window.location.assign(
        `/sign-in?return_to=${encodeURIComponent(returnTo)}`,
      );
      return;
    }
    if (attendancePending.has(id)) return;

    const wasGoing = going.has(id);
    const previousCount =
      eventData.find((item) => item.id === id)?.goingCount ?? 0;
    setAttendancePending((current) => new Set(current).add(id));
    setGoing((current) => {
      const next = new Set(current);
      if (wasGoing) next.delete(id);
      else next.add(id);
      return next;
    });
    setEventData((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              goingCount: Math.max(0, previousCount + (wasGoing ? -1 : 1)),
            }
          : item,
      ),
    );

    const request = wasGoing
      ? fetch(
          `/api/member/attendance?eventId=${encodeURIComponent(id)}`,
          withAccountSecurity({ method: "DELETE" }),
        )
      : fetch(
          "/api/member/attendance",
          withAccountSecurity({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: id }),
          }),
        );

    void request
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: { going?: boolean; goingCount?: number };
          error?: { message?: string };
        };
        if (!response.ok || typeof payload.data?.goingCount !== "number") {
          throw new Error(payload.error?.message || "Attendance could not be updated.");
        }
        setGoing((current) => {
          const next = new Set(current);
          if (payload.data?.going) next.add(id);
          else next.delete(id);
          return next;
        });
        setEventData((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, goingCount: payload.data?.goingCount ?? 0 }
              : item,
          ),
        );
        setNotice(
          payload.data.going
            ? "You’re going — the public event total has been updated."
            : "You’re no longer marked as going.",
        );
      })
      .catch((error) => {
        setGoing((current) => {
          const restored = new Set(current);
          if (wasGoing) restored.add(id);
          else restored.delete(id);
          return restored;
        });
        setEventData((current) =>
          current.map((item) =>
            item.id === id ? { ...item, goingCount: previousCount } : item,
          ),
        );
        setNotice(
          error instanceof Error
            ? error.message
            : "Attendance could not be updated. Please try again.",
        );
      })
      .finally(() => {
        setAttendancePending((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      });
  };

  const resolveLocation = async (value: string) => {
    const cleanValue = value.trim();
    if (!cleanValue) throw new Error("Enter a town, city or postcode.");

    const response = await fetch(`/api/geocode?q=${encodeURIComponent(cleanValue)}`);
    const payload = (await response.json()) as {
      label?: string;
      latitude?: number;
      longitude?: number;
      error?: string;
    };
    if (!response.ok || payload.latitude == null || payload.longitude == null) {
      throw new Error(payload.error || "We couldn't find that UK or European location.");
    }
    return {
      label: payload.label || cleanValue,
      latitude: payload.latitude,
      longitude: payload.longitude,
    };
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    setSearching(true);
    setNotice("");
    try {
      const resolved = await resolveLocation(location);
      setCoordinates({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
      });
      setActiveLocation(resolved.label);
      setLocation(resolved.label);
      setVisibleCount(6);
      document.getElementById("events")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Location search failed.");
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setNotice("This browser does not support location services.");
      return;
    }
    setLocating(true);
    setNotice("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setActiveLocation("your current location");
        setLocation("Your current location");
        setNotice("Location found — showing the closest events.");
        setVisibleCount(6);
        setLocating(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was declined. You can still enter a town or postcode."
            : "We couldn't get your location. Try entering a town or postcode.";
        setNotice(message);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  return (
    <main>
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#top" aria-label="ClassicsGo home">
            <Image
              className="brand-logo-image"
              src="/branding/classicsgo-logo-v2-512.png"
              width={43}
              height={43}
              alt=""
              aria-hidden="true"
              unoptimized
              priority
            />
            <span>
              <strong>ClassicsGo</strong>
              <small>The weekend roadbook</small>
            </span>
          </a>

          <nav className="desktop-nav" aria-label="Main navigation">
            <a href="#events">Find events</a>
            <a href="/membership">Membership</a>
            <a href="/clubs">For clubs</a>
            <a href="/submit-event">Add an event</a>
          </nav>

          <div className="header-actions">
            <button
              className={`saved-link ${savedOnly ? "saved-active" : ""}`}
              type="button"
              aria-pressed={savedOnly}
              onClick={() => {
                setSavedOnly((active) => !active);
                document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Bookmark size={17} /> Saved
              {saved.size > 0 && <span>{saved.size}</span>}
            </button>
            {viewer ? (
              <a
                className={`account-link ${memberTier === "roadbook" ? "roadbook-account" : ""}`}
                href="/account"
              >
                {memberTier === "roadbook" ? <Crown size={17} /> : <UserCircle size={18} />}
                <span>My roadbook</span>
              </a>
            ) : (
              <>
                <a className="sign-in-link" href="/sign-in?return_to=%2Faccount">Sign in</a>
                <a className="account-link" href="/sign-up?return_to=%2Faccount">
                  <UserCircle size={18} /><span>Create free account</span>
                </a>
              </>
            )}
          </div>

          <button
            className="menu-button"
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <a href="#events" onClick={() => setMobileMenuOpen(false)}>
              Find events
            </a>
            <a href="/membership" onClick={() => setMobileMenuOpen(false)}>
              Membership
            </a>
            <a href="/clubs" onClick={() => setMobileMenuOpen(false)}>
              For clubs
            </a>
            <a href="/submit-event" onClick={() => setMobileMenuOpen(false)}>
              Add an event
            </a>
            {viewer ? (
              <a href="/account" onClick={() => setMobileMenuOpen(false)}>My roadbook</a>
            ) : (
              <>
                <a href="/sign-in?return_to=%2Faccount" onClick={() => setMobileMenuOpen(false)}>Sign in</a>
                <a href="/sign-up?return_to=%2Faccount" onClick={() => setMobileMenuOpen(false)}>Create free account</a>
              </>
            )}
          </nav>
        )}
      </header>

      <section className="hero" id="top">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">ClassicsGo · UK &amp; European classic car event finder</p>
            <h1>Find classic car events near you with ClassicsGo</h1>
            <p className="hero-intro">
              ClassicsGo helps drivers and enthusiasts search local classic-car
              shows, club meets, autojumbles and historic motorsport across the
              UK and Europe by town, postcode or browser location, then visit the official organiser
              page for the latest details. Searching is free; signing in with
              Google or email lets members sync saved events and mark events as Going.
            </p>
            <div className="hero-proof">
              <span>
                <ShieldCheck size={18} /> Official links
              </span>
              <span>
                <Route size={18} /> Date ordered
              </span>
              <span>
                <Sparkles size={18} /> Free to use
              </span>
            </div>
          </div>

          <div className="hero-photo" role="img" aria-label="A classic green roadster on a European country road">
            <div className="photo-note">
              <MapPin size={15} /> From local meets to continental tours
            </div>
          </div>
        </div>

        <div className="shell search-shell">
          <form className="search-ticket" onSubmit={handleSearch}>
            <div className="search-field location-field">
              <MapPin size={22} aria-hidden="true" />
              <label>
                <span>Starting near</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Town, city or postcode"
                  aria-label="Town, city or postcode"
                />
              </label>
            </div>

            <div className="search-field radius-field">
              <Route size={21} aria-hidden="true" />
              <label>
                <span>Search radius</span>
                <select
                  value={radius}
                  onChange={(event) => setRadius(Number(event.target.value))}
                  aria-label="Search radius"
                >
                  {[10, 25, 50, 75, 100, 150].map((miles) => (
                    <option value={miles} key={miles}>
                      Within {miles} miles
                    </option>
                  ))}
                </select>
              </label>
              <ChevronDown className="select-chevron" size={18} aria-hidden="true" />
            </div>

            <button className="find-button" type="submit" disabled={searching}>
              <Search size={19} /> {searching ? "Finding…" : "Find events"}
            </button>
            <span className="ticket-cut" aria-hidden="true" />
            <button
              className="locate-button"
              type="button"
              onClick={useMyLocation}
              disabled={locating}
            >
              <LocateFixed size={20} />
              {locating ? "Locating…" : "Use my location"}
            </button>
          </form>
          <div className="route-note" aria-live="polite">
            <span className="compass" aria-hidden="true">N</span>
            <span className="route-dashes" aria-hidden="true" />
            <span>{notice || `Your roadbook starts near ${activeLocation}`}</span>
          </div>
          <aside className="google-data-note" aria-label="Google sign-in and your data">
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              <strong>Google sign-in is optional.</strong> Event search works
              without an account. If you sign in, ClassicsGo uses your verified
              email address and basic profile name only to secure your account
              and sync saved events and Going choices. We never receive your
              Google password. <a href="/privacy">Read our privacy notice</a>.
            </p>
          </aside>
          <p className="geocode-attribution">
            Location search © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
          </p>
          {memberTier === "roadbook" && memberLocations.length > 0 && (
            <div className="followed-area-switcher" aria-label="Followed areas">
              <span><MapPin size={14} /> Followed areas</span>
              <div>
                {memberLocations.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    aria-pressed={activeLocation === area.label}
                    onClick={() => {
                      setCoordinates({ latitude: area.latitude, longitude: area.longitude });
                      setLocation(area.label);
                      setActiveLocation(area.label);
                      setRadius(area.radiusMiles);
                      setVisibleCount(6);
                      setNotice(`Switched your roadbook to ${area.label}.`);
                    }}
                  >
                    {area.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="events-section" id="events">
        <div className="shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your weekend roadbook</p>
              <h2>{savedOnly ? "Saved events" : "Upcoming"} near {activeLocation}</h2>
              <p>
                {results.length === 0
                  ? savedOnly
                    ? "No saved events match this route yet."
                    : "No events match those filters yet."
                  : `${results.length} ${savedOnly ? "saved " : ""}event${results.length === 1 ? "" : "s"} within ${radius} miles, ordered by date.`}
              </p>
            </div>
            <div className="verified-note">
              <CheckCircle2 size={18} /> Every card links to the organiser
            </div>
          </div>

          <div className={`member-status-banner tier-${memberTier}`}>
            <div>
              {memberTier === "roadbook" ? <Crown size={21} /> : <Bell size={21} />}
              <span>
                <strong>
                  {memberTier === "roadbook"
                    ? "Roadbook Member"
                    : viewer
                      ? "Your free roadbook"
                      : "Keep this weekend handy"}
                </strong>
                <small>
                  {memberTier === "roadbook"
                    ? "Custom event watches, live calendars and trip planning are unlocked."
                    : viewer
                      ? "Saved events sync across devices. Upgrade when you want smarter planning."
                      : "Create a free account to sync saved events and receive essential event updates."}
                </small>
              </span>
            </div>
            <a
              href={
                memberTier === "roadbook"
                  ? "/account"
                  : viewer
                    ? "/membership"
                    : "/sign-up?return_to=%2Faccount"
              }
            >
              {memberTier === "roadbook" ? "Open my roadbook" : viewer ? "See member features" : "Create free account"}
              <ArrowRight size={17} />
            </a>
          </div>

          <div className="filters">
            <div className="filter-scroll" role="group" aria-label="Event filters">
              <button
                type="button"
                className={savedOnly ? "filter-active" : ""}
                aria-pressed={savedOnly}
                onClick={() => {
                  setSavedOnly((active) => !active);
                  setVisibleCount(6);
                }}
              >
                Saved{saved.size > 0 ? ` (${saved.size})` : ""}
              </button>
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={category === item ? "filter-active" : ""}
                  aria-pressed={category === item}
                  onClick={() => {
                    setCategory(item);
                    setVisibleCount(6);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="date-filter">
              <CalendarDays size={17} />
              <select
                value={dateFilter}
                onChange={(event) => {
                  setDateFilter(event.target.value as DateFilter);
                  setVisibleCount(6);
                }}
                aria-label="Filter by date"
              >
                {dateFilters.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
            {memberTier === "roadbook" ? (
              <button
                className={`advanced-filter-button ${advancedOpen ? "filter-active" : ""}`}
                type="button"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <SlidersHorizontal size={16} /> More filters
              </button>
            ) : (
              <a className="advanced-filter-locked" href="/membership">
                <LockKeyhole size={15} /> Advanced filters
              </a>
            )}
          </div>

          {advancedOpen && memberTier === "roadbook" && (
            <div className="advanced-filter-panel">
              <div>
                <p className="eyebrow">Member filters</p>
                <strong>Shape this roadbook</strong>
              </div>
              <label>
                Admission
                <select
                  value={priceFilter}
                  onChange={(event) => setPriceFilter(event.target.value)}
                >
                  <option>All admission</option>
                  <option>Free</option>
                  <option>Ticketed</option>
                  <option>Museum admission</option>
                </select>
              </label>
              {garageMarques.length > 0 ? (
                <div className="garage-filter-control">
                  <button
                    type="button"
                    className={garageOnly ? "garage-filter-active" : ""}
                    aria-pressed={garageOnly}
                    onClick={() => {
                      setGarageOnly((active) => !active);
                      setVisibleCount(6);
                    }}
                  >
                    <CarFront size={16} /> Match my garage
                  </button>
                  <small>{garageMarques.join(", ")}</small>
                </div>
              ) : (
                <a href="/account?tab=garage">
                  Add a favourite marque <ArrowRight size={15} />
                </a>
              )}
            </div>
          )}

          {memberTier !== "roadbook" && (
            <aside className="sponsor-slot" aria-label="Partner message">
              <span>Regional partner space</span>
              <p>Relevant local garages, specialists and venues will help keep event discovery free.</p>
              <a href="/clubs">Partner with the roadbook</a>
            </aside>
          )}

          {results.length > 0 ? (
            <>
              <div className="event-grid">
                {results.slice(0, visibleCount).map((event) => (
                  <EventCard
                    event={event}
                    key={event.id}
                    isSaved={saved.has(event.id)}
                    isGoing={going.has(event.id)}
                    attendancePending={attendancePending.has(event.id)}
                    viewer={Boolean(viewer)}
                    onToggleSave={toggleSave}
                    onToggleAttendance={toggleAttendance}
                  />
                ))}
              </div>
              {(visibleCount < results.length || hasMoreEvents) && (
                <button
                  className="show-more"
                  type="button"
                  disabled={eventPagePending}
                  onClick={() => {
                    if (visibleCount < results.length) {
                      setVisibleCount((count) => count + 6);
                    } else {
                      void loadMoreEvents();
                    }
                  }}
                >
                  {eventPagePending ? "Loading events…" : "Show more events"}{" "}
                  <ArrowRight size={18} />
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Route size={30} />
              <h3>{savedOnly ? "No saved events here yet" : "Try widening the route"}</h3>
              <p>{savedOnly ? "Save an event from the main roadbook, or return to all events." : "Increase the radius or choose “All events” to see more days out."}</p>
              <button
                type="button"
                onClick={() => {
                  setSavedOnly(false);
                  setRadius(100);
                  setCategory("All events");
                  setDateFilter("All dates");
                }}
              >
                {savedOnly ? "Show all events" : "Reset filters"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="membership-strip" aria-labelledby="membership-strip-title">
        <div className="shell membership-strip-grid">
          <div>
            <p className="eyebrow">Roadbook membership</p>
            <h2 id="membership-strip-title">Less searching. Better weekends.</h2>
            <p>
              Keep discovery free, then let Roadbook Member watch for the right
              events, organise the season and keep every plan in one place.
            </p>
          </div>
          <div className="membership-feature-list">
            <span><Bell size={18} /> Tailored event watchlists</span>
            <span><CalendarPlus size={18} /> Live calendar feed</span>
            <span><Route size={18} /> Shared weekend roadbooks</span>
            <span><Crown size={18} /> Ad-free member experience</span>
          </div>
          <div className="membership-strip-price">
            <span>From</span>
            <strong>£24.99</strong>
            <small>per year</small>
            <a href="/membership">Compare membership <ArrowRight size={17} /></a>
          </div>
        </div>
      </section>

      <section className="community-section" id="clubs">
        <div className="shell community-grid">
          <div className="community-copy">
            <p className="eyebrow">Built with the community</p>
            <h2>A better noticeboard for Europe’s classic-car scene</h2>
            <p>
              Clubs and organisers can share their events with local enthusiasts.
              Every submission is reviewed before it appears, keeping the roadbook
              useful and trustworthy.
            </p>
            <div className="community-points">
              <span><Users size={19} /> Club and museum profiles</span>
              <span><CheckCircle2 size={19} /> Reviewed event submissions</span>
              <span><MapPin size={19} /> Local reach without social algorithms</span>
            </div>
          </div>
          <div className="community-card" id="submit">
            <span className="stamp">Organisers</span>
            <h3>Have an event to add?</h3>
            <p>
              Send us the date, location and official link. Listing a genuine
              community event is free.
            </p>
            <a href="/submit-event">
              Submit an event <ArrowRight size={18} />
            </a>
            <small>Submissions are held for review before publication.</small>
          </div>
        </div>
      </section>

      <section className="partner-strip">
        <div className="shell partner-inner">
          <div>
            <p className="eyebrow">For clubs and local firms</p>
            <h2>Reach people already planning a motoring day out.</h2>
          </div>
          <a href="/clubs">
            Explore partnerships <ArrowRight size={18} />
          </a>
        </div>
      </section>

      <footer>
        <div className="shell footer-inner">
          <a className="brand footer-brand" href="#top">
            <Image
              className="brand-logo-image"
              src="/branding/classicsgo-logo-v2-512.png"
              width={37}
              height={37}
              alt=""
              aria-hidden="true"
              unoptimized
            />
            <span><strong>ClassicsGo</strong><small>The weekend roadbook</small></span>
          </a>
          <p>Helping the classic-car community find the next great day out.</p>
          <div>
            <a href="#events">Events</a>
            <a href="/membership">Membership</a>
            {viewer ? <a href="/account">My roadbook</a> : <><a href="/sign-in?return_to=%2Faccount">Sign in</a><a href="/sign-up?return_to=%2Faccount">Create account</a></>}
            <a href="/submit-event">Add an event</a>
            <a href="/clubs">For clubs</a>
            <a href={mailto(SITE_EMAILS.support)}>{SITE_EMAILS.support}</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

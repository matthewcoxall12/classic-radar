import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatEventDate(event: { start_date: string; start_time?: string | null; end_date?: string | null }) {
  const date = new Date(`${event.start_date}T12:00:00`);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);

  if (!event.start_time) return formatted;
  return `${formatted}, ${event.start_time.slice(0, 5)}`;
}

export function haversineMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadiusMiles = 3958.7613;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function locationLabel(event: { venue_name?: string | null; town?: string | null; county?: string | null; country_code?: string | null }) {
  const country = event.country_code && event.country_code !== "GB"
    ? new Intl.DisplayNames(["en-GB"], { type: "region" }).of(event.country_code.toUpperCase())
    : null;
  return [event.venue_name, event.town, event.county, country].filter(Boolean).join(", ");
}

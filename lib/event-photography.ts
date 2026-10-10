// Only reviewed, reusable photographs belong here. A discovered image_url is
// not evidence of permission or even proof that the URL returns an image.
export const eventPhotographs = {
  "veteran-car-run-2026-2026-11-01-1a94f6bf": {
    src: "/images/events/london-brighton-2024.webp",
    alt: "A De Dietrich veteran car taking part in the 2024 London to Brighton Veteran Car Run",
    context: "London to Brighton · 2024 edition",
    credit: "Jon Lavis",
    source:
      "https://commons.wikimedia.org/wiki/File:De_Dietrich,_3_JOT,_London_to_Brighton_Veteran_Car_Run_2024,_24_CV_1904_-_118.jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  "festival-of-speed-2027-07-15-92f3a6fb": {
    src: "/images/events/goodwood-2024.webp",
    alt: "Visitors walking through the Goodwood Festival of Speed in July 2024",
    context: "Festival of Speed · 2024 edition",
    credit: "Francisco Antunes",
    source:
      "https://commons.wikimedia.org/wiki/File:Goodwood_Festival_of_Speed_(53865101823).jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
} as const;

export function getEventPhotograph(slug: string) {
  return Object.hasOwn(eventPhotographs, slug)
    ? eventPhotographs[slug as keyof typeof eventPhotographs]
    : null;
}

export function submittedEventImage(event: { id?: string; created_by?: string | null; image_url?: string | null }) {
  if (!event.id || !event.created_by || !event.image_url) return null;
  try {
    const image = new URL(event.image_url);
    const prefix = `/storage/v1/object/public/event-images/${event.created_by}/${event.id}/`;
    return image.origin === "https://rnayhhsurmztrohtftqo.supabase.co" &&
      !image.username && !image.password && !image.search && !image.hash &&
      image.pathname.startsWith(prefix) &&
      /^[a-f0-9-]+\.(?:jpe?g|png|webp)$/i.test(image.pathname.slice(prefix.length))
      ? image.toString() : null;
  } catch { return null; }
}

export function eventImageUrl(event: { id?: string; slug: string; created_by?: string | null; image_url?: string | null }) {
  return submittedEventImage(event) || getEventPhotograph(event.slug)?.src || null;
}

export function eventDatePanel(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return null;
  return {
    day: String(parsed.getUTCDate()).padStart(2, "0"),
    month: parsed.toLocaleDateString("en-GB", {
      month: "short",
      timeZone: "UTC",
    }),
    weekday: parsed.toLocaleDateString("en-GB", {
      weekday: "long",
      timeZone: "UTC",
    }),
    year: String(parsed.getUTCFullYear()),
  };
}

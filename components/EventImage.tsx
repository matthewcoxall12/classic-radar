import Image from "next/image";
import { CalendarDays } from "lucide-react";
import { eventDatePanel, getEventPhotograph } from "@/lib/event-photography";
import type { ClassicEvent } from "@/lib/types";
import { eventPhotograph } from "@/lib/photography";
export function EventImage({
  type,
  event,
  seed = "",
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 600px",
}: {
  type: string;
  event?: Pick<ClassicEvent, "slug" | "title" | "start_date">;
  seed?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (event) {
    const actual = getEventPhotograph(event.slug);
    if (actual)
      return (
        <figure className="event-image" aria-label={actual.context}>
          <Image
            src={actual.src}
            alt={actual.alt}
            fill
            sizes={sizes}
            priority={priority}
            className="object-cover"
          />
        </figure>
      );
    const date = eventDatePanel(event.start_date);
    return (
      <div
        className="event-date-panel"
        aria-label={`Event date: ${event.start_date}. Event photo not yet supplied.`}
      >
        <div className="date-panel-top">
          <CalendarDays size={18} aria-hidden="true" />
          <span>{type}</span>
        </div>
        <div className="date-panel-date">
          <strong>{date?.day || "—"}</strong>
          <span>
            {date?.month}
            <small>{date?.year}</small>
          </span>
        </div>
        <div className="date-panel-bottom">
          <span>{date?.weekday || "Date to be confirmed"}</span>
          <span>Event photo to follow</span>
        </div>
      </div>
    );
  }
  const photo = eventPhotograph(type, seed);
  return (
    <figure className="event-image">
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
      <figcaption>
        Illustrative photograph · <a href="/photography">Credits</a>
      </figcaption>
    </figure>
  );
}

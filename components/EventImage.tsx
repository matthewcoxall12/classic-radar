import Image from "next/image";
import { eventPhotograph } from "@/lib/photography";
export function EventImage({
  type,
  seed = "",
  priority = false,
}: {
  type: string;
  seed?: string;
  priority?: boolean;
}) {
  const photo = eventPhotograph(type, seed);
  return (
    <figure className="event-image">
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px"
        priority={priority}
        className="object-cover"
      />
      <figcaption>
        Illustrative photograph · <a href="/photography">Credits</a>
      </figcaption>
    </figure>
  );
}

"use client";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { ClassicEvent } from "@/lib/types";
import { formatEventDate } from "@/lib/utils";
export default function EventMap({ events }: { events: ClassicEvent[] }) {
  const plotted = events.filter(
    (e) =>
      e.latitude != null &&
      e.longitude != null &&
      Number.isFinite(Number(e.latitude)) &&
      Number.isFinite(Number(e.longitude)),
  );
  if (!plotted.length)
    return (
      <div className="empty-state">
        <h2>No map locations available</h2>
        <p>
          These listings do not yet have coordinates. Use the list to see their
          venue details.
        </p>
      </div>
    );
  const bounds = plotted.map(
    (e) => [Number(e.latitude), Number(e.longitude)] as [number, number],
  );
  return (
    <>
      <p className="text-xs text-muted mb-3">
        Showing {plotted.length} of {events.length} results with map
        coordinates. Select a marker for event details.
      </p>
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [35, 35], maxZoom: 12 }}
        style={{ height: 480, width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {plotted.map((e) => (
          <CircleMarker
            key={e.id}
            center={[Number(e.latitude), Number(e.longitude)]}
            radius={9}
            pathOptions={{
              color: "#173B32",
              fillColor: "#B69758",
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{e.title}</strong>
              <p>{formatEventDate(e)}</p>
              <a href={`/events/${e.slug}`}>View event →</a>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <details className="mt-4">
        <summary className="text-sm font-semibold cursor-pointer">
          Event links for this map
        </summary>
        <ul className="mt-3 grid gap-2">
          {plotted.map((event) => (
            <li key={event.id}>
              <a
                className="text-sm underline text-racing"
                href={`/events/${event.slug}`}
              >
                {event.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-muted mt-3">
        Map tiles are supplied by OpenStreetMap. Your browser contacts their
        tile service when this view is opened.
      </p>
    </>
  );
}

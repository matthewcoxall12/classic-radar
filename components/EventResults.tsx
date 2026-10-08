"use client";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { List, Map } from "lucide-react";
import type { ClassicEvent } from "@/lib/types";
const EventMap = dynamic(() => import("@/components/EventMap"), {
  ssr: false,
  loading: () => <p role="status">Loading the map…</p>,
});
export function EventResults({
  events,
  children,
}: {
  events: ClassicEvent[];
  children: ReactNode;
}) {
  const [view, setView] = useState("list");
  return (
    <>
      <div
        className="result-view-toggle"
        role="group"
        aria-label="Result display"
      >
        <button
          type="button"
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          <List size={16} />
          List
        </button>
        <button
          type="button"
          aria-pressed={view === "map"}
          onClick={() => setView("map")}
        >
          <Map size={16} />
          Map
        </button>
      </div>
      {view === "list" ? (
        children
      ) : (
        <div className="mt-5">
          <EventMap
            key={events.map((event) => event.id).join(",")}
            events={events}
          />
        </div>
      )}
    </>
  );
}

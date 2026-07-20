"use client";

import { Crosshair, MapPin } from "lucide-react";
import { useRef, useState } from "react";

type LocationSearchProps = {
  defaultValue?: string;
  defaultLatitude?: string;
  defaultLongitude?: string;
};

export function LocationSearch({ defaultValue = "", defaultLatitude = "", defaultLongitude = "" }: LocationSearchProps) {
  const [latitude, setLatitude] = useState(defaultLatitude);
  const [longitude, setLongitude] = useState(defaultLongitude);
  const [status, setStatus] = useState("");
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  function useCurrentLocation() {
    const savedLatitude = window.sessionStorage.getItem("classicsgo-lat");
    const savedLongitude = window.sessionStorage.getItem("classicsgo-lng");
    if (savedLatitude && savedLongitude) {
      setLatitude(savedLatitude);
      setLongitude(savedLongitude);
      if (latitudeRef.current) latitudeRef.current.value = savedLatitude;
      if (longitudeRef.current) longitudeRef.current.value = savedLongitude;
      setStatus("Current location ready. Set a radius, then press Find events.");
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus("Location access is not available in this browser.");
      return;
    }

    setStatus("Requesting location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude.toFixed(3);
        const nextLongitude = position.coords.longitude.toFixed(3);
        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        if (latitudeRef.current) latitudeRef.current.value = nextLatitude;
        if (longitudeRef.current) longitudeRef.current.value = nextLongitude;
        window.sessionStorage.setItem("classicsgo-lat", nextLatitude);
        window.sessionStorage.setItem("classicsgo-lng", nextLongitude);
        setStatus("Current location ready. Set a radius, then press Find events.");
      },
      () => {
        setStatus("Location permission was not granted. You can still enter a postcode.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block min-w-0 flex-1">
          <span className="mb-1 block text-sm font-bold text-ink sm:hidden">Postcode, town or city</span>
          <MapPin className="pointer-events-none absolute left-3 top-[calc(50%+10px)] h-5 w-5 -translate-y-1/2 text-racing sm:top-1/2" />
          <input
            name="location"
            defaultValue={defaultValue}
            maxLength={120}
            onChange={() => {
              setLatitude("");
              setLongitude("");
              setStatus("");
            }}
            autoComplete="postal-code"
            inputMode="text"
            aria-label="Postcode, town or city"
            className="focus-ring min-h-12 w-full rounded-md border border-ink/15 bg-paper py-2 pl-10 pr-3 text-base font-semibold text-ink"
          />
        </label>
        <button
          type="button"
          onClick={useCurrentLocation}
          className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-racing/25 bg-racing/10 px-4 text-sm font-black text-racing transition hover:bg-racing hover:text-paper"
        >
          <Crosshair className="h-4 w-4" />
          Use my location
        </button>
      </div>
      <input ref={latitudeRef} type="hidden" name="lat" value={latitude} />
      <input ref={longitudeRef} type="hidden" name="lng" value={longitude} />
      {status ? <p className="text-xs font-bold text-muted">{status}</p> : null}
    </div>
  );
}

export function dateRange(filter?: string, now = new Date()) {
  // The directory uses UK calendar dates even when its server runs in UTC.
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now).split("-").map(Number);
  const start = new Date(
    Date.UTC(year, month - 1, day),
  );
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (filter === "weekend") {
    const saturday = new Date(start);
    saturday.setUTCDate(
      start.getUTCDate() +
        (start.getUTCDay() === 0 ? -1 : (6 - start.getUTCDay() + 7) % 7),
    );
    const sunday = new Date(saturday);
    sunday.setUTCDate(saturday.getUTCDate() + 1);
    return { start: iso(saturday), end: iso(sunday) };
  }
  if (filter === "7" || filter === "30") {
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + Number(filter) - 1);
    return { start: iso(start), end: iso(end) };
  }
  return { start: iso(start), end: null };
}
export function eventSearchWindow(page: string | undefined, requestedLimit: number) {
  const limit = Number.isFinite(requestedLimit) ? Math.min(201, Math.max(1, Math.floor(requestedLimit))) : 31;
  const number = Math.min(10000, Math.max(1, Number.parseInt(page || "1", 10) || 1));
  const pageSize = page === undefined ? limit : Math.max(1, limit - 1);
  return { page: number, limit, offset: (number - 1) * pageSize };
}
export function sortLocalEvents<
  T extends { start_date: string; distance_miles?: number | null },
>(events: T[], sort?: string) {
  return [...events].sort(
    sort === "distance"
      ? (a, b) =>
          (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity)
      : (a, b) => a.start_date.localeCompare(b.start_date),
  );
}

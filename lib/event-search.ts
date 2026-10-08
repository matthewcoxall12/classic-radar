export function dateRange(filter?: string, now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
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
    end.setUTCDate(start.getUTCDate() + Number(filter));
    return { start: iso(start), end: iso(end) };
  }
  return { start: iso(start), end: null };
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

// Some source calendars encode an all-day slot as midnight to midnight or
// 23:59. Do not present those imported boundary values as confirmed opening
// hours. Explicit member-entered midnight times remain unchanged.
export function eventTimes(event: { start_time?: string | null; end_time?: string | null; created_by?: string | null }) {
  const importedAllDay = !event.created_by && event.start_time?.slice(0, 5) === "00:00" &&
    ["00:00", "23:59"].includes(event.end_time?.slice(0, 5) || "");
  return importedAllDay ? { start: null, end: null } : { start: event.start_time, end: event.end_time };
}

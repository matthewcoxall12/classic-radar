type CalendarEvent = { id: string; title: string; slug: string; start_date: string; end_date?: string | null; venue_name?: string | null; town?: string | null; postcode?: string | null };
function escapeIcs(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }
function fold(line: string): string {
  const parts: string[] = []; let part = "";
  for (const character of line) {
    if (new TextEncoder().encode(part + character).length > 73) { parts.push(part); part = " " + character; } else part += character;
  }
  parts.push(part); return parts.join("\r\n");
}
export function roadbookCalendar(name: string, events: CalendarEvent[], now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ClassicsGo//Roadbook//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeIcs(name)}`];
  for (const event of events) {
    const end = new Date(`${event.end_date || event.start_date}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${event.id}@classicsgo.com`, `DTSTAMP:${timestamp}`, `DTSTART;VALUE=DATE:${event.start_date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll("-", "")}`, `SUMMARY:${escapeIcs(event.title)}`, `LOCATION:${escapeIcs([event.venue_name, event.town, event.postcode].filter(Boolean).join(", "))}`, `URL:https://classicsgo.com/events/${encodeURIComponent(event.slug)}`, "DESCRIPTION:Check the organiser for current timings and booking. Exported as an all-day reminder.", "END:VEVENT");
  }
  lines.push("END:VCALENDAR"); return lines.map(fold).join("\r\n") + "\r\n";
}

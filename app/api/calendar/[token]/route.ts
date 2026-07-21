import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  venue: string | null;
  town: string | null;
  postcode: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  price: string | null;
  official_url: string | null;
};

type CalendarFeed = { display_name: string; events: CalendarEvent[] };

const escapeIcs = (value: string) => value
  .replace(/\\/g, "\\\\")
  .replace(/\r?\n/g, "\\n")
  .replace(/,/g, "\\,")
  .replace(/;/g, "\\;");

const dateValue = (value: string) => value.replaceAll("-", "");

function dayAfter(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function foldLine(line: string) {
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73));
    remaining = ` ${remaining.slice(73)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return new Response("Calendar not found.", { status: 404 });
  }

  try {
    const result = await createSupabaseAdminClient().rpc(
      "get_managed_calendar_feed",
      { p_calendar_token: token },
    );
    if (result.error) throw result.error;
    if (!result.data) return new Response("Calendar not found.", { status: 404 });
    const feed = result.data as CalendarFeed;
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ClassicsGo//Roadbook Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-PUBLISHED-TTL:PT1H",
      `X-WR-CALNAME:${escapeIcs(`${feed.display_name || "My"} Roadbook`)}`,
    ];
    for (const event of feed.events ?? []) {
      const location = [event.venue, event.town, event.postcode].filter(Boolean).join(", ");
      const details = [event.description, event.start_time?.slice(0, 5), event.price].filter(Boolean).join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escapeIcs(event.id)}@classicsgo.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dateValue(event.start_date)}`,
        `DTEND;VALUE=DATE:${dateValue(dayAfter(event.end_date ?? event.start_date))}`,
        `SUMMARY:${escapeIcs(event.title)}`,
        `LOCATION:${escapeIcs(location)}`,
        `DESCRIPTION:${escapeIcs(details)}`,
        ...(event.official_url ? [`URL:${escapeIcs(event.official_url)}`] : []),
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return new Response(lines.map(foldLine).join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="classicsgo-roadbook.ics"',
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Calendar feed error", error);
    return new Response("Calendar temporarily unavailable.", { status: 500 });
  }
}

import { ensureDatabase } from "@/lib/database";
import { EventRow, MemberRow } from "@/lib/member-data";
import { refreshMemberStripeEntitlement } from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

type CalendarEventRow = EventRow;

const escapeIcs = (value: string) =>
  value
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
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return new Response("Calendar not found.", { status: 404 });
  }

  try {
    const db = await ensureDatabase();
    const owner = await db
      .prepare(`SELECT email FROM members WHERE calendar_token = ?`)
      .bind(token)
      .first<{ email: string }>();
    if (!owner) return new Response("Calendar not found.", { status: 404 });
    await refreshMemberStripeEntitlement(owner.email);
    const member = await db
      .prepare(
        `SELECT id, email, display_name, tier, stripe_customer_id,
          stripe_subscription_id, subscription_status, subscription_expires_at,
          trial_started_at, home_area_name, home_latitude, home_longitude,
          home_radius_miles, digest_frequency, calendar_token, created_at,
          updated_at
         FROM members
         WHERE calendar_token = ? AND tier = 'roadbook'
           AND (
             subscription_status IS NULL
             OR subscription_status <> 'trialing'
             OR subscription_expires_at IS NULL
             OR datetime(subscription_expires_at) > datetime('now')
           )`,
      )
      .bind(token)
      .first<MemberRow>();
    if (!member) return new Response("Calendar not found.", { status: 404 });

    const result = await db
      .prepare(
        `SELECT e.id, e.title, e.description, e.venue, e.town, e.postcode,
          e.start_date, e.end_date, e.start_time, e.category, e.latitude,
          e.longitude, e.official_url, e.official_label, e.price, e.image,
          e.featured
         FROM saved_events s
         JOIN motoring_events e ON e.id = s.event_id
         WHERE s.member_email = ? AND e.status = 'published'
           AND COALESCE(e.end_date, e.start_date) >= date('now')
         ORDER BY e.start_date ASC`,
      )
      .bind(member.email)
      .all<CalendarEventRow>();

    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ClassicsGo//Roadbook Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-PUBLISHED-TTL:PT1H",
      `X-WR-CALNAME:${escapeIcs(`${member.display_name || "My"} Roadbook`)}`,
    ];
    for (const event of result.results) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escapeIcs(event.id)}@classic-motoring-events`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dateValue(event.start_date)}`,
        `DTEND;VALUE=DATE:${dateValue(dayAfter(event.end_date ?? event.start_date))}`,
        `SUMMARY:${escapeIcs(event.title)}`,
        `LOCATION:${escapeIcs(`${event.venue}, ${event.town}, ${event.postcode}`)}`,
        `DESCRIPTION:${escapeIcs(`${event.description}\n${event.start_time} · ${event.price}`)}`,
        `URL:${escapeIcs(event.official_url)}`,
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return new Response(lines.map(foldLine).join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="classic-motoring-roadbook.ics"',
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Calendar feed error", error);
    return new Response("Calendar temporarily unavailable.", { status: 500 });
  }
}

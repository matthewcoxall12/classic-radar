import {
  cleanString,
  integerNumber,
  jsonMemberError,
  jsonOk,
  MemberApiError,
  readMemberJson,
  requireId,
  requireMember,
  requireRoadbookMember,
} from "@/lib/member-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const roadbookId = requireId(body.roadbookId, "roadbook ID");
    const eventId = requireId(body.eventId, "event ID");
    const roadbook = await db
      .prepare(`SELECT id FROM roadbooks WHERE id = ? AND member_email = ?`)
      .bind(roadbookId, member.email)
      .first<{ id: string }>();
    if (!roadbook) {
      throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    }
    const event = await db
      .prepare(`SELECT id FROM motoring_events WHERE id = ? AND status = 'published'`)
      .bind(eventId)
      .first<{ id: string }>();
    if (!event) {
      throw new MemberApiError(404, "EVENT_NOT_FOUND", "That event is unavailable.");
    }
    const existingCount = await db
      .prepare(
        `SELECT COUNT(*) AS count,
          COALESCE(MAX(CASE WHEN event_id = ? THEN 1 ELSE 0 END), 0) AS already_added
         FROM roadbook_events WHERE roadbook_id = ?`,
      )
      .bind(eventId, roadbookId)
      .first<{ count: number; already_added: number }>();
    if ((existingCount?.count ?? 0) >= 200 && !existingCount?.already_added) {
      throw new MemberApiError(
        409,
        "ROADBOOK_EVENT_LIMIT_REACHED",
        "A roadbook can contain up to 200 events. Remove one before adding another.",
      );
    }
    const notes = cleanString(body.notes, 600);
    let position: number;
    if (body.position === undefined || body.position === null) {
      const last = await db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
           FROM roadbook_events WHERE roadbook_id = ?`,
        )
        .bind(roadbookId)
        .first<{ next_position: number }>();
      position = Number(last?.next_position ?? 0);
    } else {
      position = integerNumber(body.position, "Position", 0, 10_000);
    }
    await db
      .prepare(
        `INSERT INTO roadbook_events (roadbook_id, event_id, position, notes)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(roadbook_id, event_id) DO UPDATE SET
           position = excluded.position, notes = excluded.notes`,
      )
      .bind(roadbookId, eventId, position, notes)
      .run();
    return jsonOk(
      { roadbookEvent: { roadbookId, eventId, position, notes } },
      { status: 201 },
    );
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    requireRoadbookMember(member);
    const url = new URL(request.url);
    let roadbookId = url.searchParams.get("roadbookId");
    let eventId = url.searchParams.get("eventId");
    if ((!roadbookId || !eventId) && request.headers.get("content-type")?.includes("application/json")) {
      const body = await readMemberJson(request);
      roadbookId ||= typeof body.roadbookId === "string" ? body.roadbookId : null;
      eventId ||= typeof body.eventId === "string" ? body.eventId : null;
    }
    const validRoadbookId = requireId(roadbookId, "roadbook ID");
    const validEventId = requireId(eventId, "event ID");
    const roadbook = await db
      .prepare(`SELECT id FROM roadbooks WHERE id = ? AND member_email = ?`)
      .bind(validRoadbookId, member.email)
      .first<{ id: string }>();
    if (!roadbook) {
      throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    }
    await db
      .prepare(
        `DELETE FROM roadbook_events WHERE roadbook_id = ? AND event_id = ?`,
      )
      .bind(validRoadbookId, validEventId)
      .run();
    return jsonOk({
      removed: true,
      roadbookId: validRoadbookId,
      eventId: validEventId,
    });
  } catch (error) {
    return jsonMemberError(error);
  }
}

import {
  booleanValue,
  cleanString,
  createToken,
  EVENT_SELECT,
  EventRow,
  eventFromRow,
  jsonMemberError,
  jsonOk,
  MemberApiError,
  MemberStatement,
  readMemberJson,
  requestValue,
  requireId,
  requireMember,
  requireRoadbookMember,
} from "@/lib/member-data";

export const dynamic = "force-dynamic";

type RoadbookRow = {
  id: string;
  name: string;
  description: string;
  share_token: string;
  is_shared: number;
  created_at: string;
  updated_at: string;
};

type RoadbookEventRow = EventRow & {
  roadbook_id: string;
  position: number;
  notes: string;
  added_at: string;
};

const roadbookJson = (row: RoadbookRow, events: RoadbookEventRow[] = []) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isShared: Boolean(row.is_shared),
  shareUrl: row.is_shared ? `/roadbook/${row.share_token}` : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  events: events.map((item) => ({
    eventId: item.id,
    position: item.position,
    notes: item.notes,
    addedAt: item.added_at,
    event: eventFromRow(item),
  })),
});

export async function GET() {
  try {
    const { db, member } = await requireMember();
    requireRoadbookMember(member);
    const [roadbookResult, eventResult] = await Promise.all([
      db
        .prepare(
          `SELECT id, name, description, share_token, is_shared,
            created_at, updated_at
           FROM roadbooks WHERE member_email = ? ORDER BY updated_at DESC`,
        )
        .bind(member.email)
        .all<RoadbookRow>(),
      db
        .prepare(
          `SELECT re.roadbook_id, re.position, re.notes, re.created_at AS added_at,
            ${EVENT_SELECT}
           FROM roadbook_events re
           JOIN roadbooks r ON r.id = re.roadbook_id
           JOIN motoring_events e ON e.id = re.event_id
           WHERE r.member_email = ?
           ORDER BY re.roadbook_id, re.position, e.start_date`,
        )
        .bind(member.email)
        .all<RoadbookEventRow>(),
    ]);
    const byRoadbook = new Map<string, RoadbookEventRow[]>();
    for (const item of eventResult.results) {
      const items = byRoadbook.get(item.roadbook_id) ?? [];
      items.push(item);
      byRoadbook.set(item.roadbook_id, items);
    }
    return jsonOk({
      items: roadbookResult.results.map((row: RoadbookRow) =>
        roadbookJson(row, byRoadbook.get(row.id)),
      ),
    });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const name = cleanString(body.name, 100);
    if (name.length < 2) {
      throw new MemberApiError(
        400,
        "VALIDATION_ERROR",
        "Roadbook name must be at least two characters.",
      );
    }
    const description = cleanString(body.description, 600);
    if (
      Object.prototype.hasOwnProperty.call(body, "isShared") &&
      typeof body.isShared !== "boolean"
    ) {
      throw new MemberApiError(
        400,
        "VALIDATION_ERROR",
        "isShared must be true or false.",
      );
    }
    const isShared = booleanValue(body.isShared);
    const existingCount = await db
      .prepare(`SELECT COUNT(*) AS count FROM roadbooks WHERE member_email = ?`)
      .bind(member.email)
      .first<{ count: number }>();
    if ((existingCount?.count ?? 0) >= 20) {
      throw new MemberApiError(
        409,
        "ROADBOOK_LIMIT_REACHED",
        "Roadbook membership includes up to 20 roadbooks. Remove one before creating another.",
      );
    }
    const id = crypto.randomUUID();
    const shareToken = createToken();
    await db
      .prepare(
        `INSERT INTO roadbooks (
          id, member_email, name, description, share_token, is_shared
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, member.email, name, description, shareToken, isShared ? 1 : 0)
      .run();
    const created = await db
      .prepare(
        `SELECT id, name, description, share_token, is_shared,
          created_at, updated_at
         FROM roadbooks WHERE id = ? AND member_email = ?`,
      )
      .bind(id, member.email)
      .first<RoadbookRow>();
    if (!created) {
      throw new MemberApiError(500, "CREATE_FAILED", "The roadbook could not be created.");
    }
    return jsonOk({ roadbook: roadbookJson(created) }, { status: 201 });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const id = requireId(body.id, "roadbook ID");
    const existing = await db
      .prepare(`SELECT id, is_shared FROM roadbooks WHERE id = ? AND member_email = ?`)
      .bind(id, member.email)
      .first<{ id: string; is_shared: number }>();
    if (!existing) {
      throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    }

    const statements: MemberStatement[] = [];
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = cleanString(body.name, 100);
      if (name.length < 2) {
        throw new MemberApiError(
          400,
          "VALIDATION_ERROR",
          "Roadbook name must be at least two characters.",
        );
      }
      statements.push(
        db
          .prepare(
            `UPDATE roadbooks SET name = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND member_email = ?`,
          )
          .bind(name, id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      statements.push(
        db
          .prepare(
            `UPDATE roadbooks SET description = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND member_email = ?`,
          )
          .bind(cleanString(body.description, 600), id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "isShared")) {
      if (typeof body.isShared !== "boolean") {
        throw new MemberApiError(
          400,
          "VALIDATION_ERROR",
          "isShared must be true or false.",
        );
      }
      statements.push(
        body.isShared && !existing.is_shared
          ? db
              .prepare(
                `UPDATE roadbooks SET is_shared = 1, share_token = ?,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND member_email = ?`,
              )
              .bind(createToken(), id, member.email)
          : db
              .prepare(
                `UPDATE roadbooks SET is_shared = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND member_email = ?`,
              )
              .bind(body.isShared ? 1 : 0, id, member.email),
      );
    }
    if (!statements.length) {
      throw new MemberApiError(
        400,
        "VALIDATION_ERROR",
        "No editable roadbook fields were provided.",
      );
    }
    await db.batch(statements);
    const updated = await db
      .prepare(
        `SELECT id, name, description, share_token, is_shared,
          created_at, updated_at FROM roadbooks
         WHERE id = ? AND member_email = ?`,
      )
      .bind(id, member.email)
      .first<RoadbookRow>();
    if (!updated) {
      throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    }
    return jsonOk({ roadbook: roadbookJson(updated) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    requireRoadbookMember(member);
    const id = await requestValue(request, "id", "roadbook ID");
    const existing = await db
      .prepare(`SELECT id FROM roadbooks WHERE id = ? AND member_email = ?`)
      .bind(id, member.email)
      .first<{ id: string }>();
    if (!existing) {
      throw new MemberApiError(404, "NOT_FOUND", "Roadbook not found.");
    }
    await db.batch([
      db.prepare(`DELETE FROM roadbook_events WHERE roadbook_id = ?`).bind(id),
      db
        .prepare(`DELETE FROM roadbooks WHERE id = ? AND member_email = ?`)
        .bind(id, member.email),
    ]);
    return jsonOk({ removed: true, id });
  } catch (error) {
    return jsonMemberError(error);
  }
}

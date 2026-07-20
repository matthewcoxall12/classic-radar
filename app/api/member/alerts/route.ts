import {
  booleanValue,
  cleanString,
  integerNumber,
  jsonMemberError,
  jsonOk,
  MemberApiError,
  MemberDatabase,
  MemberStatement,
  optionalString,
  readMemberJson,
  requestValue,
  requireId,
  requireMember,
  requireRoadbookMember,
} from "@/lib/member-data";

export const dynamic = "force-dynamic";

const categories = new Set(["Show", "Meet", "Autojumble", "Motorsport", "Run"]);
const frequencies = new Set(["instant", "daily", "weekly"]);
const MAX_ALERTS_PER_MEMBER = 10;

type AlertRow = {
  id: string;
  name: string;
  location_id: string | null;
  category: string | null;
  marque: string | null;
  radius_miles: number | null;
  frequency: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

const alertJson = (row: AlertRow) => ({
  id: row.id,
  name: row.name,
  locationId: row.location_id,
  category: row.category,
  marque: row.marque,
  radiusMiles: row.radius_miles,
  frequency: row.frequency,
  enabled: Boolean(row.enabled),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function assertLocationOwner(
  db: MemberDatabase,
  memberEmail: string,
  locationId: string | null,
) {
  if (!locationId) return;
  const location = await db
    .prepare(`SELECT id FROM member_locations WHERE id = ? AND member_email = ?`)
    .bind(locationId, memberEmail)
    .first<{ id: string }>();
  if (!location) {
    throw new MemberApiError(400, "INVALID_LOCATION", "Choose one of your saved locations.");
  }
}

function validatedCategory(value: unknown) {
  const category = optionalString(value, 40);
  if (category && !categories.has(category)) {
    throw new MemberApiError(400, "VALIDATION_ERROR", "Choose a valid event category.");
  }
  return category;
}

function validatedFrequency(value: unknown) {
  const frequency = cleanString(value ?? "instant", 20);
  if (!frequencies.has(frequency)) {
    throw new MemberApiError(400, "VALIDATION_ERROR", "Choose a valid alert frequency.");
  }
  return frequency;
}

export async function GET() {
  try {
    const { db, member } = await requireMember();
    requireRoadbookMember(member);
    const result = await db
      .prepare(
        `SELECT id, name, location_id, category, marque, radius_miles,
          frequency, enabled, created_at, updated_at
         FROM alert_rules WHERE member_email = ? ORDER BY created_at DESC`,
      )
      .bind(member.email)
      .all<AlertRow>();
    return jsonOk({ items: result.results.map(alertJson) });
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
      throw new MemberApiError(400, "VALIDATION_ERROR", "Alert name is required.");
    }
    const locationId = body.locationId ? requireId(body.locationId, "location ID") : null;
    const category = validatedCategory(body.category);
    const marque = optionalString(body.marque, 80);
    const radiusMiles =
      body.radiusMiles === undefined || body.radiusMiles === null
        ? null
        : integerNumber(body.radiusMiles, "Radius", 5, 250);
    const frequency = validatedFrequency(body.frequency);
    if (
      Object.prototype.hasOwnProperty.call(body, "enabled") &&
      typeof body.enabled !== "boolean"
    ) {
      throw new MemberApiError(
        400,
        "VALIDATION_ERROR",
        "enabled must be true or false.",
      );
    }
    if (!locationId && !category && !marque) {
      throw new MemberApiError(
        400,
        "VALIDATION_ERROR",
        "Choose a location, category or marque for the alert.",
      );
    }
    await assertLocationOwner(db, member.email, locationId);
    const count = await db
      .prepare(`SELECT COUNT(*) AS count FROM alert_rules WHERE member_email = ?`)
      .bind(member.email)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= MAX_ALERTS_PER_MEMBER) {
      throw new MemberApiError(
        409,
        "LIMIT_REACHED",
        `Roadbook membership includes up to ${MAX_ALERTS_PER_MEMBER} event alerts.`,
      );
    }
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO alert_rules (
          id, member_email, name, location_id, category, marque,
          radius_miles, frequency, enabled
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (
          SELECT COUNT(*) FROM alert_rules WHERE member_email = ?
        ) < ?`,
      )
      .bind(
        id,
        member.email,
        name,
        locationId,
        category,
        marque,
        radiusMiles,
        frequency,
        booleanValue(body.enabled, true) ? 1 : 0,
        member.email,
        MAX_ALERTS_PER_MEMBER,
      )
      .run()
      .then((result) => {
        if (Number(result.meta.changes ?? 0) !== 1) {
          throw new MemberApiError(
            409,
            "LIMIT_REACHED",
            `Roadbook membership includes up to ${MAX_ALERTS_PER_MEMBER} event alerts.`,
          );
        }
      });
    const created = await db
      .prepare(
        `SELECT id, name, location_id, category, marque, radius_miles,
          frequency, enabled, created_at, updated_at
         FROM alert_rules WHERE id = ? AND member_email = ?`,
      )
      .bind(id, member.email)
      .first<AlertRow>();
    if (!created) {
      throw new MemberApiError(500, "CREATE_FAILED", "The alert could not be created.");
    }
    return jsonOk({ alert: alertJson(created) }, { status: 201 });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    requireRoadbookMember(member);
    const body = await readMemberJson(request);
    const id = requireId(body.id, "alert ID");
    const existing = await db
      .prepare(
        `SELECT id, name, location_id, category, marque, radius_miles,
          frequency, enabled, created_at, updated_at
         FROM alert_rules WHERE id = ? AND member_email = ?`,
      )
      .bind(id, member.email)
      .first<AlertRow>();
    if (!existing) {
      throw new MemberApiError(404, "NOT_FOUND", "Alert not found.");
    }

    const statements: MemberStatement[] = [];
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = cleanString(body.name, 100);
      if (name.length < 2) {
        throw new MemberApiError(400, "VALIDATION_ERROR", "Alert name is required.");
      }
      statements.push(
        db
          .prepare(`UPDATE alert_rules SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_email = ?`)
          .bind(name, id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "locationId")) {
      const locationId = body.locationId
        ? requireId(body.locationId, "location ID")
        : null;
      await assertLocationOwner(db, member.email, locationId);
      statements.push(
        db
          .prepare(`UPDATE alert_rules SET location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_email = ?`)
          .bind(locationId, id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      statements.push(
        db
          .prepare(`UPDATE alert_rules SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_email = ?`)
          .bind(validatedCategory(body.category), id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "marque")) {
      statements.push(
        db
          .prepare(`UPDATE alert_rules SET marque = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_email = ?`)
          .bind(optionalString(body.marque, 80), id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "radiusMiles")) {
      const radius =
        body.radiusMiles === null
          ? null
          : integerNumber(body.radiusMiles, "Radius", 5, 250);
      statements.push(
        db
          .prepare(`UPDATE alert_rules SET radius_miles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_email = ?`)
          .bind(radius, id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "frequency")) {
      statements.push(
        db
          .prepare(`UPDATE alert_rules SET frequency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_email = ?`)
          .bind(validatedFrequency(body.frequency), id, member.email),
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
      if (typeof body.enabled !== "boolean") {
        throw new MemberApiError(400, "VALIDATION_ERROR", "enabled must be true or false.");
      }
      statements.push(
        db
          .prepare(`UPDATE alert_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_email = ?`)
          .bind(body.enabled ? 1 : 0, id, member.email),
      );
    }
    if (!statements.length) {
      throw new MemberApiError(400, "VALIDATION_ERROR", "No editable alert fields were provided.");
    }
    const finalLocation = Object.prototype.hasOwnProperty.call(body, "locationId")
      ? optionalString(body.locationId, 100)
      : existing.location_id;
    const finalCategory = Object.prototype.hasOwnProperty.call(body, "category")
      ? validatedCategory(body.category)
      : existing.category;
    const finalMarque = Object.prototype.hasOwnProperty.call(body, "marque")
      ? optionalString(body.marque, 80)
      : existing.marque;
    if (!finalLocation && !finalCategory && !finalMarque) {
      throw new MemberApiError(
        400,
        "VALIDATION_ERROR",
        "An alert must keep a location, category or marque.",
      );
    }
    await db.batch(statements);
    const updated = await db
      .prepare(
        `SELECT id, name, location_id, category, marque, radius_miles,
          frequency, enabled, created_at, updated_at
         FROM alert_rules WHERE id = ? AND member_email = ?`,
      )
      .bind(id, member.email)
      .first<AlertRow>();
    if (!updated) {
      throw new MemberApiError(404, "NOT_FOUND", "Alert not found.");
    }
    return jsonOk({ alert: alertJson(updated) });
  } catch (error) {
    return jsonMemberError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { db, member } = await requireMember(request);
    requireRoadbookMember(member);
    const id = await requestValue(request, "id", "alert ID");
    const existing = await db
      .prepare(`SELECT id FROM alert_rules WHERE id = ? AND member_email = ?`)
      .bind(id, member.email)
      .first<{ id: string }>();
    if (!existing) {
      throw new MemberApiError(404, "NOT_FOUND", "Alert not found.");
    }
    await db
      .prepare(`DELETE FROM alert_rules WHERE id = ? AND member_email = ?`)
      .bind(id, member.email)
      .run();
    return jsonOk({ removed: true, id });
  } catch (error) {
    return jsonMemberError(error);
  }
}

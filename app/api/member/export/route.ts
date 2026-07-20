import { requireFreshAuthentication } from "@/lib/app-auth";
import { jsonMemberError, jsonOk, requireMember } from "@/lib/member-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { db, member, user } = await requireMember(request);
    requireFreshAuthentication(user);

    const [
      identities,
      savedEvents,
      attendance,
      locations,
      vehicles,
      roadbooks,
      roadbookEvents,
      alerts,
      notifications,
      subscriptions,
      auditEvents,
      eventSubmissions,
      partnerEnquiries,
      checkoutSessions,
      authenticationSessions,
    ] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT issuer, subject, provider, email_at_link, email_verified,
            created_at, last_used_at
           FROM auth_identities WHERE member_id = ?`,
        )
        .bind(member.id),
      db
        .prepare(
          `SELECT se.saved_at, e.id AS event_id, e.title, e.venue, e.town,
            e.start_date, e.official_url
           FROM saved_events se
           JOIN motoring_events e ON e.id = se.event_id
           WHERE se.member_email = ? ORDER BY se.saved_at DESC`,
        )
        .bind(member.email),
      db
        .prepare(
          `SELECT a.going_at, a.updated_at, e.id AS event_id, e.title,
            e.venue, e.town, e.start_date, e.official_url
           FROM event_attendance a
           JOIN motoring_events e ON e.id = a.event_id
           WHERE a.member_email = ? ORDER BY a.going_at DESC`,
        )
        .bind(member.email),
      db
        .prepare(`SELECT * FROM member_locations WHERE member_email = ?`)
        .bind(member.email),
      db
        .prepare(`SELECT * FROM member_vehicles WHERE member_email = ?`)
        .bind(member.email),
      db
        .prepare(`SELECT * FROM roadbooks WHERE member_email = ?`)
        .bind(member.email),
      db
        .prepare(
          `SELECT re.* FROM roadbook_events re
           JOIN roadbooks r ON r.id = re.roadbook_id
           WHERE r.member_email = ?`,
        )
        .bind(member.email),
      db
        .prepare(`SELECT * FROM alert_rules WHERE member_email = ?`)
        .bind(member.email),
      db
        .prepare(`SELECT * FROM member_notifications WHERE member_email = ?`)
        .bind(member.email),
      db
        .prepare(`SELECT * FROM stripe_subscriptions WHERE member_email = ?`)
        .bind(member.email),
      db
        .prepare(
          `SELECT event_type, provider, created_at
           FROM auth_audit_events WHERE member_id = ? ORDER BY created_at DESC`,
        )
        .bind(member.id),
      db
        .prepare(
          `SELECT id, event_name, organiser_name, email, club_name,
            official_url, venue, town_postcode, start_date, end_date,
            category, description, status, created_at
           FROM event_submissions WHERE email = ? COLLATE NOCASE
           ORDER BY created_at DESC`,
        )
        .bind(member.email),
      db
        .prepare(
          `SELECT id, contact_name, organisation_name, email,
            organisation_type, website, message, status, created_at
           FROM partner_enquiries WHERE email = ? COLLATE NOCASE
           ORDER BY created_at DESC`,
        )
        .bind(member.email),
      db
        .prepare(
          `SELECT session_id, plan, state, session_expires_at,
            created_at, updated_at
           FROM stripe_checkout_sessions WHERE member_email = ?`,
        )
        .bind(member.email),
      db
        .prepare(
          `SELECT id, provider, created_at, authenticated_at, last_seen_at,
            expires_at, revoked_at
           FROM auth_sessions WHERE member_id = ? ORDER BY created_at DESC`,
        )
        .bind(member.id),
    ]);

    return jsonOk({
      export: {
        generatedAt: new Date().toISOString(),
        profile: member,
        identities: identities.results ?? [],
        savedEvents: savedEvents.results ?? [],
        attendance: attendance.results ?? [],
        locations: locations.results ?? [],
        vehicles: vehicles.results ?? [],
        roadbooks: roadbooks.results ?? [],
        roadbookEvents: roadbookEvents.results ?? [],
        alerts: alerts.results ?? [],
        notifications: notifications.results ?? [],
        subscriptions: subscriptions.results ?? [],
        checkoutSessions: checkoutSessions.results ?? [],
        authenticationHistory: auditEvents.results ?? [],
        authenticationSessions: authenticationSessions.results ?? [],
        eventSubmissions: eventSubmissions.results ?? [],
        partnerAndPrivacyEnquiries: partnerEnquiries.results ?? [],
      },
    });
  } catch (error) {
    return jsonMemberError(error);
  }
}

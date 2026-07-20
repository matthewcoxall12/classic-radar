import { ensureDatabase } from "@/lib/database";
import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
  requirePublicFormOrigin,
  verifyTurnstileToken,
} from "@/lib/auth-security";
import {
  readJsonBody,
  RequestError,
} from "@/lib/request-safety";
import { shortReference } from "@/lib/operations-queue";

const categories = new Set(["Show", "Meet", "Autojumble", "Motorsport", "Run"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value: unknown, limit = 500) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export async function POST(request: Request) {
  try {
    requirePublicFormOrigin(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "event-submission",
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many submissions from this connection. Please try later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(limit.retryAfter),
          },
        },
      );
    }

    const payload = await readJsonBody(request);
    const captchaToken = clean(
      payload.captchaToken ?? payload["cf-turnstile-response"],
      4096,
    );
    await verifyTurnstileToken(request, captchaToken, "event_submission");
    const eventName = clean(payload.eventName, 120);
    const organiserName = clean(payload.organiserName, 100);
    const email = clean(payload.email, 180).toLowerCase();
    const clubName = clean(payload.clubName, 120);
    const officialUrl = clean(payload.officialUrl, 500);
    const venue = clean(payload.venue, 160);
    const townPostcode = clean(payload.townPostcode, 160);
    const startDate = clean(payload.startDate, 10);
    const endDate = clean(payload.endDate, 10);
    const category = clean(payload.category, 40);
    const description = clean(payload.description, 1500);

    if (
      !eventName ||
      !organiserName ||
      !emailPattern.test(email) ||
      !officialUrl ||
      !venue ||
      !townPostcode ||
      !isValidDate(startDate) ||
      !categories.has(category) ||
      description.length < 30
    ) {
      return Response.json(
        { error: "Please complete every required field with valid event details." },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    if (startDate < today || (endDate && (!isValidDate(endDate) || endDate < startDate))) {
      return Response.json(
        { error: "Use a valid future date, with the end date on or after the start." },
        { status: 400 },
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(officialUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
    } catch {
      return Response.json(
        { error: "Enter a valid official website or public social-page link." },
        { status: 400 },
      );
    }

    const db = await ensureDatabase();
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO event_submissions (
          id, event_name, organiser_name, email, club_name, official_url,
          venue, town_postcode, start_date, end_date, category, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        eventName,
        organiserName,
        email,
        clubName,
        parsedUrl.toString(),
        venue,
        townPostcode,
        startDate,
        endDate || null,
        category,
        description,
      )
      .run();

    return Response.json(
      {
        reference: shortReference("event", id),
        message: "Thanks — your event is in the review queue.",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthSecurityError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof RequestError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { error: "We couldn't save the event just now. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

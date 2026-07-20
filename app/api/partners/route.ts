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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: unknown, limit = 500) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request) {
  try {
    requirePublicFormOrigin(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "partner-enquiry",
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many enquiries from this connection. Please try later." },
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
    await verifyTurnstileToken(request, captchaToken, "contact_form");
    const contactName = clean(payload.contactName, 100);
    const organisationName = clean(payload.organisationName, 140);
    const email = clean(payload.email, 180).toLowerCase();
    const organisationType = clean(payload.organisationType, 80);
    const website = clean(payload.website, 500);
    const message = clean(payload.message, 1500);

    if (
      !contactName ||
      !organisationName ||
      !emailPattern.test(email) ||
      !organisationType ||
      message.length < 20
    ) {
      return Response.json(
        { error: "Please complete the required contact details." },
        { status: 400 },
      );
    }

    if (website) {
      try {
        const url = new URL(website);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return Response.json(
          { error: "Enter a valid website address, including https://" },
          { status: 400 },
        );
      }
    }

    const db = await ensureDatabase();
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO partner_enquiries (
          id, contact_name, organisation_name, email, organisation_type,
          website, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        contactName,
        organisationName,
        email,
        organisationType,
        website,
        message,
      )
      .run();

    return Response.json(
      {
        reference: shortReference("partner", id),
        message: "Thanks — we'll be in touch about your organisation.",
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
      { error: "We couldn't save the enquiry just now. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

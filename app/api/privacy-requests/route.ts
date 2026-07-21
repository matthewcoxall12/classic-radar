import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
  requirePublicFormOrigin,
  verifyTurnstileToken,
} from "@/lib/auth-security";
import { shortReference } from "@/lib/operations-queue";
import { readJsonBody, RequestError } from "@/lib/request-safety";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const requestTypes = new Set([
  "access",
  "correction",
  "deletion",
  "restriction",
  "objection",
  "other",
]);
const clean = (value: unknown, limit = 500) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request) {
  try {
    requirePublicFormOrigin(request);
    const limit = await checkDurableAuthRateLimit({
      request,
      scope: "privacy-request",
      limit: 3,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many privacy requests from this connection. Please try later." },
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
    await verifyTurnstileToken(request, captchaToken, "privacy_request");

    const contactName = clean(payload.contactName, 100);
    const email = clean(payload.email, 180).toLowerCase();
    const requestType = clean(payload.requestType, 40);
    const message = clean(payload.message, 2000);
    if (
      !contactName ||
      !emailPattern.test(email) ||
      !requestTypes.has(requestType) ||
      message.length < 20
    ) {
      return Response.json(
        { error: "Please complete every required field with valid details." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const supabase = createSupabaseAdminClient();
    const id = crypto.randomUUID();
    const { error: insertError } = await supabase.from("privacy_requests").insert({
      id,
      contact_name: contactName,
      email,
      request_type: requestType,
      message,
    });
    if (insertError) throw insertError;

    return Response.json(
      {
        reference: shortReference("privacy", id),
        message: "Your privacy request has been received.",
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
      { error: "We couldn't save the privacy request just now. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

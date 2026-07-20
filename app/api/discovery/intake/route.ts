import { AuthSecurityError, checkDurableAuthRateLimit } from "@/lib/auth-security";
import { DiscoveryAuthError, requireDiscoveryBearer } from "@/lib/discovery-auth";
import {
  DiscoveryStoreError,
  storeDiscoveryObservation,
} from "@/lib/discovery/intake-service";
import {
  DISCOVERY_BODY_LIMIT,
  DiscoveryPayloadError,
  validateDiscoveryPayload,
} from "@/lib/discovery-payload";
import { checkRateLimit, readJsonBody, RequestError } from "@/lib/request-safety";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { ...init, headers });
}

function intakeError(error: unknown) {
  if (error instanceof DiscoveryAuthError) {
    return noStoreJson(
      { ok: false, error: { code: error.code, message: error.message } },
      {
        status: error.status,
        headers:
          error.status === 401
            ? { "WWW-Authenticate": 'Bearer realm="event-discovery"' }
            : undefined,
      },
    );
  }
  if (error instanceof DiscoveryPayloadError) {
    return noStoreJson(
      { ok: false, error: { code: "INVALID_DISCOVERY_PAYLOAD", message: error.message } },
      { status: 400 },
    );
  }
  if (error instanceof DiscoveryStoreError) {
    return noStoreJson(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof RequestError) {
    return noStoreJson(
      { ok: false, error: { code: "INVALID_REQUEST", message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof AuthSecurityError) {
    return noStoreJson(
      {
        ok: false,
        error: {
          code: "DISCOVERY_SECURITY_UNAVAILABLE",
          message: "The discovery intake security service is unavailable.",
        },
      },
      { status: error.status >= 500 ? error.status : 503 },
    );
  }
  return noStoreJson(
    {
      ok: false,
      error: {
        code: "DISCOVERY_INTAKE_UNAVAILABLE",
        message: "The discovery observation could not be accepted.",
      },
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const preAuthLimit = checkRateLimit(
    request,
    "discovery-intake-auth",
    60,
    60 * 60 * 1_000,
  );
  if (!preAuthLimit.allowed) {
    return noStoreJson(
      {
        ok: false,
        error: {
          code: "DISCOVERY_RATE_LIMITED",
          message: "Too many discovery requests were attempted.",
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(preAuthLimit.retryAfter) },
      },
    );
  }

  try {
    await requireDiscoveryBearer(request);
    const payload = validateDiscoveryPayload(
      await readJsonBody(request, DISCOVERY_BODY_LIMIT),
    );
    const durableLimit = await checkDurableAuthRateLimit({
      request,
      scope: "discovery-intake",
      subject: payload.source.key,
      includeIp: true,
      limit: 600,
      windowSeconds: 60 * 60,
    });
    if (!durableLimit.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "DISCOVERY_RATE_LIMITED",
            message: "This discovery source has reached its intake limit.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(durableLimit.retryAfter) },
        },
      );
    }

    const result = await storeDiscoveryObservation(payload, {
      parserVersion: "private-intake-v2",
    });
    return noStoreJson(
      { ok: true, data: result },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return intakeError(error);
  }
}

import { requireAdminApiUser } from "@/lib/admin-auth";
import { AuthSecurityError } from "@/lib/auth-security";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  try {
    await requireAdminApiUser(request);
    return noStoreJson(
      {
        ok: false,
        error: {
          code: "DISCOVERY_SOURCE_ONBOARDING_PENDING",
          message:
            "New sources must be added through the reviewed Supabase source catalogue before activation.",
        },
      },
      { status: 503 },
    );
  } catch (error) {
    if (error instanceof AuthSecurityError) {
      return noStoreJson(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return noStoreJson(
      {
        ok: false,
        error: {
          code: "DISCOVERY_SOURCE_ONBOARDING_PENDING",
          message: "Source onboarding is unavailable until its reviewed catalogue workflow is configured.",
        },
      },
      { status: 503 },
    );
  }
}

import {
  requireAuthenticatedMutation,
  revokeCurrentSession,
  signOutRedirect,
} from "@/lib/app-auth";
import { AuthSecurityError } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    await requireAuthenticatedMutation(request);
    const redirectTo = signOutRedirect();
    await revokeCurrentSession();
    return Response.json(
      { ok: true, data: { redirectTo } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof AuthSecurityError ? error.status : 503;
    return Response.json(
      {
        ok: false,
        error: {
          code: error instanceof AuthSecurityError ? error.code : "SIGN_OUT_FAILED",
          message: error instanceof AuthSecurityError ? error.message : "Sign out failed.",
        },
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

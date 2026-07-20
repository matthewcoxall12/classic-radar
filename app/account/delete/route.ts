import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return Response.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return Response.json({ ok: false, error: "JSON is required." }, { status: 415 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 100) {
    return Response.json({ ok: false, error: "Request is too large." }, { status: 413 });
  }
  let confirmation = "";
  try {
    confirmation = String((JSON.parse(rawBody) as { confirmation?: unknown }).confirmation ?? "");
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (confirmation !== "DELETE") {
    return Response.json({ ok: false, error: "Type DELETE to confirm." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") {
    return Response.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { error } = await supabase.rpc("delete_own_account", { p_confirmation: confirmation });
  if (error) {
    const message = error.message.toLowerCase();
    const status = /(?:recent|fresh) authentication/.test(message) ? 403 : /administrator|paid membership/.test(message) ? 409 : 500;
    const publicMessage = status === 403
      ? "Sign out and back in before deleting your account."
      : status === 409
        ? "This account needs manual support before it can be deleted."
        : "Your account could not be deleted. Please contact privacy@classicsgo.com.";
    return Response.json({ ok: false, error: publicMessage }, { status, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeReturnPath } from "@/lib/supabase/return-path";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeReturnPath(requestUrl.searchParams.get("next"), "/account");
  const failureUrl = new URL("/sign-in", requestUrl.origin);
  failureUrl.searchParams.set("error", requestUrl.searchParams.get("error") === "access_denied" ? "oauth_cancelled" : "oauth_failed");
  failureUrl.searchParams.set("return_to", next);

  if (!code) {
    return NextResponse.redirect(failureUrl, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(failureUrl, { headers: { "Cache-Control": "no-store" } });
    }

    // Welcome delivery is idempotent and intentionally cannot block sign-in.
    try {
      await supabase.functions.invoke("send-welcome-email", { timeout: 3000 });
    } catch {
      // The member session is valid even when transactional email is unavailable.
    }
    return NextResponse.redirect(new URL(next, requestUrl.origin), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.redirect(failureUrl, { headers: { "Cache-Control": "no-store" } });
  }
}

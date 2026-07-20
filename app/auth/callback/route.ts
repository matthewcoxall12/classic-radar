import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeReturnPath } from "@/lib/auth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeReturnPath(requestUrl.searchParams.get("next"), "/account");
  const supabase = await createClient();

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_failed", requestUrl.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_failed", requestUrl.origin));
  }

  // Welcome delivery is idempotent and intentionally cannot block sign-in.
  try {
    await supabase.functions.invoke("send-welcome-email");
  } catch {
    // The member session is valid even when transactional email is unavailable.
  }
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

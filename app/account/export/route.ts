import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("export_own_account_data");
  if (error) {
    const freshAuthRequired = /(recent|fresh) authentication/i.test(error.message);
    return Response.json(
      { ok: false, error: freshAuthRequired ? "Sign in again before exporting your data." : "Your data export could not be created." },
      { status: freshAuthRequired ? 403 : 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="classicsgo-account-export-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WELCOME_EMAIL_FROM = Deno.env.get("WELCOME_EMAIL_FROM");
const ALLOWED_ORIGINS = new Set(["https://classicsgo.com", "https://www.classicsgo.com"]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://classicsgo.com",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

function response(request: Request, body: Json, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "cache-control": "no-store",
      "content-type": "application/json"
    }
  });
}

function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return Deno.env.get(keys.default) ?? keys.default;
  } catch {
    // Fall through to the temporary legacy key.
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (!legacy) throw new Error("No publishable Supabase key is available");
  return legacy;
}

function adminKey(): { value: string; legacy: boolean } {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return { value: Deno.env.get(keys.default) ?? keys.default, legacy: false };
  } catch {
    // Fall through to the temporary legacy key.
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("No Supabase secret key is available");
  return { value: legacy, legacy: true };
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = adminKey();
  const headers: Record<string, string> = {
    apikey: key.value,
    accept: "application/json",
    ...extra
  };
  if (key.legacy) headers.authorization = `Bearer ${key.value}`;
  return headers;
}

async function authenticatedUser(request: Request): Promise<Record<string, unknown>> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new Error("Unauthorised");
  const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: publishableKey(),
      authorization
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!result.ok) throw new Error("Unauthorised");
  return await result.json() as Record<string, unknown>;
}

async function claim(userId: string): Promise<boolean> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/welcome_email_deliveries`);
  url.searchParams.set("on_conflict", "user_id");
  url.searchParams.set("select", "user_id");
  const result = await fetch(url, {
    method: "POST",
    headers: adminHeaders({
      "content-type": "application/json",
      prefer: "resolution=ignore-duplicates,return=representation"
    }),
    body: JSON.stringify({ user_id: userId, status: "sending" }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!result.ok) throw new Error(`Could not claim welcome delivery (${result.status})`);
  const rows = await result.json() as unknown[];
  return rows.length === 1;
}

async function releaseClaim(userId: string): Promise<void> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/welcome_email_deliveries`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("status", "eq.sending");
  await fetch(url, {
    method: "DELETE",
    headers: adminHeaders({ prefer: "return=minimal" }),
    signal: AbortSignal.timeout(10_000)
  });
}

async function markSent(userId: string, messageId: string | null): Promise<void> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/welcome_email_deliveries`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("status", "eq.sending");
  const result = await fetch(url, {
    method: "PATCH",
    headers: adminHeaders({
      "content-type": "application/json",
      prefer: "return=minimal"
    }),
    body: JSON.stringify({
      status: "sent",
      provider_message_id: messageId?.slice(0, 500) ?? null,
      sent_at: new Date().toISOString()
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!result.ok) throw new Error(`Could not mark welcome delivery sent (${result.status})`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function firstName(user: Record<string, unknown>): string {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();
  return escapeHtml((fullName.split(/\s+/)[0] || "there").slice(0, 80));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, { ok: false, error: "Method not allowed" }, 405);

  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { ok: false, error: "Forbidden origin" }, 403);
  if (!SUPABASE_URL) return response(request, { ok: false, error: "Service unavailable" }, 503);

  let user: Record<string, unknown>;
  try {
    user = await authenticatedUser(request);
  } catch {
    return response(request, { ok: false, error: "Unauthorised" }, 401);
  }

  const userId = String(user.id ?? "");
  const email = String(user.email ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !email || !user.email_confirmed_at) {
    return response(request, { ok: false, error: "A verified email address is required" }, 400);
  }
  if (!RESEND_API_KEY || !WELCOME_EMAIL_FROM) {
    return response(request, { ok: false, error: "Welcome email is not configured" }, 503);
  }

  let claimed = false;
  try {
    claimed = await claim(userId);
    if (!claimed) return response(request, { ok: true, sent: false, reason: "already_processed" });

    const name = firstName(user);
    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `classicsgo-welcome-${userId}`
      },
      body: JSON.stringify({
        from: WELCOME_EMAIL_FROM,
        to: [email],
        subject: "Welcome to ClassicsGo",
        text: `Hi ${name === "there" ? "there" : name},\n\nWelcome to ClassicsGo — your place to discover classic car shows, meets and events near you.\n\nStart exploring: https://classicsgo.com\n\nThe ClassicsGo team`,
        html: `<!doctype html><html><body style="margin:0;background:#f5f2ea;font-family:Arial,sans-serif;color:#17231b"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border:1px solid #ded9cc;border-radius:16px;padding:36px"><p style="margin:0 0 8px;color:#2f6b4f;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">ClassicsGo</p><h1 style="margin:0 0 18px;font-size:30px;line-height:1.2">Welcome, ${name}.</h1><p style="font-size:17px;line-height:1.65;margin:0 0 24px">Discover classic car shows, meets and events near you, all in one place.</p><a href="https://classicsgo.com" style="display:inline-block;background:#2f6b4f;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Explore events</a><p style="font-size:13px;line-height:1.5;color:#657067;margin:28px 0 0">You received this once because you created a ClassicsGo account.</p></div></div></body></html>`
      }),
      signal: AbortSignal.timeout(15_000)
    });

    const resultText = await mail.text();
    if (!mail.ok) {
      console.error(`Resend rejected welcome delivery (${mail.status}): ${resultText.slice(0, 500)}`);
      await releaseClaim(userId);
      return response(request, { ok: false, error: "Welcome email could not be sent" }, 502);
    }

    let messageId: string | null = null;
    try {
      messageId = String((JSON.parse(resultText) as Record<string, unknown>).id ?? "") || null;
    } catch {
      // A successful provider response without JSON is still a successful delivery request.
    }
    await markSent(userId, messageId);
    return response(request, { ok: true, sent: true });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (claimed) await releaseClaim(userId);
    return response(request, { ok: false, error: "Welcome email service failed" }, 500);
  }
});

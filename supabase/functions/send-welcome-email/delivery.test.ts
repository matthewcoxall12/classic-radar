import assert from "node:assert/strict";
import { test } from "node:test";

const userId = "12345678-1234-1234-1234-123456789abc";
let handler: (request: Request) => Promise<Response>;
const fakeEnv: Record<string, string> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-public-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  RESEND_API_KEY: "test-resend-key",
  WELCOME_EMAIL_FROM: "ClassicsGo <welcome@mail.classicsgo.com>"
};
Object.assign(globalThis, { Deno: {
  env: { get: (name: string) => fakeEnv[name] },
  serve: (callback: typeof handler) => { handler = callback; }
} });
await import("./index.ts");

function request() {
  return new Request("https://example.supabase.co/functions/v1/send-welcome-email", {
    method: "POST", headers: { authorization: "Bearer test-token" }
  });
}

for (const failure of ["ledger", "accepted-body", "uncertain-network", "explicit-rejection"] as const) {
  test(`welcome ${failure}: only a confirmed rejection can release the delivery claim`, async (context) => {
    let claimExists = false;
    let providerCalls = 0;
    let releases = 0;
    context.mock.method(console, "error", () => undefined);
    context.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) {
        return Response.json({ id: userId, email: "member@example.com", email_confirmed_at: "2026-10-10T00:00:00Z" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/welcome_email_deliveries")) {
        if (init?.method === "POST") {
          const rows = claimExists ? [] : [{ user_id: userId }];
          claimExists = true;
          return Response.json(rows);
        }
        if (init?.method === "DELETE") {
          releases += 1;
          claimExists = false;
          return new Response(null, { status: 204 });
        }
        if (init?.method === "PATCH") return new Response(null, { status: failure === "ledger" ? 503 : 204 });
      }
      if (url === "https://api.resend.com/emails") {
        providerCalls += 1;
        if (failure === "uncertain-network") throw new Error("Timed out after request may have reached provider");
        if (failure === "accepted-body") {
          const response = new Response(null, { status: 200 });
          response.text = async () => { throw new Error("Connection interrupted while reading accepted response"); };
          return response;
        }
        if (failure === "explicit-rejection" && providerCalls === 1) return Response.json({ error: "Rejected" }, { status: 429 });
        return Response.json({ id: "message-test" });
      }
      throw new Error(`Unexpected mocked request: ${url}`);
    });

    assert.equal((await handler(request())).status, failure === "explicit-rejection" ? 502 : 500);
    const retry = await handler(request());
    const result = await retry.json();
    if (failure === "explicit-rejection") {
      assert.equal(releases, 1);
      assert.equal(providerCalls, 2);
      assert.equal(result.sent, true);
    } else {
      assert.equal(releases, 0);
      assert.equal(providerCalls, 1, "a retry must not send a second email after accepted or uncertain delivery");
      assert.equal(result.reason, "already_processed");
    }
    assert.equal(claimExists, true);
  });
}
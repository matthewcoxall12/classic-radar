import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("customer authentication exposes professional Google and email/password flows", () => {
  const signInPanel = readFileSync(
    new URL("../components/sign-in-panel.tsx", import.meta.url),
    "utf8",
  );
  const appAuth = readFileSync(
    new URL("../lib/app-auth.ts", import.meta.url),
    "utf8",
  );
  const privacy = readFileSync(
    new URL("../app/privacy/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(signInPanel, /Continue with Google/);
  assert.match(signInPanel, /Email address/);
  assert.match(signInPanel, /Forgot password\?/);
  assert.match(signInPanel, /Create a free account/);
  assert.match(signInPanel, /\/api\/auth\/password\/sign-in/);
  assert.match(signInPanel, /\/api\/auth\/password\/sign-up/);
  assert.doesNotMatch(signInPanel, /ChatGPT|signin-with-chatgpt/i);
  assert.doesNotMatch(appAuth, /ChatGPT|oai-authenticated|auth\.openai\.com/i);
  assert.doesNotMatch(privacy, /ChatGPT|OpenAI/i);
  assert.match(privacy, /ClassicsGo is operated by Matthew Coxall/);
  assert.match(privacy, /SITE_EMAILS\.privacy/);
  assert.match(privacy, /SITE_EMAILS\.security/);
  assert.doesNotMatch(privacy, /must be added here before public launch/i);
});

test("email confirmation, recovery and reset are token-bound and revoke sessions", () => {
  const signInRoute = readFileSync(
    new URL("../app/api/auth/password/sign-in/route.ts", import.meta.url),
    "utf8",
  );
  const confirmationRoute = readFileSync(
    new URL("../app/auth/confirm/route.ts", import.meta.url),
    "utf8",
  );
  const recoveryRoute = readFileSync(
    new URL("../app/auth/recovery/route.ts", import.meta.url),
    "utf8",
  );
  const resetRoute = readFileSync(
    new URL("../app/api/auth/password/reset/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(signInRoute, /signInWithPassword/);
  assert.match(signInRoute, /principalFromSupabaseUser\(data\.user,\s*"password"\)/);
  assert.match(confirmationRoute, /url\.searchParams\.get\("type"\)\s*!==\s*"email"/);
  assert.match(confirmationRoute, /type:\s*"email"/);
  assert.ok(confirmationRoute.indexOf("client.auth.verifyOtp") < confirmationRoute.indexOf("createAppSession(user, request)"));
  assert.match(recoveryRoute, /url\.searchParams\.get\("type"\)\s*!==\s*"recovery"/);
  assert.match(recoveryRoute, /type:\s*"recovery"/);
  assert.match(resetRoute, /updateUser\(\{ password \}\)/);
  assert.match(resetRoute, /revokeAllAppSessionsForIdentity/);
  assert.match(resetRoute, /signOut\(\{ scope: "global" \}\)/);
  assert.match(resetRoute, /clearAppSessionCookies/);
  assert.match(resetRoute, /clearPasswordRecoveryState/);
});

test("each Supabase callback accepts only its intended identity provider", () => {
  const googleCallback = readFileSync(
    new URL("../app/auth/callback/route.ts", import.meta.url),
    "utf8",
  );
  const emailCallback = readFileSync(
    new URL("../app/auth/confirm/route.ts", import.meta.url),
    "utf8",
  );
  const supabaseAuth = readFileSync(
    new URL("../lib/supabase-auth.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    googleCallback,
    /principalFromSupabaseUser\(data\.user,\s*"google"\)/,
  );
  assert.match(
    emailCallback,
    /principalFromSupabaseUser\(data\.user,\s*"email"\)/,
  );
  assert.match(
    supabaseAuth,
    /identity\.provider === expectedProvider/,
  );
  assert.match(supabaseAuth, /bestEffortLocalSupabaseSignOut/);
  assert.match(
    readFileSync(new URL("../app/api/auth/password/sign-up/route.ts", import.meta.url), "utf8"),
    /if \(data\.session\) throw new SupabaseAuthConfigurationError\(\)/,
  );
});

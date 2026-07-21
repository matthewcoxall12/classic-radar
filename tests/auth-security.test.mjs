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

test("reauthentication is signed, account-bound and forces a fresh Google prompt", () => {
  const appAuth = readFileSync(
    new URL("../lib/app-auth.ts", import.meta.url),
    "utf8",
  );
  const google = readFileSync(
    new URL("../app/api/auth/google/route.ts", import.meta.url),
    "utf8",
  );
  const callback = readFileSync(
    new URL("../app/auth/callback/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(appAuth, /hmacIdentifier\(`reauth-cookie:\$\{unsigned\}`\)/);
  assert.match(appAuth, /reauth-member:/);
  assert.match(appAuth, /identityPrivacyHash\(input\.issuer, input\.subject\)/);
  assert.match(appAuth, /REAUTH_PRINCIPAL_MISMATCH/);
  assert.doesNotMatch(appAuth, /beginReauthentication\(_user.*\) \{\}/);
  assert.match(google, /max_age: "0"/);
  assert.match(callback, /bestEffortLocalSupabaseSignOut\(authClient\)/);
});

test("account controls use the caller-bound Supabase RPCs and real session revocation", () => {
  const accountExport = readFileSync(
    new URL("../app/api/member/export/route.ts", import.meta.url),
    "utf8",
  );
  const accountDelete = readFileSync(
    new URL("../app/api/member/delete/route.ts", import.meta.url),
    "utf8",
  );
  const sessions = readFileSync(
    new URL("../app/api/member/sessions/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(accountExport, /rpc\("export_managed_account_data"/);
  assert.match(accountDelete, /rpc\("delete_managed_account"/);
  assert.match(accountDelete, /p_confirmation: "DELETE"/);
  assert.match(accountDelete, /clearSupabaseAuthCookies\(\)/);
  assert.doesNotMatch(accountExport, /auth_audit_events|auth_sessions/);
  assert.doesNotMatch(accountDelete, /identity_deletion_jobs|stripe_/);
  assert.match(sessions, /signOut\(\{ scope: "others" \}\)/);
});

test("sensitive account RPCs are service-role-only and clean intake data atomically", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260721210000_service_only_account_controls.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /revoke all on function public\.export_managed_account_data\(uuid\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.export_managed_account_data\(uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.delete_managed_account\(uuid, text\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /delete from public\.event_submissions/);
  assert.match(migration, /delete from public\.partner_enquiries/);
  assert.match(migration, /update public\.privacy_requests/);
  assert.match(migration, /delete from auth\.users/);
  assert.ok(
    migration.indexOf("delete from public.event_submissions") <
      migration.indexOf("delete from auth.users"),
  );
  assert.match(migration, /drop function if exists public\.export_own_account_data\(\)/);
  assert.match(migration, /drop function if exists public\.delete_own_account\(text\)/);
});

test("all server auth clients share one secure Host-only cookie namespace", () => {
  const config = readFileSync(
    new URL("../lib/supabase-config.ts", import.meta.url),
    "utf8",
  );
  const routeClient = readFileSync(
    new URL("../lib/supabase-auth.ts", import.meta.url),
    "utf8",
  );
  const serverClient = readFileSync(
    new URL("../lib/supabase-server.ts", import.meta.url),
    "utf8",
  );

  assert.match(config, /SUPABASE_AUTH_COOKIE_NAME = "__Host-cme_supabase_auth"/);
  assert.match(routeClient, /name: SUPABASE_AUTH_COOKIE_NAME/);
  assert.match(serverClient, /name: SUPABASE_AUTH_COOKIE_NAME/);
  assert.match(routeClient, /clearSupabaseAuthCookies/);
});

test("verified signups call the idempotent welcome-email function without blocking auth", () => {
  const supabaseAuth = readFileSync(
    new URL("../lib/supabase-auth.ts", import.meta.url),
    "utf8",
  );
  const googleCallback = readFileSync(
    new URL("../app/auth/callback/route.ts", import.meta.url),
    "utf8",
  );
  const emailCallback = readFileSync(
    new URL("../app/auth/confirm/route.ts", import.meta.url),
    "utf8",
  );
  const passwordSignIn = readFileSync(
    new URL("../app/api/auth/password/sign-in/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(supabaseAuth, /functions\.invoke\("send-welcome-email"/);
  assert.match(supabaseAuth, /catch \(error\)/);
  assert.match(googleCallback, /if \(!reauthenticated\) await bestEffortWelcomeEmail/);
  assert.match(emailCallback, /await bestEffortWelcomeEmail\(client, data\.user\)/);
  assert.match(passwordSignIn, /if \(!reauthenticated\) await bestEffortWelcomeEmail/);
});

test("authentication events have a durable service-only audit sink", () => {
  const appAuth = readFileSync(
    new URL("../lib/app-auth.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260721211500_auth_audit_events.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(appAuth, /from\("auth_audit_events"\)[\s\S]*\.insert\(/);
  assert.match(appAuth, /auth-audit-member:/);
  assert.match(appAuth, /auth-audit-session:/);
  assert.match(migration, /alter table public\.auth_audit_events enable row level security/);
  assert.match(migration, /revoke all on table public\.auth_audit_events[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, delete on table public\.auth_audit_events to service_role/);
});

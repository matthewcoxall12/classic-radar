# Production authentication setup

ClassicsGo uses Supabase Auth with Google as the public-beta sign-in method.
Vercel serves the application and Supabase stores identities, profiles and
member data behind row-level security.

## Required Vercel environment

Configure these in the Vercel project for the intended environment. Secrets
must be encrypted and server-only.

```dotenv
SITE_URL=https://classicsgo.com
NEXT_PUBLIC_SUPABASE_URL=https://rnayhhsurmztrohtftqo.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
AUTH_HASH_PEPPER=at_least_32_random_bytes
ADMIN_EMAILS=matthewcoxall@classicsgo.com
AUTH_PASSWORD_ENABLED=false
```

`SUPABASE_SECRET_KEY`, `AUTH_HASH_PEPPER` and `ADMIN_EMAILS` must never use a
`NEXT_PUBLIC_` prefix. Use a different high-entropy pepper from every provider
secret. Changing it later requires a deliberate migration because it keys
privacy-preserving hashes.

Preview environments should use intentionally scoped configuration. Never point
an untrusted fork at production admin credentials.

## Supabase URL and Google provider

In Supabase Authentication URL Configuration:

```text
Site URL: https://classicsgo.com
Redirect URL: https://classicsgo.com/auth/callback
Redirect URL: https://classicsgo.com/auth/confirm
Redirect URL: https://classicsgo.com/auth/recovery
```

In Google Auth Platform, the OAuth client must be a Web application with:

```text
JavaScript origin: https://classicsgo.com
Redirect URI: https://rnayhhsurmztrohtftqo.supabase.co/auth/v1/callback
```

Keep only OpenID, email and profile scopes. The consent screen must identify
ClassicsGo, use the monitored business support address and link to the live
privacy and terms pages. Store the Google client secret only in the Supabase
Google provider settings.

Email/password, phone and anonymous sign-up remain disabled for the Google-only
beta. Do not expose another sign-in button merely because a provider is enabled
in a dashboard.

## Account-security acceptance

Before public cutover, complete this flow with the Workspace owner account and
an unrelated consumer Google account:

1. Sign in and confirm a single Supabase Google identity and ClassicsGo profile.
2. Sign out and confirm protected routes reject the old session.
3. Sign in again and revoke another session.
4. Trigger reauthentication and confirm a fresh Google round trip is required.
5. Export the account and inspect all expected member datasets.
6. Delete a disposable account and confirm the Supabase identity, member rows,
   sessions, saves and attendance are removed.
7. Confirm audit records contain no tokens, credentials or raw provider
   subjects beyond the documented retention requirement.

Account export and deletion must fail closed if reauthentication or the
server-only Supabase secret is unavailable. Do not launch with placeholder
implementations for these controls.

## Optional email/password launch

Email login is a separate later release. Before setting
`AUTH_PASSWORD_ENABLED=true`:

1. Configure a production SMTP sender in Supabase.
2. Keep Confirm Email enabled.
3. Use exact token-hash links to `/auth/confirm` and `/auth/recovery`.
4. Configure bot protection in both Supabase Auth and the application.
5. Test signup, duplicate signup, confirmation, resend, sign-in, recovery and
   password change with external addresses.
6. Confirm delivery, SPF, DKIM and DMARC for the sender domain.

The default Supabase mail service is not a production sender.

## Welcome email

`supabase/functions/send-welcome-email` is an optional transactional function.
It is not active until all of the following exist:

- a verified sender and `RESEND_API_KEY` in Supabase Function secrets;
- `WELCOME_EMAIL_FROM` in Supabase Function secrets;
- an authenticated signup hook or database webhook invoking the Function; and
- a successful external-address test proving one delivery per identity.

The `welcome_email_deliveries` ledger prevents duplicate sends and is backend
only. Do not claim welcome email is enabled merely because the Function is
deployed.

## Public forms and bot protection

Event, partner and privacy forms require a configured Turnstile site/secret pair
and server-side token validation. Until that is complete, keep the forms
disabled or fail-closed. Never accept a client-only CAPTCHA result.

Record all final settings and lifecycle evidence in the launch checklist. Do
not paste credentials into tickets, PR comments, logs or chat.

# Production identity and public-launch setup

The application uses Supabase only as the managed identity provider. ClassicsGo
member profiles, subscriptions, wishlists, roadbooks, sessions,
security logs, form submissions and cached geocodes remain in the Sites D1
database. This avoids making a mutable email address the security boundary.

The code fails closed when identity, keyed hashing or bot protection is absent.
The landing page and Google sign-in are public; keep protected forms, paid
checkout and broader promotion closed until every applicable gate below is
complete.

## 1. Create an isolated Supabase project

Create a new production project rather than reusing another application's
database. Choose a UK or EU region appropriate to the service's data-protection
requirements. Record these values as secure Sites runtime bindings:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

The secret key is used only by the server to remove the upstream identity when
a free member deletes their account. Never put it in client code or prefix it
with `NEXT_PUBLIC_`.

Supabase Auth setup: <https://supabase.com/docs/guides/auth>

## 2. Configure confirmed email/password accounts

In Supabase Auth URL configuration, set:

```text
Site URL: https://classicsgo.com
Redirect URL: https://classicsgo.com/auth/callback
Redirect URL: https://classicsgo.com/auth/confirm
Redirect URL: https://classicsgo.com/auth/recovery
```

Keep the application gate closed while configuring the provider:

```dotenv
AUTH_PASSWORD_ENABLED=false
```

In Supabase Dashboard:

1. Open **Authentication → Sign In / Providers → Email**.
2. Enable Email and leave **Confirm email** enabled. Do not allow an
   unconfirmed address to create a ClassicsGo session.
3. Configure a production SMTP sender. Supabase's default sender is for
   project-team testing only. Use `ClassicsGo` as the sender name and a
   monitored/verifiable role such as `noreply@classicsgo.com`; keep SMTP
   credentials only in Supabase.
4. Open **Authentication → Email Templates → Confirm signup** and make its
   button link exactly:

   ```text
   https://classicsgo.com/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

5. Open **Reset password** and make its button link exactly:

   ```text
   https://classicsgo.com/auth/recovery?token_hash={{ .TokenHash }}&type=recovery
   ```

6. Brand both messages as ClassicsGo, link to `https://classicsgo.com`, and
   disable click tracking/link rewriting in the SMTP provider.
7. Enable the password-changed security notification. A separate marketing
   welcome email is not sent by this code; the branded confirmation is the
   account-activation message. Add a consent-aware transactional workflow only
   if a distinct welcome series is genuinely required.
8. Configure Cloudflare Turnstile in Supabase Auth's CAPTCHA settings as well
   as in the application. The two controls protect different boundaries.

After confirmation and recovery pass with an external address, set:

```dotenv
AUTH_PASSWORD_ENABLED=true
```

The application then exposes `/sign-up`, `/sign-in`, `/forgot-password`,
`/reset-password` and `/check-email`. Passwords are verified and stored by
Supabase; ClassicsGo does not persist or log plaintext passwords. Recovery
revokes every ClassicsGo session for the member and asks Supabase to revoke the
upstream sessions too.

- Password auth: <https://supabase.com/docs/guides/auth/passwords>
- Production SMTP: <https://supabase.com/docs/guides/auth/auth-smtp>
- Email templates: <https://supabase.com/docs/guides/auth/auth-email-templates>

## 3. Configure Google sign-in

Create a production OAuth web client in Google Cloud. Configure the consent
screen with the final application name `ClassicsGo`, the monitored support
account `matthewcoxall@classicsgo.com`, privacy URL
`https://classicsgo.com/privacy` and terms URL
`https://classicsgo.com/terms`. Add the exact Supabase callback shown in the Supabase Google-provider
panel as an authorised redirect URI, normally:

```text
https://PROJECT_REF.supabase.co/auth/v1/callback
```

Put the Google client ID and secret in the Supabase Google provider settings,
not in this repository. Restrict the credentials to the production app and
remove test users/restrictions only after the consent-screen requirements are
complete.

Current production status: the owner has confirmed that the Google consent app
is in Production and the final-host sign-in works. Continue to verify logout,
reauthentication, account export
and account deletion with both the Workspace account and an unrelated consumer
Google account. Also visually confirm that Google shows the External audience,
published/verified ClassicsGo branding, the exact origin and callback, and only
the basic OpenID email/profile scopes.

Choose the Supabase identity hostname before admitting public members. The app
keys identities to the configured issuer, so changing later from the project
hostname to a branded Auth hostname requires a deliberate issuer migration.

- Supabase Google auth: <https://supabase.com/docs/guides/auth/social-login/auth-google>
- Google OAuth setup: <https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid>

## 4. Configure Turnstile

Create a production Cloudflare Turnstile widget restricted to the exact live
hostname. Store its values as:

```dotenv
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
```

The app independently validates contact and event-submission tokens on the
server, including token action and hostname. Tokens are never trusted from the
browser alone. Email/password activation additionally requires the same
Turnstile widget and secret to be configured in Supabase Auth.

Turnstile server validation:
<https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>

## 5. Generate application security values

Set the canonical public origin and generate a separate high-entropy pepper:

```dotenv
SITE_URL=https://classicsgo.com
AUTH_HASH_PEPPER=at_least_32_random_bytes
```

The pepper keys privacy-preserving IP and deletion-record hashes. Rotate it only
with an explicit migration plan; rotation invalidates those comparisons but not
member sessions. Session and CSRF tokens are random, stored only as hashes, and
sent in Secure `__Host-` cookies.

### Configure the private operations queue

Set an exact, comma-separated allowlist of verified account emails. Do not use
wildcards or a public/client-prefixed environment variable:

```dotenv
ADMIN_EMAILS=matthewcoxall@classicsgo.com
```

The `/admin` page and `/api/admin/*` routes use only verified application
sessions, fail closed when this value is absent or malformed, and re-check the
allowlist on every request. Queue mutations additionally require same-origin
and CSRF validation. Event submissions, partner enquiries and dedicated privacy
requests are stored in D1; each saved status, assignee or internal-note change
writes an append-only administrator audit row. Audit rows cannot be edited or
removed during their 12-month accountability period; the scheduled maintenance
task removes them after that period. Restrict the allowlist to staff who need the
personal information, review it regularly, and never put credentials or payment
details in internal notes.

### Monitor identity deletion recovery

Account deletion returns as soon as its D1 transaction commits. A short-lived,
signed `__Host-cme_deletion_receipt` cookie is the only way the confirmation page
shows deletion claims; a query string or direct visit cannot impersonate a
successful deletion.

Supabase identity removal runs through the Worker recovery path rather than
holding the member's deletion response open. Jobs retry automatically up to
eight times. An issuer mismatch is fail-safe and moves directly to manual
attention instead of trying a user ID against a different Supabase project.
Alert on `Identity deletion requires manual attention`; logs contain only the
opaque job ID and error code, never the provider subject.

Manual-attention jobs retain a raw provider subject for no more than 30 days,
and completed jobs are removed after 24 hours. Per-identity keyed tombstones
remain for the stated abuse-prevention period, so stale provider identities stay
blocked after raw deletion jobs are purged. Before manually retrying a job,
correct the provider configuration and verify its recorded issuer exactly
matches. The runner always rechecks that binding.

```sql
SELECT id, attempts, last_error_code, created_at
FROM identity_deletion_jobs
WHERE status = 'pending'
  AND last_error_code LIKE 'MANUAL_ATTENTION_%';
```

## 6. Configure geocoding deliberately

The default endpoint is the public OpenStreetMap Nominatim service. The app
adds a global one-request-per-second gate, durable 30-day cache, per-connection
limits, identifying User-Agent and visible attribution. Before a commercial or
higher-traffic launch, contract or self-host a compatible service and switch it
without a code release:

```dotenv
GEOCODER_BASE_URL=https://your-compatible-geocoder.example/
GEOCODER_USER_AGENT=ClassicsGo/1.0 (+https://classicsgo.com)
```

Review the current Nominatim policy before each launch:
<https://operations.osmfoundation.org/policies/nominatim/>

## 7. Migration preflight

Migration `0007` deliberately fails if legacy member emails collide after
`lower(trim(email))` normalization. Resolve any such duplicate records in a
staging copy before applying the migration; never let two legacy accounts
silently claim the same trusted identity.

## 8. Full production-capability gates

Before enabling every public form, paid checkout and broad promotion:

- apply every D1 migration in `drizzle/` and confirm the foreign-key check is clean;
- configure all identity, Turnstile, hashing and canonical-origin bindings;
- configure `ADMIN_EMAILS`, sign in as each authorised operator, and verify the
  event, partner and privacy queues plus their audit-write path;
- verify Google sign-in, confirmed email signup, email/password sign-in,
  duplicate-account handling, password recovery, logout and callback errors;
- verify account export, other-session revocation and free-account deletion;
- configure and smoke-test the Worker scheduled trigger for the durable
  identity-deletion retry queue, and alert on manual-attention jobs;
- configure live Stripe products, webhook and Customer Portal using
  `docs/BILLING_SETUP.md` before enabling paid checkout;
- publish the operator's legal name, service address and support/privacy contact;
- complete the ICO fee self-assessment and any required registration;
- execute data-processing agreements and review international-transfer terms
  for Sites/Cloudflare, Supabase, Google, the SMTP provider and Stripe;
- run accessibility, mobile, abuse, backup/restore and incident-response checks;
- set monitoring for auth failures, webhook failures, 5xx responses and D1 errors.

No secret should be pasted into chat, committed, logged or returned to the
browser. Use provider dashboards and encrypted Sites environment settings.

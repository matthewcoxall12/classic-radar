# Production launch checklist

This checklist is deliberately gated. Code and reversible configuration can be
completed ahead of launch; purchases, public access and provider credentials
require an explicit owner decision at the point they are changed.

## 1. Brand, domain and email

`classicsgo.com` was purchased by the owner and is the approved canonical
address. The apex and `www.classicsgo.com` are attached to Sites, validated and
covered by active managed TLS. The application origin, canonical metadata and
geocoder identification now use `https://classicsgo.com`; the secondary and
legacy hostnames permanently redirect there. Preserve the existing Google
Workspace MX, SPF, DKIM and verification records.

For the first monitored business mailbox, Google Workspace is the recommended
fit because the owner already uses Google. The monitored named account is
`matthewcoxall@classicsgo.com`; the `hello`, `support`, `info`, `privacy`,
`security`, `noreply` and `notifications` role addresses route to it as aliases.
The business mailbox is not yet a transactional authentication sender.

- [x] Select a short, distinct domain after live registry, registrar and
  conflict checks.
- [x] Register the domain in the owner's account.
- [x] Attach both the apex and `www` hostname to the Sites project.
- [ ] Confirm auto-renewal, domain lock and registrar-account MFA are enabled.
- [x] Add every DNS and domain-control-validation record returned by Sites.
- [x] Wait for both hostnames and their TLS certificates to report `active`.
- [x] Redirect the secondary hostname to the canonical hostname.
- [x] Change `SITE_URL`, geocoder identification and structured metadata after
  HTTPS is active.
- [x] Configure the final-domain Google identity and callback URLs, with the
  Google consent app in Production.
- [ ] Configure Stripe live callback URLs when billing is provisioned.
- [x] Create one named, monitored mailbox at the final domain.
- [x] Route `hello`, `support`, `info`, `privacy`, `security`, `noreply` and
  `notifications` aliases to the named mailbox.
- [ ] Test inbound delivery to every role alias from an unrelated mailbox.
- [ ] Add and verify DMARC, then test authenticated outbound delivery. Google
  Workspace MX, SPF and DKIM records are already present.

## 2. Event coverage

Implemented in the current release candidate: a secret-authenticated normalized
intake, permission-gated source registry, UK/European query generator,
Firecrawl search/map/scrape/resumable crawl, Ticketmaster, authorised
Eventbrite organisations, organiser-authorised Google Calendar API, ICS, RSS,
JSON-LD, microdata and OpenGraph adapters, confidence scoring,
fuzzy/geographic deduplication, a private review queue, separate
publish/withdraw actions, source-version conflict protection, and append-only
source/withdrawal audits. Cancellation signals can withdraw an exact matched
listing immediately for review; events not seen for 14 days create a separate
operator alert rather than being treated as cancelled. Historical demo events
are withdrawn and the six unreviewed Hampshire seed candidates have been
removed.

Catalogue version 4 contains 117 entries: 92 researched source/partnership
leads and 25 system entries, including 16 Firecrawl and eight Ticketmaster
search shards. The web and Ticketmaster query inventories are provider-specific
and complete a rotation within 24 hours under the default healthy schedule.

- [ ] Keep organiser submissions and club/venue onboarding as first-class
  sources.
- [x] Provide private administration for reviewed public calendars,
  RSS/iCalendar feeds, structured-data pages and permitted partner APIs.
- [x] Send discovered records into a private candidate queue with source URL,
  first/last-seen timestamps and a duplicate fingerprint.
- [x] Require human approval before a candidate becomes a public event.
- [x] Add cancellation handling, immutable cancellation/staleness alerts and
  preservation of member saves/attendance when a listing is withdrawn.
- [ ] Add production Firecrawl, Ticketmaster and Google Calendar credentials;
  add Eventbrite credentials only for authorised organisation IDs.
- [ ] Review terms, robots rules and permissions in `/admin`; run a bounded
  canary on selected sources, inspect provenance/duplicates/alerts, then set
  `DISCOVERY_ENABLED=true`.
- [ ] Monitor the 24-hour provider-query rotations and re-check open
  stale/changed/cancelled alerts before event dates.
- [ ] Approach CarEvents.com, Classic Shows UK and other directory leads for a
  partnership or licensed feed. Their inclusion in the catalogue is a research
  lead, not permission to copy their databases.
- [ ] Never bypass logins, access controls, robots restrictions or platform
  terms. Facebook and Instagram links may be recorded as public provenance;
  automated collection requires the relevant platform permission.
- [x] Exclude Google Custom Search and Google Places from durable event
  ingestion. Custom Search is closed to new customers; Places content rules do
  not fit the persistent D1 event/provenance catalogue.

## 3. Accounts and community signals

Implemented in the current release candidate: durable per-member Going choices,
anonymous public totals, rate limits, same-origin/CSRF enforcement, account
listing/export, and foreign-key deletion. The isolated Supabase project and
Google production callback are configured, and the owner has confirmed a
final-host Google sign-in. A repeatable two-account lifecycle test and the
email/password production configuration remain launch gates.

- [x] Allow only verified signed-in members to mark themselves as going.
- [x] Show aggregate attendance counts publicly but never attendee identities.
- [x] Make changes idempotent, rate-limited and protected by the existing
  same-origin, CSRF and revocable-session controls.
- [x] Include attendance choices in account export and remove them through the
  account foreign-key cascade.

## 4. Remaining production gates

- [x] Provision an isolated managed-identity project, configure the Google OAuth
  callback for the final domain and move the Google consent app to Production.
- [ ] Configure custom SMTP, exact token-hash confirmation/recovery templates,
  Supabase CAPTCHA and application Turnstile, then enable
  `AUTH_PASSWORD_ENABLED` only after external-address tests pass.
- [ ] Add `SUPABASE_SECRET_KEY` as a server-only encrypted binding and verify
  free-account deletion removes the managed identity. Never expose it in the
  browser or repository.
- [ ] In Google Auth Platform, visually confirm the External audience,
  published/verified ClassicsGo branding, exact production origin and callback,
  and only the basic OpenID email/profile scopes.
- [ ] Repeat final-host Google sign-in, logout, reauthentication, account export
  and account deletion with both the Workspace account and an unrelated
  consumer Google account. Test confirmed email signup, sign-in, duplicate
  signup, resend and password recovery with an unrelated address.
- [ ] Configure application and Supabase Turnstile, Stripe live
  products/webhooks and the monitored SMTP sender through provider dashboards
  and encrypted production environment variables.
- [ ] Keep `AUTH_PASSWORD_ENABLED=false` until Confirm Email, exact token-hash
  templates, custom SMTP and both Turnstile checks pass. Keep
  `DISCOVERY_ENABLED=false` until provider secrets and source-rights canaries
  pass. These are intentional production safety gates, not incomplete UI.
- [ ] Confirm the public operator/service-address wording and complete the UK
  privacy, processor and international-transfer records.
- [ ] Apply migrations `0021`–`0023` to the production D1 database and confirm
  the foreign-key check, authenticated-email session guards and immutable
  discovery-alert triggers.
- [ ] Re-run the production build, TypeScript, lint, security/render tests,
  unauthenticated browser presentation checks and live domain/TLS status checks
  for this release candidate.
- [ ] Complete authenticated final-domain browser flows, monitoring checks and
  business-email authentication/delivery checks.
- [x] Change the Sites access policy from owner-only to public so the ClassicsGo
  landing page and Google sign-in load directly without the hosting access gate.
  Forms and paid checkout continue to fail closed until their production
  bindings and checks are complete.

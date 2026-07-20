# Authentication and discovery upgrade — file-by-file diff

This is the human-readable handoff for the production upgrade. Historical
migrations remain immutable; migration `0021` retires the old launch data.

## Runtime configuration and dependencies

- `.env.example` — replaces the obsolete passwordless flag with fail-closed
  email/password settings and adds discovery, Google Calendar, partner-provider
  and European geocoder bindings.
- `package.json`, `package-lock.json` — pin Fuse.js, geolib, chrono-node,
  ical.js, rss-parser and microdata-node.
- `lib/runtime-env.ts` — types all auth, CAPTCHA, discovery and provider
  bindings, including `GOOGLE_CALENDAR_API_KEY`.
- `worker/index.ts` — runs up to two leased discovery endpoints from the
  15-minute Worker schedule and adds private/no-store handling for auth pages.

## Account and sign-in experience

- `components/sign-in-panel.tsx` — one branded component for Google,
  email/password signup, sign-in, confirmation resend, forgot-password and
  reset-password states; includes password visibility, terms disclosure and
  Turnstile.
- `app/sign-in/page.tsx` — professional sign-in mode, safe return path and
  password-update notices.
- `app/sign-up/page.tsx` — dedicated account creation page.
- `app/forgot-password/page.tsx` — dedicated recovery-request page.
- `app/reset-password/page.tsx` — dedicated new-password page.
- `app/check-email/page.tsx` — dedicated confirmation and resend page.
- `app/api/auth/password/sign-in/route.ts` — bounded password grant, durable
  account/IP limits, CAPTCHA and app-session creation.
- `app/api/auth/password/sign-up/route.ts` — confirmed signup with terms,
  CAPTCHA, anti-enumeration behaviour and fail-closed cleanup if confirmation
  is accidentally disabled in Supabase.
- `app/api/auth/password/forgot/route.ts` — generic recovery response,
  provider delivery telemetry and token-hash recovery destination.
- `app/api/auth/password/resend/route.ts` — separate IP and global account/email
  limits, generic response and PII-free delivery telemetry.
- `app/api/auth/password/reset/route.ts` — recovery-cookie verification,
  password update, global Supabase sign-out and revocation of every ClassicsGo
  session for that identity.
- `app/auth/confirm/route.ts` — verifies only `token_hash` plus `type=email`,
  creates the app session, then clears the temporary upstream session.
- `app/auth/recovery/route.ts` — verifies only recovery tokens and creates a
  short-lived signed recovery state.
- `app/auth/callback/route.ts` — validates Google identities and clears the
  temporary upstream session after the app session is established.
- `app/api/auth/email/route.ts` — removes the obsolete passwordless magic-link
  endpoint.
- `lib/password-auth.ts` — password/name/email validation, signed recovery
  state and PII-free email-delivery telemetry.
- `lib/supabase-auth.ts` — production availability gates, Turnstile, 20-minute
  PKCE cookies, strict provider-identity validation and best-effort upstream
  session cleanup.
- `lib/app-auth.ts` — issuer/subject-bound app sessions, authenticated-email
  snapshots, atomic legacy-account claiming and whole-member session revocation
  after password recovery.
- `lib/admin-auth.ts` — authorises an administrator against the session's
  freshly authenticated email, not a stale profile address.
- `app/robots.ts`, `app/globals.css` — noindex/no-store auth surfaces and
  complete responsive account styling.

## Dynamic event catalogue and international UI

- `lib/events.ts` — keeps event types/categories only; all static event and
  Hampshire location arrays are removed.
- `lib/public-events.ts` — D1-only public reads with active-source provenance,
  corrected source URLs and bounded indexable-event listing.
- `app/api/events/route.ts` — validates date/category/location/radius filters,
  applies bounding-box plus Haversine distance filtering, and returns a stable
  keyset-paginated maximum of 50 published events.
- `components/event-finder.tsx` — starts from server-rendered D1 data, performs
  server filtering and keyset “show more”, merges saved-event detail safely,
  and uses UK/Europe-neutral copy.
- `app/events/[id]/page.tsx` — removes static parameter generation.
- `app/sitemap.ts` — emits a stable, bounded set of published event URLs.
- `lib/event-seo.ts` — country/timezone-neutral event metadata.
- `app/api/geocode/route.ts` — removes local shortcuts and supports configured
  UK/European country coverage.
- `components/submission-form.tsx` — uses a neutral international location
  example.
- `components/member-portal.tsx` — removes the Hampshire-specific saved-area
  example.
- `compat/client-assets/v10/event-finder-d6QLHoER.js` — removes the shipped
  compatibility bundle containing static Hampshire events.
- `compat/client-assets/v10/manifest.json` — removes that legacy asset entry.

## Discovery engine

- `lib/discovery/types.ts` — provider, endpoint, finding, cancellation and
  continuation contracts.
- `lib/discovery/geography.ts` — 12 UK regions, 94 UK county/council areas and
  40 European countries/locales/timezones.
- `lib/discovery/query-generator.ts` — provider-aware query inventories: 146
  combined web searches and 82 Ticketmaster event-name searches.
- `lib/discovery/source-catalog.ts` — catalogue version 4 with 117 researched
  and system entries, including 16 Firecrawl and eight Ticketmaster shards;
  all researched web sources remain Pending.
- `lib/discovery/catalog-store.ts` — versioned, chunked catalogue installation,
  retirement of obsolete shards, and preservation of operator pause/revoke
  decisions.
- `lib/discovery/confidence.ts` — explainable extraction confidence score.
- `lib/discovery/dedupe.ts` — Fuse.js title matching, geolib distance scoring
  and merge/review/distinct thresholds.
- `lib/discovery/normalize.ts` — chrono-node locale parsing, international
  geography normalization, cancellation state, safe URLs and deterministic
  external IDs.
- `lib/discovery/intake-service.ts` — idempotent D1 ingestion, confidence-aware
  fact updates, fuzzy-match queueing, bounded candidate searches and race-safe
  last-seen refreshes that do not disturb administrator CAS state.
- `lib/discovery/orchestrator.ts` — source-gated leases, query records,
  cancellation withdrawal/alerts, 14-day stale-source alerts, per-finding
  isolation, resumable jobs, 15-minute continuation and bounded retry.
- `lib/discovery/extractors/index.ts` — combines and deduplicates JSON-LD,
  microdata and metadata/OpenGraph results.
- `lib/discovery/extractors/jsonld.ts` — bounded Schema.org Event graph and
  cancellation extraction.
- `lib/discovery/extractors/microdata.ts` — microdata-node Event and
  cancellation extraction.
- `lib/discovery/extractors/metascraper.ts` — Worker-safe bounded metadata and
  OpenGraph extraction layer.
- `lib/discovery/providers/http.ts` — size/content-type/redirect/origin-bound
  public HTTPS fetcher.
- `lib/discovery/providers/firecrawl.ts` — URL-first search, local filtering,
  raw-HTML and structured fields, rotating map cursor, bounded robots-aware
  crawl and async continuation; blocks direct social automation.
- `lib/discovery/providers/ticketmaster.ts` — sharded current/future Discovery
  API queries.
- `lib/discovery/providers/eventbrite.ts` — authorised-organisation ingestion
  only.
- `lib/discovery/providers/google-calendar.ts` — exact organiser-authorised
  Calendar API events endpoints, pagination, incremental sync, deleted entries,
  cancellation and safe `410` reset.
- `lib/discovery/providers/ical.ts` — local-time-safe ICS, cancellation, capped
  recurrence and component continuation.
- `lib/discovery/providers/rss.ts` — bounded RSS/Atom plus same-origin
  structured-page enhancement.
- `lib/discovery/providers/index.ts` — adapter dispatch including Google
  Calendar.
- `types/microdata-node.d.ts` — strict local type declaration for the package.
- `app/api/discovery/intake/route.ts` — thin secret-authenticated API over the
  shared storage service; there is no publication path.
- `lib/discovery-payload.ts` — schema v2 international fields, validation,
  source/method compatibility and deterministic keys.

## Database and private operations

- `db/schema.ts` — authenticated-email session snapshots, international event
  facts, endpoints, runs, query coverage, match review, catalogue state and
  immutable discovery-alert evidence.
- `drizzle/0021_fuzzy_reptil.sql` — applies the discovery/auth schema, backfills
  identity sessions, withdraws 14 old launch events, conditionally removes six
  unreviewed seeds and preserves/rebuilds safety triggers.
- `drizzle/0022_outstanding_vin_gonzales.sql` — adds versioned discovery
  catalogue installation state.
- `drizzle/0023_faulty_sumo.sql` — adds authenticated-email session snapshots,
  discovery alerts, supporting public-search/geo indexes and immutable alert
  evidence/no-delete guards; existing sessions without a trusted snapshot are
  revoked.
- `drizzle/meta/0021_snapshot.json`, `drizzle/meta/0022_snapshot.json`,
  `drizzle/meta/0023_snapshot.json`, `drizzle/meta/_journal.json` — Drizzle
  schema history.
- `app/api/admin/discovery/source/route.ts` — keyset-paginated source registry
  with server-side search/status filters and audited source controls.
- `app/api/admin/discovery/endpoint/route.ts` — Pending-first onboarding for
  RSS, ICS, Google Calendar API and permitted Firecrawl targets; rejects
  secrets, unsupported provider URLs and direct social automation.
- `components/discovery-source-registry.tsx`,
  `components/discovery-source-registry.module.css` — source health,
  trust/permission controls, pagination and endpoint onboarding UI.
- `app/admin/page.tsx`, `components/admin-queue.tsx` — paginated candidate and
  source administration with open cancellation/staleness alerts and
  international event fields.
- `app/api/admin/queue/route.ts` — keyset-paginated candidate/alert queue,
  compare-and-swap edits, immutable audit writes and alert resolution.
- `app/api/admin/discovery/publish/route.ts`,
  `app/api/admin/discovery/withdraw/route.ts`, `lib/operations-queue.ts` —
  publish/withdraw international facts with current authenticated operator
  identity and audited alert resolution.

## Documentation, privacy and verification

- `README.md` — current identity and scheduled-discovery architecture plus
  fail-closed production gates.
- `docs/AUTH_SETUP.md` — exact confirmed-email, SMTP, token-hash template,
  CAPTCHA and activation steps.
- `docs/DISCOVERY_INGEST.md` — links private intake to scheduled discovery and
  international publication requirements.
- `docs/DISCOVERY_ARCHITECTURE.md` — provider/scheduler/dedupe/freshness
  operations runbook and explicit Google/social/Eventbrite exclusions.
- `docs/COMPETITOR_AND_SOURCE_RESEARCH.md` — dated competitor findings,
  source candidates and rights-review decisions.
- `docs/PRODUCTION_LAUNCH.md` — completed capabilities and owner/provider-
  dependent launch gates.
- `app/privacy/page.tsx` — Google/email identity and optional discovery
  processor disclosures.
- `tests/auth-security.test.mjs` — password routes, identity-provider checks,
  fail-closed signup and session-revocation checks.
- `tests/discovery-intake.test.mjs` — international payload, shared service,
  deduplication and source-control checks.
- `tests/discovery-runtime.test.mjs` — geography, provider query/shard,
  dedupe, extraction, scheduler, origin and Firecrawl safety regressions.
- `tests/migrations.test.mjs` — tables/indexes/triggers, authenticated-email
  guards, immutable alerts and hardcoded-data retirement.
- `tests/rendered-html.test.mjs` — Google-only fail-closed production rendering
  until email prerequisites are enabled.

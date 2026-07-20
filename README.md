# ClassicsGo

A full-stack classic-car event finder running on
[vinext](https://github.com/cloudflare/vinext), Sites and Cloudflare D1.
Anonymous visitors can search nearby events and see aggregate attendance.
Verified members can sync a wishlist, mark events as Going, save an area and
use the Roadbook planning, alert, garage, calendar and billing features
attached to their tier.

## Production architecture

- Sites/Cloudflare Worker application runtime and D1 application database
- Supabase managed identity for Google OAuth and confirmed email/password accounts
- app-owned opaque sessions, CSRF protection and durable abuse limits in D1
- Cloudflare Turnstile on email-account, event and contact forms
- 15-minute Worker scheduling for permission-gated UK/European event discovery
  into a private D1 review queue; no Supabase Cron
- Stripe-hosted Checkout and Customer Portal for paid membership

Google sign-in is independent of the email/password gate. Email signup remains
hidden and rejected while `AUTH_PASSWORD_ENABLED=false`; enable it only after
Supabase Confirm Email, custom SMTP, exact token-hash templates and both
Supabase/application Turnstile have passed external-address tests. Discovery
similarly remains idle while `DISCOVERY_ENABLED=false`.

The discovery catalogue contains 117 researched/system entries and uses 16
Firecrawl plus eight Ticketmaster query shards, organiser-authorised Google
Calendar, authorised Eventbrite organisations, ICS, RSS and layered structured
data extraction. Provider-specific query inventories cover the UK and 40
European countries within a 24-hour healthy rotation. Candidates require human
review before publication; exact cancellations and 14-day staleness create
auditable operator alerts. Google Custom Search, Google Places ingestion,
general Eventbrite database retrieval and direct social-platform scraping are
deliberately excluded.

See `docs/AUTH_SETUP.md`, `docs/DISCOVERY_ARCHITECTURE.md`,
`docs/COMPETITOR_AND_SOURCE_RESEARCH.md` and `docs/BILLING_SETUP.md` before
enabling their production gates.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Application shape

- edit site code under `app/`
- `lib/app-auth.ts` owns member identities and revocable application sessions
- `lib/auth-return-path.ts` validates post-authentication return paths
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` defines events, members, identity, billing and planning data
- `lib/discovery/` contains provider adapters, extraction, normalization,
  deduplication and the scheduled ingestion orchestrator
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

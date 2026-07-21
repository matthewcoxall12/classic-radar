# Vercel and Supabase migration inventory

This file records the infrastructure boundary of the parity migration. It is
not a deployment script.

## Preserved application surface

The approved page/component/style/assets layer remains protected by
`tests/sites-v13-parity.test.mjs`. User-visible changes require an intentional
parity-baseline update and review.

## Current runtime files

- `app/` — Next.js App Router pages and route handlers
- `components/` — preserved ClassicsGo interface and client interactions
- `lib/supabase-*.ts` — Supabase browser/server configuration and identity
- `lib/public-events.ts` — published-event reads
- `supabase/migrations/` — Postgres schema, functions, indexes and RLS history
- `supabase/functions/ingest-events/` — GitHub-OIDC discovery ingestion
- `supabase/functions/send-welcome-email/` — optional transactional welcome
  sender, not active until the signup hook and sender are configured
- `.github/workflows/ci.yml` — pull-request verification
- `.github/workflows/discover-events.yml` — scheduled discovery
- `.github/workflows/uptime-monitor.yml` — production smoke monitoring

## Deployment boundary

Vercel builds previews for PR commits and production from the reviewed default
branch. Supabase schema and Function deployment are separate reviewed changes.
Neither a preview build nor a merged migration file applies a production
database change by itself.

No legacy hosting runtime, database binding or scheduler is required by this
release. Operational instructions live in `README.md` and `docs/`; if an old
copy of the application is used for reference, do not copy its deployment or
database configuration back into this branch.

## Remaining provider gates

Provider-owned configuration is tracked in `PRODUCTION_LAUNCH.md`: production
environment values, Google lifecycle tests, optional email sender/hook,
Turnstile, Stripe, legal service details and notifications. These are not
silently enabled by the code migration.

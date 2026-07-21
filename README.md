# ClassicsGo

ClassicsGo is a UK and European classic-car event finder. This repository is
the production Next.js application and preserves the approved Sites-v13
presentation while running on Vercel and Supabase.

## Production architecture

- Next.js 16 App Router deployed through Vercel's Git integration
- Supabase Auth for Google identity
- Supabase Postgres with row-level security for events, member data, review
  queues and discovery provenance
- a Supabase Edge Function for authenticated event ingestion
- GitHub Actions for six-hourly discovery, authenticated to the Edge Function
  with short-lived GitHub OIDC tokens
- Vercel runtime logs plus a scheduled GitHub Actions smoke monitor

Public event reads expose only reviewed, published rows. Discovery findings go
to a private review queue and are never auto-published. Google sign-in is the
supported public-beta identity flow. Email/password, public submissions and
paid membership remain fail-closed until their provider configuration and
end-to-end acceptance tests are complete.

## Local development

Use Node.js `24.14.0`; `.node-version` and `.nvmrc` carry the exact development
and CI version. Vercel is configured through `engines.node` for the supported
`24.x` runtime line.

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and provide only development values. Never
commit production secrets.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

The pull-request workflow runs the locked install, production dependency audit,
lint, type-check, complete tests and production build. Vercel creates the
preview deployment independently. Production promotion remains an explicit
owner action after review; do not manually deploy a PR branch to production.

## Operations

- `docs/PRODUCTION_LAUNCH.md` — launch gates and owner-only configuration
- `docs/AUTH_SETUP.md` — Google, optional email and account-security setup
- `docs/DISCOVERY_ARCHITECTURE.md` — discovery data flow and source controls
- `docs/DISCOVERY_INGEST.md` — GitHub OIDC ingestion operations
- `docs/MONITORING_RUNBOOK.md` — monitoring, incidents and rollback
- `docs/BILLING_SETUP.md` — deferred Stripe enablement

Database changes are forward-only SQL files in `supabase/migrations/`. Edge
Functions live in `supabase/functions/`. Apply migrations and function changes
through the reviewed Supabase deployment process; never edit production tables
manually to bypass a migration.

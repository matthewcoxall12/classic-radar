# ClassicsGo

ClassicsGo is a production Next.js application for finding classic-car shows, club meets, autojumbles, museum days, road runs and historic-motorsport events across the United Kingdom and Europe.

## Production architecture

- Next.js 16 on Vercel
- Google OAuth through Supabase Auth
- Supabase Postgres with Row Level Security
- GitHub Actions event discovery daily at 03:17 UTC, plus manual dispatch
- Supabase Edge Function ingestion authenticated with GitHub OIDC
- No hardcoded or demo events
- No Supabase Cron, Vercel Cron, long-lived CI database key, or email/password dependency

## Commands

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:discovery
```

A safe local discovery sample does not write to the database:

```sh
DISCOVERY_DRY_RUN=true \
DISCOVERY_SOURCE_URL=https://www.britishmotormuseum.co.uk/whats-on \
DISCOVERY_SOURCE_NAME="British Motor Museum" \
DISCOVERY_DETAIL_LIMIT=2 npm run discover
```

See [docs/event-discovery.md](docs/event-discovery.md) for extraction, scheduling, security and retention details.

## Public configuration

The website needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Set `NEXT_PUBLIC_SITE_URL=https://classicsgo.com` for canonical production metadata. Optional paid billing requires a server-only Supabase secret and Stripe secrets in Vercel; never prefix these with NEXT_PUBLIC. Cron, agent and search-provider secrets remain outside the website runtime. See [billing operations](docs/billing-operations.md).

## Account and operational email

All public contact and operational replies go to `matthewcoxall@googlemail.com`. Google Workspace is not required for Google sign-in or the site. Keep infrastructure access with the verified personal Google account and grant administrator access explicitly by user UUID; signup never grants administrator rights from an email address.

Welcome delivery is optional and cannot prevent sign-in. It is currently disabled because `RESEND_API_KEY` and `WELCOME_EMAIL_FROM` are not configured in Supabase. Enable it only after verifying a sender domain with Resend and configuring those Edge Function secrets. Use a custom-domain sender such as `ClassicsGo <welcome@classicsgo.com>` after domain verification; never use Gmail/Googlemail as the Resend From address. Replies go to Matthew's personal address through `reply_to`. The function rejects consumer-mailbox and Resend test senders, requires an authenticated verified recipient, and claims each user's one-off delivery in its private ledger. No newsletter enrollment is implied. Once a delivery request may have reached Resend, network timeouts, interrupted accepted responses and ledger-update failures keep its private claim to prevent later duplicate welcome messages. A confirmed provider rejection releases the claim for retry. Reconcile any stale `sending` rows against Resend delivery logs before changing them: mark confirmed accepted messages sent with their provider message ID; remove a claim only when non-delivery is established. Never bulk-delete pending claims or automatically retry uncertain sends after the provider idempotency window.

`npm run test:discovery` also runs authentication redirect, event publishing validation, entitlement, Roadbook calendar and welcome-content regressions. Rollback SQL security checks are in `tests/account-session-security.sql`, `tests/account-admin-default.sql` and `tests/self-service-events.sql`; run against the intended Supabase project after its migrations.

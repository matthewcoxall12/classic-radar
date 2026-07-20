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

The website needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Set `NEXT_PUBLIC_SITE_URL=https://classicsgo.com` for canonical production metadata. No service-role, cron, agent or search-provider secret belongs in Vercel.

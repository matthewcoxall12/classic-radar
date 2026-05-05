# Classic Radar

Classic Radar is a production-ready MVP for a UK-wide classic car event finder. It uses Next.js App Router, TypeScript, Tailwind CSS, Vercel Cron and Supabase for Postgres, Auth and RLS.

The app works locally without Supabase keys for UI development. Real event discovery requires Supabase service-role credentials because the agent writes events, sources, review items and run logs.

## Features

- Public event finder with location, radius, date and event type filters
- Event cards with distance, price, booking status, source confidence and organiser links
- Event detail pages with source confidence and travel warning
- Email magic-link sign-in via Supabase Auth
- Saved events and reminder preference-ready schema
- Missing event submissions routed to admin review
- Protected admin dashboard for event management, review queue and agent logs
- Vercel API discovery agent at `/api/agent/run`
- Real source-first crawling from Supabase `source_registry`
- Supabase migrations for schema, RLS, seed data and cron setup

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

3. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Without Supabase values, the app uses seeded in-code demo data. With Supabase values, it reads and writes to your project.

## Create A Supabase Project

1. Create a new Supabase project.
2. Copy the Project URL and anon public key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
AGENT_SECRET=choose-a-long-random-secret
CRON_SECRET=choose-a-long-random-secret
```

3. In Supabase Auth settings, enable email magic links.
4. Add `http://localhost:3000/auth/callback` and your production callback URL to allowed redirect URLs.

## Run Migrations

Install the Supabase CLI, link the project, then run:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migrations create:

- `profiles`
- `events`
- `event_sources`
- `user_submissions`
- `saved_events`
- `agent_runs`
- `review_queue`
- RLS policies
- development seed events
- real source registry seed data

## Make A User Admin

After signing in once, run this in the Supabase SQL editor:

```sql
update public.profiles
set is_admin = true
where id = 'USER_UUID';
```

You can find the user UUID in Supabase Auth users.

## Deploy To Vercel

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add these environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AGENT_SECRET
CRON_SECRET
SEARCH_PROVIDER_API_KEY
GEOCODING_API_KEY
```

`SEARCH_PROVIDER_API_KEY` and `GEOCODING_API_KEY` are optional for the MVP.

4. Deploy. Set the production auth callback URL in Supabase:

```text
https://YOUR_DOMAIN/auth/callback
```

## Agent API

The production discovery agent runs in the Next.js route `/api/agent/run` and is designed for Vercel Cron.

Manual test:

```bash
curl "https://YOUR_DOMAIN/api/agent/run?type=manual_deep" \
  -H "Authorization: Bearer YOUR_CRON_OR_AGENT_SECRET"
```

## Configure Vercel Cron

`vercel.json` defines three scheduled runs:

```json
{
  "crons": [
    { "path": "/api/agent/run?type=morning_broad", "schedule": "0 6 * * *" },
    { "path": "/api/agent/run?type=midday_near_term", "schedule": "0 14 * * *" },
    { "path": "/api/agent/run?type=evening_social", "schedule": "0 21 * * *" }
  ]
}
```

Set `CRON_SECRET` in Vercel so the route can verify scheduled requests.

Schedules included:

- `06:00` UK-time intended broad search: `morning_broad`
- `14:00` UK-time intended next-14-days search: `midday_near_term`
- `21:00` UK-time intended last-minute/public-web search: `evening_social`

Vercel Cron schedules are UTC. Adjust schedules seasonally if exact Europe/London wall-clock timing is required across GMT/BST.

## Trigger The Agent Manually

From the app:

1. Sign in as an admin.
2. Open `/admin`.
3. Choose a run type.
4. Click `Trigger agent`.

From the command line, use the curl example above.

## Query Generation

The query engine lives in `lib/agent/query-engine.ts`.

It generates structured `SearchPlan` objects for four run types:

- `morning_broad`: broad UK, region, county, calendar and venue discovery.
- `midday_near_term`: this weekend, next weekend, next 7 days and next 14 days.
- `evening_social`: public social/community style queries and last-minute wording.
- `manual_deep`: the full deep run.

`generateSearchPlan("manual_deep")` returns 500 unique queries in the current configuration. Queries are deduplicated, prioritised, categorised, and limited per run type.

## Source Registry

Source priority defaults live in `lib/agent/source-weights.ts`. Admins manage live source URLs in `/admin/settings` using the `source_registry` table.

To add a new source domain:

1. Open `/admin/settings`.
2. Add the domain without protocol, for example `exampleclub.co.uk`.
3. Add a real `start_url`.
4. Pick a source type.
5. Set a priority weight from `0` to `100`.
6. Enable or disable it.
7. Choose whether it requires manual review.
8. Add notes for future reviewers.

The agent loads active registry rows first and uses the row weight/type as the source trust signal.

## Confidence Scoring

Confidence scoring lives in `lib/agent/confidence.ts`.

The score starts at half the source weight, then adds confidence for exact dates, venue/town, postcode, booking URL, recognised event type, multiple sources, title match and images. It subtracts for missing date/location, vague terms, expired-looking pages and unrelated event types.

Auto-publish requires:

- confidence `>= 75`
- `start_date`
- town, venue or postcode
- source URL

Everything else goes to `review_queue`.

## Review Queue

The review queue is used for low-confidence or incomplete candidates. Admins can open `/admin/review` to see:

- confidence score
- source type
- source URL
- raw snippet
- proposed event JSON
- approve as published
- edit before publishing
- reject
- merge with existing event

Approving creates a published event, stores the source link, and marks the queue item approved.

## Real Source Crawling

The crawler lives in `lib/agent/source-crawler.ts`.

It supports direct source pages, event calendar pages, ticketing pages, museum and venue event pages, club calendar pages, and publicly accessible social links found from sources or user submissions.

It does not use Facebook API, private group scraping, login bypassing, or paid search APIs. It checks `robots.txt` where possible, uses polite rate limiting, stores source URLs, and records source errors in `agent_runs.errors` and `source_registry.last_error`.

## Run The Agent Locally

The real agent needs Supabase environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
AGENT_SECRET
```

```bash
npm run dev
```

Then open `/admin`, choose `Manual deep`, and click `Trigger agent`, or call:

```bash
curl "http://localhost:3000/api/agent/run?type=manual_deep&secret=YOUR_AGENT_SECRET"
```

To verify query generation directly:

```bash
npx tsx -e "import { generateSearchPlan } from './lib/agent/query-engine.ts'; const p = generateSearchPlan('manual_deep'); console.log(p.queries.length)"
```

Expected output is at least `200`.

## Agent Design

The Vercel API agent:

1. Validates `CRON_SECRET` or `AGENT_SECRET`.
2. Creates an `agent_runs` row.
3. Loads active `source_registry` rows.
4. Fetches each real `start_url`.
5. Extracts same-domain event links.
6. Follows event detail links.
7. Extracts JSON-LD Event data first, then Open Graph, time tags and text patterns.
8. Normalises titles, dates, event type and location hints.
9. Applies source registry trust weighting.
10. Scores confidence.
11. Deduplicates by title, date, town and coordinates.
12. Publishes strong events at confidence `>= 75`.
13. Sends uncertain events to `review_queue`.
14. Stores every source URL in `event_sources`.
15. Merges duplicate sources into existing events.
16. Marks past events as expired.
17. Updates run stats and errors.

The MVP deliberately avoids aggressive scraping, official Facebook APIs, Google Events APIs and internal ticket payments. It stores source URLs and sends users to organiser links.

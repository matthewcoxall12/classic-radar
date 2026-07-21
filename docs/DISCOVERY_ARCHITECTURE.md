# Event discovery architecture

## Outcome

Discovery is a review pipeline, not an auto-publisher. Public search reads only
future `events` rows whose status is `published`. New findings remain private
until an authorised operator reviews and publishes them.

```text
GitHub Actions schedule or manual dispatch
  -> short-lived GitHub OIDC token
  -> Supabase ingest Edge Function
  -> active source catalogue
  -> bounded public-page scan
  -> normalisation and deduplication
  -> Supabase observations and private review queue
  -> explicit administrator publication
  -> public event catalogue
```

## Scheduler and trust boundary

`.github/workflows/discover-events.yml` runs every six hours and can also be
started manually with a source key or limit. The workflow has only
`contents: read` and `id-token: write`. It does not hold a database credential
or permanent ingestion secret.

`scripts/discover-events.mjs` requests a GitHub OIDC token with audience
`classicsgo-ingest`. The Supabase `ingest-events` function verifies the token's
issuer, audience, repository, repository-owner ID, `main` ref, workflow path and
event type before any privileged database operation. Tokens from forks, PR
refs, another workflow or another repository are rejected.

The current runner supports bounded public HTML sources. Entries with formats
that do not yet have a reviewed parser are inactive in the catalogue. Login
walls, private pages, CAPTCHAs, direct social automation, literal/private IPs,
credentials in URLs and unsafe redirects are rejected.

## Extraction and data quality

The runner extracts public Schema.org JSON-LD and conservative page metadata,
then normalises title, date, venue, town, postcode, coordinates, category,
official URL and source provenance. It:

- limits fetched bytes, detail pages, redirects and concurrency;
- resolves DNS and rejects private or special-use addresses;
- accepts only current or near-future event dates;
- removes tracking parameters and unsafe markup;
- deduplicates within a run before ingestion; and
- records per-source failures without treating a partial run as complete.

The Edge Function performs database-side matching and records the discovery run,
observations and review outcome. Candidate creation or refresh does not make a
row public.

## Supabase data model

The production migrations define:

- `source_registry` — source URL, type, region, review requirement and active
  state;
- `agent_runs` — scheduled/manual run status, counts and errors;
- `review_queue` — private findings awaiting an operator decision;
- `event_observations` — source provenance and normalized observations;
- `events` — reviewed event facts and publication status; and
- `event_sources` — public-safe source attribution for published events.

Row-level security is the browser data boundary. The Edge Function uses a
server-only Supabase secret key and is the only discovery component allowed to
write with elevated privileges.

## Source policy

Registering a URL is not permission to collect it. Before an active source is
added or materially changed, record the source owner, permitted interface,
fields collected and review decision. Pause a source when its terms, robots
rules, ownership or output format changes.

Never bypass access controls or use private account data. Store only event facts
needed for the listing and their public provenance; do not retain raw pages,
cookies, attendee identities or unrelated personal data.

## Operations

Use GitHub Actions for run history and Supabase `agent_runs` for application
outcomes. A healthy run may still be partial; inspect `sourcesChecked`,
`pagesFetched`, candidate counts and the error list.

When a source repeatedly fails:

1. Leave its existing published events unchanged unless an operator confirms
   cancellation or stale data.
2. Inspect the public source and current permission basis.
3. Pause the source if the layout, ownership or terms changed.
4. Fix and dry-run one exact source before re-enabling it.
5. Record the decision in the review process.

Do not increase concurrency or fetch limits merely to hide failures. See
`DISCOVERY_INGEST.md` for workflow commands and incident handling.

# UK and European event discovery architecture

## Outcome

ClassicsGo does not publish or fall back to a static event array. Public event
reads come only from reviewed, published D1 records whose primary provenance is
still active. Historical launch fixtures are withdrawn by migration `0021`, and
unreviewed seed candidates are removed without deleting operator-reviewed work.

Discovery is an ingestion and review system, not an auto-publisher:

```text
Worker schedule (every 15 minutes)
  → claim up to two due endpoints whose source is Active
  → API, feed or permitted crawl adapter (6–24 hours per endpoint)
  → combined structured-data extraction layers
  → normalization + date/geography confidence
  → exact/fuzzy/distance deduplication
  → D1 candidate + immutable provenance
  → private administrator review
  → separate explicit publication
  → public event catalogue
```

The Worker schedule is declared in `vite.config.ts` and calls
`runDiscoveryTick(2)` from `worker/index.ts`. It does not use Supabase Cron.
Leases prevent duplicate execution, failures use bounded backoff, and async
Firecrawl jobs are resumed from `discovery_runs.external_job_id` every 15
minutes instead of starting a duplicate crawl.

Both `DISCOVERY_ENABLED` and source status are enforcement points. Disabling
discovery stops provider execution globally; pausing or revoking an individual
source prevents its endpoints from running. Registering a source is not
permission to crawl it.

## Provider adapters

- **Firecrawl Search** runs one bounded, combined classic-vehicle query for an
  assigned UK or European area. Search results are filtered locally before any
  optional scrape.
- **Firecrawl Map** maps a reviewed source, rotates through the returned URLs
  with a durable cursor and scrapes only a small set of likely event/calendar
  pages.
- **Firecrawl Scrape** performs JavaScript-rendered extraction for one reviewed
  public page and requests raw HTML, links and structured event fields.
- **Firecrawl Crawl** is a depth-2, same-site, robots-aware crawl with bounded
  pages, continuation and asynchronous start/poll/resume.
- **Ticketmaster Discovery API** runs provider-appropriate current/future event
  name searches for supported UK and European markets.
- **Eventbrite** reads only the organisations explicitly authorised by the
  operator. It is not treated as a general public-event search API.
- **Google Calendar API** reads an exact public Calendar `events` endpoint only
  after organiser authorisation is recorded. It performs a bounded initial
  window followed by incremental `syncToken` updates, keeps paginated
  checkpoints, includes deleted entries and resets safely after HTTP `410`.
- **ICS** preserves local dates and times, expands recurring series to at most
  four occurrences per pass, rotates through components, uses conditional
  requests and enforces the endpoint record limit.
- **RSS/Atom** performs bounded feed parsing, conditional requests and
  same-origin structured-page enhancement for only the first five entries.

Direct HTTP adapters accept public HTTPS only, limit redirects and bytes,
enforce expected content types, and bind every redirect to the reviewed origin.
URLs containing credentials, signed access parameters, fragments, literal IPs
or local/private-style hostnames are rejected. A secret Google Calendar ICS
address is also rejected; authorised calendars must use the exact Calendar API
events endpoint without embedding an API key in the URL.

## Extraction layers

`extractStructuredEvents()` combines and deduplicates all applicable layers
instead of stopping after the first match:

1. JSON-LD `Event`, `ExhibitionEvent`, `SportsEvent`, `Festival` and
   `SaleEvent`, including nested `@graph` data.
2. Schema.org Event microdata via `microdata-node`.
3. Bounded metadata and OpenGraph extraction.
4. Provider-native structured fields where Firecrawl or a partner API supplies
   an event object.

Relative URLs are resolved against the source page and fragments are removed.
`metascraper` could not be shipped safely in this Cloudflare Worker because its
current dependency graph requires native RE2/Node Worker behaviour. The code
therefore provides a Worker-safe, bounded metadata/OpenGraph adapter in
`extractors/metascraper.ts`. The requested `jsonld-extractor` package name is
not present in the npm registry; the in-repository JSON-LD Event extractor is
strict, tested and does not execute or retain page scripts.

## UK and European query coverage

The geography inventory contains:

- 12 UK regions;
- 94 English county, Welsh preserved-area, Scottish council and Northern Irish
  county areas;
- 40 major European countries with locale, timezone and translated search terms
  where relevant.

The web inventory is 146 provider-aware queries: one combined search per area
covering classic cars, historic vehicles, autojumbles, shows, meets, rallies,
calendars and events. Sixteen Firecrawl search shards each process the default
batch of three distinct queries every six hours.

Ticketmaster has a separate 82-query inventory: two suitable event-name terms
for the UK and each of the 40 European countries. Eight Ticketmaster shards
process the default batch of three every six hours. This avoids sending
web-search syntax to the Ticketmaster API.

Under a healthy Worker and the default batch size, both provider inventories
complete a full rotation within 24 hours. The 15-minute Worker can claim up to
eight endpoints per hour, so all 24 search shards can be serviced within three
hours when due. `discovery_queries` records provider, endpoint, area, locale,
last attempt, next expected run and run count; provider failures and source
pauses can extend real-world completion time and are visible to operators.

## Source catalogue and permissions

Catalogue version 4 registers 117 entries: 92 researched source or partnership
leads plus 25 system entries (16 Firecrawl search shards, eight Ticketmaster
shards and one authorised-organisation Eventbrite entry). Google Calendar,
RSS, ICS and per-site Firecrawl endpoints are added by an administrator and are
not counted in that fixed catalogue total.

The researched catalogue spans federations, clubs, museums, circuits,
autojumbles, local-authority calendars and European organisers. It also records
competitor/directory partnership leads such as CarEvents.com and Classic Shows
UK. Every researched web source starts Pending with `manual_review`; no entry is
automatically activated. Catalogue updates preserve operator decisions and do
not reactivate a paused or revoked source.

The private source registry records the permission basis and trust decision,
supports server-side filtering and keyset pagination, and can onboard
organiser-authorised Google Calendar, RSS, ICS or permitted crawl targets.
Pausing or revoking a source withdraws linked live listings and returns their
candidates to review.

See [Competitor and source research](./COMPETITOR_AND_SOURCE_RESEARCH.md) for
the dated provider decisions and source-review policy.

## Normalization, confidence and deduplication

- `chrono-node` parses English and supported European locale dates.
- ISO alpha-2 country codes, IANA timezones, 16-character international postal
  codes and global latitude/longitude ranges are validated.
- Confidence is an explainable 0–100 score based on title, date, location,
  official URL, extraction method and source quality. The breakdown is stored
  with provenance.
- Fuse.js supplies fuzzy title similarity.
- geolib supplies distance corroboration.
- Exact external identifiers and normalized deterministic keys are checked
  first.
- Same URL/date is not enough to merge unrelated feed entries; title or venue
  corroboration is required.
- Scores of 86+ merge, 65–85 create an administrator-review match, and lower
  scores remain distinct.
- Lower-confidence observations cannot overwrite stronger pending facts.
  Reviewed/published facts are never silently replaced.
- Repeated or raced observations advance `last_seen_at` without resetting
  review state or changing an administrator compare-and-swap version.

## Cancellation and freshness handling

ICS `STATUS:CANCELLED`, JSON-LD/microdata event status, Firecrawl structured
fields and Google Calendar deleted/cancelled events all normalize to a
cancellation signal.

The signal must exactly match an existing observation by external identifier
and source URL. A matching published event is immediately withdrawn, its
candidate returns to review, and an immutable `cancellation` alert captures the
before/after states and evidence hash. Saved-event and attendance records are
preserved. An unmatched cancellation cannot withdraw an event.

A separate maintenance pass flags future published candidates not seen for 14
days with an open `stale_source` alert. Staleness is not proof of cancellation,
so it does not automatically withdraw the listing. Administrators resolve open
alerts when they approve, reject, publish or otherwise verify the candidate.
Alert evidence cannot be edited or deleted.

## Database records

- `event_source_endpoints`: adapter, reviewed URL, locale/geography, interval,
  cursor, conditional-fetch/checkpoint state, lease, failure state and next run.
- `discovery_runs`: one execution or resumable job and its counts/status.
- `discovery_findings`: incomplete or rejected findings without raw page data.
- `discovery_queries`: query coverage and run counts.
- `event_candidate_matches`: fuzzy duplicate review decisions.
- `event_sources`, `event_candidates`, `event_candidate_provenance`: controlled
  source identity, normalized event facts and immutable observation evidence.
- `event_discovery_alerts`: immutable cancellation/staleness evidence and its
  separate operator-resolution state.

No raw HTML, tracking payload, social profile, attendee list, cookie, API key or
page script is stored.

## Activation

Leave the system fail-closed until provider setup and source reviews are
complete:

```dotenv
DISCOVERY_ENABLED=false
DISCOVERY_QUERY_BATCH_SIZE=3
FIRECRAWL_API_KEY=...
TICKETMASTER_API_KEY=...
GOOGLE_CALENDAR_API_KEY=...
EVENTBRITE_TOKEN=...
EVENTBRITE_ORGANIZATION_IDS=...
```

Then:

1. Deploy every D1 migration and verify the foreign-key check.
2. Sign in to `/admin` with a verified administrator account.
3. Open **Discovery source registry**.
4. Review terms, robots rules and permission for each source; activate only
   sources that may lawfully run.
5. Add authorised Google Calendar, RSS/ICS feeds or crawl targets through the
   Pending-first onboarding form.
6. Add provider secrets through encrypted production environment settings.
7. Run a bounded canary with selected sources and inspect candidates,
   provenance, duplicate matches, cancellation/staleness alerts and errors.
8. Set `DISCOVERY_ENABLED=true` only after the canary succeeds.
9. Monitor query rotation, source errors, run counts and the private queue
   before increasing provider budgets.

## Explicit exclusions

- **Google Custom Search JSON API:** not integrated. It is closed to new
  customers and existing customers must transition by 1 January 2027.
- **Google Places:** not used as an event-ingestion source. Its content-storage,
  indexing, display and attribution rules are not suitable for the durable D1
  event/provenance catalogue. The existing geocoder remains a separately
  configured location utility.
- **Eventbrite broad discovery:** not implemented. The adapter accepts only
  explicitly authorised organisation IDs; broad public distribution requires
  Eventbrite's distribution-partner route.
- **Social scraping:** Firecrawl, proxy rotation, stealth browsers and CAPTCHA
  bypass are never used to scrape Facebook, Instagram or another access-
  controlled platform. Social events require an approved platform API,
  organiser-authorised feed/export, or a public link submitted for manual
  review.

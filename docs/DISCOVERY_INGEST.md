# Compliant event discovery and intake

This document defines the production trust boundary for machine-assisted event
discovery. The goal is broad coverage without turning unverified web content
into public listings or collecting content without permission.

The intake endpoint is a private machine-to-machine interface. It accepts only
small, normalized facts about an event, records where those facts came from,
and creates or refreshes a candidate for human review. It must never publish an
event automatically.

The same validated storage service is now used by the built-in discovery
runtime. A Cloudflare Worker trigger wakes every 15 minutes; due endpoints run
at their individually configured 6–24 hour interval. This does not use
Supabase Cron or any paid Supabase scheduling feature. `DISCOVERY_ENABLED`
defaults to false, and only sources marked Active in the private `/admin`
registry can run. See `docs/DISCOVERY_ARCHITECTURE.md` for provider, query,
deduplication and operations details.

## Architecture and trust boundaries

The expected flow is:

1. A scout reads an explicitly permitted source through its supported feed,
   API, export, or a reviewed manual process.
2. The scout reduces the result to the bounded JSON contract below. Raw pages,
   HTML, scripts, tracking data, comments, attendee lists and unrelated profile
   data are not sent or retained.
3. `POST /api/discovery/intake` authenticates the scout with a server-only
   bearer secret, validates every field, and rejects unknown fields.
4. The source registry records the source, permission basis, status and trust
   level. Candidate provenance records the exact public source URL, observation
   method, time, content hash and fields observed.
5. Idempotency and event-level deduplication prevent repeated observations from
   creating repeated review work. A later observation may refresh `last seen`
   metadata but must not silently replace reviewed event facts.
6. An authorised operator reviews the candidate in `/admin`. Review changes
   are written to the append-only audit log.
7. Publication is a separate privileged operation with stronger completeness,
   location and provenance gates. An approved candidate remains private until
   an administrator explicitly passes that gate.
8. A published listing exposes a safe source/verification cue so a visitor can
   inspect the official source and understand when it was last checked.

The public application, browser clients and third-party organisers must never
receive `DISCOVERY_INGEST_SECRET`. The intake route is not a general public
submission form; the existing organiser submission flow remains the correct
route for browser users.

## Permitted sources

Every source must have a documented lawful and contractual basis before a
scout is enabled. Platform availability is not permission. Use only the
interface and data fields allowed by the source's current terms.

| Source | Registry type | Provenance method | Required basis |
| --- | --- | --- | --- |
| Organiser-owned JSON, CSV or other feed | `organizer_feed` | `organizer_feed` | Written organiser authorisation or an explicit published licence |
| Contracted club or commercial API | `partner_api` | `partner_api` | Active partner contract and API credentials scoped to event facts |
| Organiser-provided iCalendar feed | `calendar` | `ical` | Organiser authorisation or explicit public-feed permission |
| Permitted Event JSON-LD on an official page | `structured_data` | `json_ld` | Reviewed public-web permission and compliance with site terms |
| Permitted organiser RSS/Atom feed | `structured_data` | `rss` | Reviewed public-web permission and compliance with site terms |
| Official social-platform API | `social_api` | `social_api` | Platform-approved API access for the account/data in question |
| Licensed search or event-data provider | `licensed_search` | `licensed_search` | Contract expressly allowing this collection, storage and display |
| Staff-reviewed import | `manual_import` | `manual_import` | Source and permission checked by an authorised operator |

Do not scrape Facebook, Instagram, another social network, or any website that
forbids automated collection. Do not work around login walls, CAPTCHAs, access
controls, API limitations or robots directives. Do not use a consumer account,
session cookie, residential proxy, copied search result, unofficial API or
browser automation to evade a platform's rules. A public post or event page is
not, by itself, authorisation for automated collection.

If access terms are unclear, register the source as `pending`, keep its scout
disabled, and obtain written permission or legal review. A source must be
paused immediately if its permission expires or its terms change, and set to
`revoked` when it must no longer be used.

## Source registry and provenance

`event_sources` is the control plane for discovery sources:

- `source_key` is a stable machine identifier, not a mutable display name;
- `canonical_url` is the permitted source's public HTTPS origin/page;
- `source_type` identifies the integration class;
- `permission_basis` records why collection is allowed;
- `status` is `pending`, `active`, `paused`, or `revoked`;
- `trust_level` is `unverified`, `organizer`, `partner`, or `official`.

New machine-introduced sources start pending and unverified. Changing a source
name or URL is not a way to take over an existing `source_key`; a mismatch must
be treated as a conflict and reviewed. Paused and revoked sources do not accept
new observations.

`event_candidate_provenance` keeps one normalized observation linked to both
the source and candidate. It contains only the normalized event payload and
provenance metadata. It must not contain raw HTML, arbitrary response bodies,
access tokens, cookies, private organiser contacts or attendee information.

The source URL, official URL and registry URL must be public HTTPS URLs. The
validator rejects credentials, fragments, non-standard/insecure schemes,
localhost, private addresses and literal IP addresses. An observation URL must
belong to the registered source origin.

## Authentication and secret handling

Configure one high-entropy server-only runtime binding:

```dotenv
DISCOVERY_INGEST_SECRET=replace_with_at_least_32_random_characters
```

Generate a fresh value in a trusted operator terminal, for example:

```bash
openssl rand -base64 48
```

Store the result directly in the deployment platform's encrypted environment
settings and in the scout's secret manager. Never paste it into chat, source
control, issue trackers, request URLs, analytics, client code or logs. Do not
prefix it with `NEXT_PUBLIC_`.

Each request sends:

```http
Authorization: Bearer <DISCOVERY_INGEST_SECRET>
Content-Type: application/json
```

The server fails closed when the binding is missing, too short or still a
placeholder. Authentication failures use a generic response and the comparison
is constant-time. The route is rate limited, returns `Cache-Control: no-store`,
and must not log the header or body.

### Secret rotation

The current interface uses one active secret, so use a coordinated rotation:

1. Pause scout schedules and allow in-flight requests to finish.
2. Generate a new independent secret; never derive it from the old value.
3. Replace the encrypted server runtime binding and deploy/restart the service.
4. Replace the value in every authorised scout secret manager.
5. Send one canary observation with a new idempotency key and verify its queue
   entry and provenance.
6. Resume schedules and remove the old value from every secret store.

If compromise is suspected, stop scouts, rotate the server secret first, review
recent provenance and source activity, reject/quarantine suspicious candidates,
and record the incident. Do not wait for the normal rotation window.

## Request contract

Send JSON to:

```http
POST /api/discovery/intake
```

The endpoint accepts a strict, size-bounded JSON object. Unknown keys, invalid
enums, control characters, HTML-like descriptions, impossible dates, incomplete
coordinate pairs, unsafe URLs and invalid hashes are rejected. Text is
normalized and length limited. Dates are ISO `YYYY-MM-DD`; times are 24-hour
`HH:MM`; coordinates, when known, must include both latitude and longitude.

The `contentHash` is the lowercase hexadecimal SHA-256 digest of the scout's
canonical normalized source record. It is evidence for repeated observations,
not a substitute for retaining the permitted source URL. The `idempotencyKey`
must remain stable when the scout retries the same logical observation and must
change when the source record materially changes.

Example:

```http
POST /api/discovery/intake HTTP/1.1
Host: classicsgo.com
Authorization: Bearer <server-only secret>
Content-Type: application/json

{
  "schemaVersion": 1,
  "idempotencyKey": "south-downs-club:evt-4821:2026-07-19T09:15Z",
  "source": {
    "key": "south-downs-club-events",
    "name": "South Downs Classic Car Club",
    "type": "organizer_feed",
    "canonicalUrl": "https://southdownsclassicclub.org.uk/events",
    "permissionBasis": "organizer_authorized"
  },
  "candidate": {
    "title": "South Downs Classics at the Green",
    "description": "A public display of classic and historic vehicles.",
    "organiserName": "South Downs Classic Car Club",
    "venue": "The Village Green",
    "town": "Lewes",
    "postcode": "BN7 2QS",
    "startDate": "2026-09-13",
    "startTime": "10:00",
    "category": "Show",
    "officialUrl": "https://southdownsclassicclub.org.uk/events/classics-at-the-green",
    "price": "Free",
    "latitude": 50.873,
    "longitude": 0.009
  },
  "provenance": {
    "sourceUrl": "https://southdownsclassicclub.org.uk/events/classics-at-the-green",
    "externalId": "evt-4821",
    "contentHash": "0d6f2c9d3c87b327eb8c55931519a21c0e14b7a646ba9d3100edec5e24ad2a0d",
    "method": "organizer_feed",
    "confidence": 96,
    "observedFields": [
      "title",
      "description",
      "organiserName",
      "venue",
      "town",
      "postcode",
      "startDate",
      "startTime",
      "category",
      "officialUrl",
      "price",
      "latitude",
      "longitude"
    ]
  }
}
```

Do not invent missing facts to satisfy the contract. Omit optional facts the
source does not state. Confidence measures extraction certainty, not popularity
or source trust, and it never bypasses review.

### Success responses

A new observation returns HTTP `201`:

```json
{
  "ok": true,
  "data": {
    "candidateId": "candidate_opaque_id",
    "reference": "DSC-1A2B3C",
    "status": "pending",
    "idempotent": false
  }
}
```

An idempotent retry returns HTTP `200` with the same candidate identity and
`"idempotent": true`. The response confirms intake only; it never confirms a
public listing.

Expected failure classes include:

- `400` for a malformed or contract-invalid observation;
- `401` for missing or invalid bearer authentication;
- `409` for a conflicting source identity or a source that cannot ingest;
- `413` for a body over the configured byte limit;
- `415` for a non-JSON request;
- `429` when the machine or connection rate limit is exceeded;
- `503` when the intake secret or required runtime service is unavailable.

Clients should retry only `429` and transient `5xx` responses, using bounded
exponential backoff with jitter and the same idempotency key. Do not retry a
validation, authentication, permission or source-conflict error blindly.

## Idempotency and deduplication

There are two independent controls:

- the server hashes the source-scoped `idempotencyKey`, so a network retry of
  the same observation returns the existing result;
- the server derives a normalized event dedupe key from stable event facts, so
  the same local event found through multiple permitted sources is one review
  candidate with multiple provenance observations.

The database also prevents duplicate source/candidate/URL/content-hash
observations. Scouts must not randomize idempotency keys on retry. Conversely,
they must not reuse one key for a materially different observation.

Deduplication is deliberately conservative. Operators should compare dates,
venue, organiser and official links before merging similarly named events. Do
not discard conflicting provenance; retain it for review and prefer the official
organiser source when resolving facts.

## Human review

All ingested candidates begin as `pending` with review required. An allowlisted,
authenticated administrator may move a candidate through:

- `pending` — received but not assessed;
- `reviewing` — assigned or under investigation;
- `approved` — editorially acceptable, but still private;
- `rejected` — unsuitable, unsupported, duplicate or not permitted;
- `published` — created by the separate publication gate and linked to the
  resulting public event.

Reviewers must open the recorded source URL and verify, at minimum:

- the source remains permitted and its registry identity has not changed;
- the event is public, relevant and in the future;
- title, organiser, date/time and venue match the source;
- official/source links are public HTTPS pages and are still live;
- contradictory observations and potential duplicates are resolved;
- the description contains concise event facts, not copied promotional prose;
- no personal/private data, attendee list or unsupported claim is present;
- coordinates match the stated venue and are not merely a town centroid when a
  precise pin is claimed.

Every fact, candidate status, assignment or internal-note change creates an
append-only `event_candidate_review_audit` row containing the actor, reviewed
source, changed-field list and before/after normalized-fact hashes. Source
status/trust transitions and their exact reason are preserved separately in
`event_source_review_audit`; manual public-event withdrawal reasons are
preserved in `event_withdrawal_audit`. These audit rows cannot be updated and
are retained for at least 365 days. Internal notes must remain factual and must
not contain secrets, payment details or unnecessary personal information.

## Approval is not publication

`approved` means an editor accepts the candidate for further processing. It
does not insert into `motoring_events`, expose the candidate through the public
events API, include it in search or sitemap output, send alerts, or allow members
to save/attend it.

The production Publish action stays disabled until it can enforce all of these
conditions atomically:

1. The operator is authenticated, allowlisted, recently revalidated, and the
   mutation passes same-origin and CSRF checks.
2. The candidate is `approved`, has no newer unreviewed observation, and the
   reviewed version has not changed.
3. Its source is active, its permission basis is current, and at least one
   provenance observation has been checked recently.
4. Every public field passes the production event schema; required dates,
   venue, town, category, official URL and description are complete.
5. A valid UK or European postal code, ISO country, IANA timezone and matching
   latitude/longitude pair have been entered
   through the bounded admin editor and checked against the venue.
6. Duplicate public events are checked immediately before insertion.
7. The transaction creates the public event, creates a primary
   `motoring_event_provenance` record, links `published_event_id`, changes the
   candidate to `published`, and writes a `candidate_published` audit record.
8. Any failed step rolls the whole operation back.

There must be no machine-ingest parameter, admin status shortcut or direct
database job that bypasses this gate.

## Public provenance cue

Each published event keeps a provenance record containing the reviewed source,
last-checked time and one verification label:

- `curated` — entered or reviewed by the editorial team;
- `source_checked` — checked against the linked public source;
- `organizer_verified` — confirmed by the event organiser;
- `partner_verified` — confirmed through an authorised partner feed.

The events API/UI exposes `sourceUrl`, `sourceLastCheckedAt` and
`sourceVerification`; the public `sourceUrl` is always the separately validated
official event page. Raw feed/API/licensed-search locators remain private even
when they supplied provenance. Never expose source-registry notes, contracts,
private contacts, credentials, internal confidence scores or review/audit data.

Administrators can explicitly set the displayed source to pending, active,
paused or revoked and record its trust level. The action requires a bounded
reason and writes a separate immutable source-transition audit. Paused/revoked
sources cannot ingest new observations or publish candidates; every linked live
event is withdrawn and its candidate is returned to review in the same batch.

The audited Withdraw action requires a reason, immediately changes the public
event to a non-public status, and returns the candidate to review while keeping
provenance and history. After corrections and a fresh approval, Publish updates
and restores that deterministic event record instead of creating a duplicate.
When a new observation flags an event that is still live, the same editor can
review or correct the normalized facts and use Apply reviewed live update; the
candidate, public row and primary provenance timestamp are synchronized in one
audited batch, and a database guard rejects a partial acknowledgement.

The cue communicates provenance, not a guarantee that an event will proceed.
Visitors should still be told to check the official source before travelling.

## Operational runbook

### Onboard a source

1. Identify the source owner and supported integration method.
2. Record the permission evidence, permitted fields, purpose, geographic scope,
   retention, rate limits, attribution requirements and expiry/review date in
   the controlled operations record.
3. Check platform/site terms, robots policy where applicable, copyright and
   data-protection requirements. Escalate ambiguity instead of assuming access.
4. Create the source as `pending` and `unverified`; keep its schedule disabled.
5. Test against fixtures and a very small permitted sample. Confirm the scout
   emits normalized facts only and no HTML or personal/social-engagement data.
6. Review a canary candidate and its provenance end to end.
7. Activate the source and set the appropriate trust level only after approval.

### Run scouts safely

- Use official feed/API authentication and a truthful identifying user agent.
- Honour documented rate limits, conditional requests, backoff and deletion or
  correction signals.
- Restrict egress to the reviewed source host and restrict the scout credential
  to intake only.
- Keep fetch/extraction logs short-lived and sanitized. Log opaque source keys,
  outcome codes, counts and timings, not secrets or full payloads.
- Bound pages, records, runtime and retry count per run. A scout must fail closed
  on redirects to an unapproved origin or on an unexpected response type.
- Stop the run if a source returns an authentication wall, CAPTCHA, terms
  warning, robots denial or materially changed schema.

### Daily checks

- Review intake `401`, `409`, `429` and `5xx` rates without logging request
  bodies or authorization values.
- Triage new and high-confidence candidates; investigate sudden volume spikes.
- Check for stalled scouts, repeated retries and unexpected new source keys.
- Recheck events that are imminent or whose source now returns a cancellation.

### Weekly/monthly checks

- Review pending/reviewing age, duplicate rate, rejection reasons and source
  yield. Low quality is a reason to pause a source, not to lower review gates.
- Reconfirm source permissions and API terms on the recorded schedule.
- Verify paused/revoked sources cannot ingest and remove their schedules/keys.
- Test audit immutability, migration/foreign-key health, backups and restoration
  in a non-production environment.
- Sample published listings for live source links, accurate last-checked times,
  correct verification labels and geocodes.
- Prune only data whose documented retention period has expired; never edit an
  audit record to make it eligible.

### Correct, cancel or remove an event

1. Verify the report against an official source or the organiser.
2. Update or withdraw the public listing through the controlled editorial path.
3. Preserve the provenance and append a new audit action; do not rewrite history.
4. Prevent stale scout observations from immediately recreating a removed event
   by pausing the source or recording the appropriate rejection/suppression.
5. If collection was not permitted, stop the integration, quarantine affected
   candidates/listings, notify the responsible operator and follow the incident
   and legal-review process.

### Incident response

For a leaked secret, unauthorized source, ingestion flood or corrupted scout:

1. Pause the affected scout/source and, for credential exposure, rotate the
   intake secret immediately.
2. Preserve sanitized request metadata and append-only audit evidence.
3. Identify affected candidates and published events through source/provenance
   links; do not rely on title searches alone.
4. Quarantine or correct affected records through reviewed operations.
5. Check whether personal data, contractual data or copyrighted content was
   collected and invoke the appropriate breach/legal process.
6. Fix the control, test with fixtures and a canary, then obtain operator
   approval before reactivation.

## Production launch checklist

- Apply and verify all discovery/provenance migrations and database constraints.
- Set `DISCOVERY_INGEST_SECRET` only in encrypted server/scout secret stores.
- Confirm missing, placeholder and wrong secrets all fail closed.
- Confirm oversized JSON, unknown fields, raw HTML, unsafe URLs and private IPs
  are rejected.
- Confirm identical retries return one observation/candidate.
- Confirm multiple permitted sources can add provenance without auto-publishing.
- Confirm paused/revoked sources cannot add observations.
- Confirm only allowlisted administrators can view or change discovery reviews.
- Confirm review audit rows cannot be updated or prematurely deleted.
- Confirm `approved` candidates are absent from all public APIs, pages, sitemaps,
  alerts, saved-event lists and attendance counts.
- Confirm new publication, withdrawal and corrected-event restoration all pass
  their optimistic-concurrency and transactional preconditions.
- Confirm published test data exposes only the safe provenance cue.
- Configure alerts for sustained intake failures, queue backlog and source drift.
- Complete a documented rollback, restore and secret-rotation rehearsal.

This pipeline improves coverage by combining small organiser and club sources
with larger partners while keeping permission, review and provenance explicit.
It is not authority to collect every event visible on the public internet.

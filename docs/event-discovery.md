# ClassicsGo event discovery

The production discovery runner is a bounded GitHub Actions job. It runs daily at 03:17 UTC, on manual dispatch, and once after a discovery-pipeline change reaches `main`. It does not use Supabase Cron or Vercel Cron.

## Trust boundary

The workflow requests a short-lived GitHub OIDC token with audience `classicsgo-ingest`. The `ingest-events` Supabase Edge Function verifies the issuer, audience, repository owner ID, repository, workflow file, event type and `refs/heads/main` before returning source configuration or accepting a batch. There is no Supabase secret in GitHub or Vercel. The Edge Function reads Supabase's built-in `SUPABASE_SECRET_KEYS` dictionary and sends the selected secret on the `apikey` header only.

For production runs, the runner first requests the active source catalogue through that authenticated Edge endpoint. Administrator changes to source URL, format, frequency, review status or active status therefore take effect on the next run. A local dry-run requires one explicitly supplied public `DISCOVERY_SOURCE_URL`; it does not request GitHub OIDC and cannot write production data.

## Discovery layers

- Live UK-wide and European official source catalogue
- Bounded, robots-aware same-origin link traversal
- Schema.org JSON-LD Event extraction with a conservative OpenGraph/HTML fallback
- Multilingual calendar-date parsing for the supported UK and European month names
- Exact UI taxonomy normalisation and server-side duplicate detection
- Strict response-size, redirect, source, page and concurrency limits
- DNS resolution checks that reject private, link-local, reserved and documentation addresses, plus redirects restricted to the source host (allowing only the usual `www` alias)

Search-only sources such as public Facebook and Eventbrite listings require review unless independent sources corroborate the event. The crawler never logs in, reads private content, or bypasses a site's robots policy.

## Resource limits

The scheduled run covers the active registry with bounded concurrency and detail-page limits. It sends candidates in batches of 40, stores at most a 1,000-character raw excerpt and records source health even when a crawl finds no candidates. If post-start ingestion fails, the runner makes a best-effort final call that marks the run failed instead of leaving it indefinitely in progress.

## Local validation

```sh
npm run test:discovery
DISCOVERY_DRY_RUN=true \
DISCOVERY_SOURCE_URL=https://www.britishmotormuseum.co.uk/whats-on \
DISCOVERY_SOURCE_NAME="British Motor Museum" \
DISCOVERY_DETAIL_LIMIT=2 npm run discover
```

The non-dry runner intentionally works only inside the trusted GitHub workflow because it needs the GitHub OIDC request environment.

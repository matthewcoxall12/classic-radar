# Discovery ingestion operations

## Production flow

The trusted workflow is `.github/workflows/discover-events.yml`. It checks out
`main`, uses the pinned Node release, validates the discovery script and sends
review candidates to:

```text
https://rnayhhsurmztrohtftqo.supabase.co/functions/v1/ingest-events
```

Authentication uses a short-lived GitHub OIDC token. There is no long-lived
`DISCOVERY_INGEST_SECRET` to configure in Vercel or GitHub.

The Supabase function must have its database admin key in Supabase Function
secrets. Prefer `SUPABASE_SECRET_KEYS` with a current `sb_secret_` value;
`SUPABASE_SERVICE_ROLE_KEY` exists only as a temporary legacy fallback. Never
put either value in GitHub Actions, Vercel client variables or source control.

## Manual runs

Use **GitHub -> Actions -> Discover classic-car events -> Run workflow**.

- `source_limit` caps the number of registered sources.
- `source_key` targets one exact registered source.
- `dry_run=true` scans without writing candidates.

Start with one exact source. Inspect the workflow log and source page before a
wider run. A non-dry run records a start row, writes bounded candidate/source
batches and always attempts to record a finish summary.

For a local extraction-only check, provide an explicit public URL and keep dry
run enabled:

```bash
DISCOVERY_DRY_RUN=true \
DISCOVERY_SOURCE_URL=https://example.org/events \
DISCOVERY_SOURCE_KEY=example-events \
DISCOVERY_SOURCE_NAME='Example events' \
npm run test:discovery

DISCOVERY_DRY_RUN=true \
DISCOVERY_SOURCE_URL=https://example.org/events \
DISCOVERY_SOURCE_KEY=example-events \
node scripts/discover-events.mjs
```

Local non-dry runs fail because GitHub's OIDC environment is intentionally not
available.

## Expected results

The workflow log reports selected sources, pages fetched, candidates found and
per-source errors. The Edge Function records `agent_runs` and places new or
changed findings in the private review queue. No ingestion response represents
publication.

Treat these as failures requiring investigation:

- OIDC issuer, audience, repository, workflow or ref rejection;
- every selected source failing;
- an Edge Function `5xx` or database error;
- a run that starts but never records a finish state;
- a sudden zero-result run across normally productive sources; or
- unexpected growth in duplicate/review counts.

## Safe recovery

1. Keep public events unchanged while the ingestion path is investigated.
2. Inspect the failed GitHub job and the matching Supabase Function log.
3. Confirm the workflow ran from `main` and was not edited or dispatched from a
   different ref.
4. Confirm Function secrets exist without printing their values.
5. Run one known source with `dry_run=true`.
6. Run the same source non-dry and confirm a complete `agent_runs` record.
7. Resume a bounded batch before the full schedule.

Do not disable OIDC claim checks, expose a service key to GitHub, or make the
Edge Function anonymous as a recovery shortcut.

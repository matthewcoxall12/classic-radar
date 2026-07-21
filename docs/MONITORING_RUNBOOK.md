# Production monitoring and incident runbook

This baseline uses services already attached to the project: Vercel runtime
logs, Supabase logs/status and GitHub Actions. It does not require a paid
monitoring vendor.

## Automated checks

`.github/workflows/uptime-monitor.yml` runs four times an hour on the default
branch and checks:

- `/api/health` — canonical production configuration, auth-hash pepper and a
  read against the Supabase `events` table;
- `/` and `/sign-in` — successful branded page rendering; and
- `/api/events?limit=1` — a valid public event API response.

Before DNS cutover it monitors `https://classic-radar.vercel.app`. After the
domain moves, set the repository variable `CLASSICSGO_MONITOR_URL` to
`https://classicsgo.com`; no workflow or secret change is required.

The repository owner must enable GitHub Actions failure notifications. Run the
workflow manually once after production deployment and once after DNS cutover.
Scheduled workflows can be delayed, so this is a practical beta baseline, not a
real-time SLA.

The health response reveals no secret values or database error. Its Vercel log
entry includes only a request ID, duration and bounded reason code.

## Routine review

Daily during beta:

- check failed uptime/discovery Actions;
- check Vercel runtime errors and unusual `5xx` volume;
- check Supabase Auth, database and Edge Function errors;
- inspect incomplete `agent_runs` and repeated source failures; and
- confirm current published-event count is plausible.

Weekly:

- review dependency and Dependabot alerts;
- confirm backup/PITR capability appropriate to the active Supabase plan;
- review admin access and Google/Supabase/Vercel account MFA;
- test one real location search and Google sign-in/logout; and
- review expiring events, stale sources and unresolved review items.

## Severity

- **SEV-1:** site unavailable, authentication bypass, suspected credential/data
  exposure, destructive database behaviour.
- **SEV-2:** login, location search or core event search broadly broken; account
  export/deletion failing; material data is stale or incorrect.
- **SEV-3:** one source/integration fails, non-core UI regression, delayed
  discovery with the public catalogue still usable.

## Response

1. Record UTC start time, visible symptom, affected route and release SHA.
2. Check the uptime job, Vercel deployment/runtime logs and Supabase service
   status/logs. Do not paste tokens, cookies or callback URLs into the record.
3. For a deployment regression, roll back to the recorded previous known-good
   Vercel production deployment. Do not rebuild an old commit and assume it is
   identical.
4. For a discovery problem, stop or pause the affected source/workflow; do not
   remove reviewed public events automatically.
5. For suspected credential exposure, disable the affected integration, rotate
   the provider secret in its dashboard and redeploy. Review access/audit logs.
6. For suspected personal-data exposure, preserve evidence, restrict access and
   follow the UK breach-assessment/notification process.
7. Re-run health, event search, Google auth and account lifecycle checks before
   declaring recovery.
8. Record cause, impact, recovery, follow-up owner and due date.

## Rollback limits

Vercel rollback changes application code, not Supabase schema. Database
migrations are forward-only: use a reviewed corrective migration. Before a
schema change, document compatibility with both the current and immediately
previous application deployment.

DNS should not be changed during an ordinary application rollback unless the
Vercel platform/domain itself is the confirmed cause.

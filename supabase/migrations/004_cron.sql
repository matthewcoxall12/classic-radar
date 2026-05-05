create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace the project ref and AGENT_SECRET before running, or configure these in the Supabase dashboard.
-- Supabase pg_cron commonly evaluates schedules in UTC. For exact UK wall-clock time across BST/GMT,
-- prefer the dashboard scheduler with Europe/London timezone support where available, or adjust seasonally.

select cron.schedule(
  'classic-radar-agent-morning',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/event-discovery-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-secret', 'YOUR_AGENT_SECRET'),
    body := jsonb_build_object('runType', 'morning_broad', 'triggeredBy', 'cron')
  );
  $$
);

select cron.schedule(
  'classic-radar-agent-midday',
  '0 14 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/event-discovery-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-secret', 'YOUR_AGENT_SECRET'),
    body := jsonb_build_object('runType', 'midday_near_term', 'triggeredBy', 'cron')
  );
  $$
);

select cron.schedule(
  'classic-radar-agent-evening',
  '0 21 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/event-discovery-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-secret', 'YOUR_AGENT_SECRET'),
    body := jsonb_build_object('runType', 'evening_social', 'triggeredBy', 'cron')
  );
  $$
);

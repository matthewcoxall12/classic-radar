-- ClassicsGo production schema.
-- No event rows are seeded: every public event must come from a reviewed
-- submission or the authenticated discovery pipeline.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Supabase may grant function execution to API roles through default
-- privileges. Future functions must be explicitly exposed instead.
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  tier text not null default 'free' check (tier in ('free', 'roadbook')),
  home_location text,
  home_postcode text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  home_radius_miles integer not null default 50 check (home_radius_miles between 5 and 250),
  digest_frequency text not null default 'weekly' check (digest_frequency in ('off', 'daily', 'weekly')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  slug text not null unique,
  dedupe_key text not null unique,
  description text not null default '',
  event_type text not null,
  start_date date not null,
  start_time time,
  end_date date,
  end_time time,
  timezone text not null default 'Europe/London',
  venue_name text,
  address text,
  town text,
  county text,
  country_code text not null default 'GB' check (char_length(country_code) = 2),
  postcode text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  price_text text,
  booking_required boolean not null default false,
  booking_url text,
  organiser_name text,
  organiser_url text,
  image_url text,
  status text not null default 'review' check (status in ('draft', 'review', 'published', 'rejected', 'expired', 'cancelled')),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  is_verified boolean not null default false,
  source_count integer not null default 0 check (source_count >= 0),
  going_count integer not null default 0 check (going_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists events_public_date_idx on public.events(status, start_date);
create index if not exists events_country_date_idx on public.events(country_code, start_date);
create index if not exists events_type_date_idx on public.events(event_type, start_date);
create index if not exists events_location_idx on public.events(country_code, county, town);
create index if not exists events_coordinates_idx on public.events(latitude, longitude) where latitude is not null and longitude is not null;
create index if not exists events_title_trgm_idx on public.events using gin (title extensions.gin_trgm_ops) where status = 'published';
create index if not exists events_town_trgm_idx on public.events using gin (town extensions.gin_trgm_ops) where status = 'published' and town is not null;
create index if not exists events_county_trgm_idx on public.events using gin (county extensions.gin_trgm_ops) where status = 'published' and county is not null;

create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  source_url text not null,
  canonical_url text not null,
  source_title text,
  source_type text not null,
  provider text not null default 'direct',
  raw_excerpt text,
  content_hash text,
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(event_id, canonical_url)
);

create index if not exists event_sources_event_idx on public.event_sources(event_id, last_seen_at desc);
create index if not exists event_sources_url_idx on public.event_sources(canonical_url);

create table if not exists public.event_observations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  source_url text not null,
  provider text not null,
  content_hash text not null,
  extracted_event jsonb not null,
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  observed_at timestamptz not null default now(),
  unique(source_url, content_hash)
);

create index if not exists event_observations_event_idx on public.event_observations(event_id, observed_at desc);

create table if not exists public.saved_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  reminder_preference text not null default 'none' check (reminder_preference in ('none', 'day_before', 'week_before')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists saved_events_user_date_idx on public.saved_events(user_id, created_at desc);
create index if not exists saved_events_event_idx on public.saved_events(event_id);

create table if not exists public.event_attendance (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists event_attendance_event_idx on public.event_attendance(event_id);

create table if not exists public.user_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 3 and 180),
  event_url text,
  event_date text,
  location_text text not null default '',
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'merged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_submissions_owner_idx on public.user_submissions(submitted_by, created_at desc);
create index if not exists user_submissions_status_idx on public.user_submissions(status, created_at);

create table if not exists public.member_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  place_name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_miles integer not null default 50 check (radius_miles between 5 and 250),
  is_home boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists member_locations_one_home_idx on public.member_locations(user_id) where is_home;
create index if not exists member_locations_owner_idx on public.member_locations(user_id, created_at);

create table if not exists public.member_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  make text not null default '',
  model text not null default '',
  year integer check (year is null or year between 1885 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_vehicles_owner_idx on public.member_vehicles(user_id, created_at);

create table if not exists public.roadbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  share_token uuid not null default gen_random_uuid() unique,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists roadbooks_owner_idx on public.roadbooks(user_id, created_at desc);

create table if not exists public.roadbook_events (
  roadbook_id uuid not null references public.roadbooks(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  position integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  primary key (roadbook_id, event_id)
);

create index if not exists roadbook_events_event_idx on public.roadbook_events(event_id);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location_id uuid references public.member_locations(id) on delete set null,
  event_type text,
  marque text,
  radius_miles integer not null default 50 check (radius_miles between 5 and 250),
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_rules_owner_idx on public.alert_rules(user_id, enabled);
create index if not exists alert_rules_location_idx on public.alert_rules(location_id) where location_id is not null;

create table if not exists public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  title text not null,
  body text not null,
  dedupe_key text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

create index if not exists member_notifications_inbox_idx on public.member_notifications(user_id, is_read, created_at desc);
create index if not exists member_notifications_event_idx on public.member_notifications(event_id) where event_id is not null;

create table if not exists public.source_registry (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  domain text not null,
  start_url text not null,
  source_type text not null,
  format_hint text not null default 'html' check (format_hint in ('html', 'rss', 'ics', 'sitemap', 'search')),
  country_code text not null default 'GB' check (char_length(country_code) = 2),
  region text,
  priority_weight integer not null default 50 check (priority_weight between 0 and 100),
  crawl_frequency text not null default 'daily' check (crawl_frequency in ('six_hourly', 'daily', 'weekly')),
  requires_review boolean not null default false,
  is_active boolean not null default true,
  notes text not null default '',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists source_registry_schedule_idx on public.source_registry(is_active, crawl_frequency, priority_weight desc);
create index if not exists source_registry_domain_idx on public.source_registry(domain);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  trigger_source text not null default 'github_actions',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  sources_checked integer not null default 0,
  pages_fetched integer not null default 0,
  searches_performed integer not null default 0,
  results_found integer not null default 0,
  candidates_found integer not null default 0,
  events_created integer not null default 0,
  events_updated integer not null default 0,
  review_queue_created integer not null default 0,
  duplicates_found integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  notes text
);

create index if not exists agent_runs_started_idx on public.agent_runs(started_at desc);

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  proposed_event jsonb not null,
  source_url text not null,
  reason text not null,
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'merged')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_queue_status_idx on public.review_queue(status, created_at);
create index if not exists review_queue_reviewer_idx on public.review_queue(reviewed_by) where reviewed_by is not null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function private.has_roadbook()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (
      select p.tier = 'roadbook' or p.is_admin
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), ''),
    lower(coalesce(new.email, '')) in ('matthewcoxall@classicsgo.com', 'matthewcoxall@googlemail.com')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.refresh_going_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.events
    set going_count = going_count + 1
    where id = new.event_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.events
    set going_count = greatest(going_count - 1, 0)
    where id = old.event_id;
    return old;
  end if;

  raise exception 'Unsupported operation % for refresh_going_count', tg_op;
end;
$$;

create or replace function private.enforce_submission_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  recent_submission_count integer;
begin
  if requesting_user_id is null or new.submitted_by <> requesting_user_id then
    raise exception 'A submission must belong to the authenticated user'
      using errcode = '42501';
  end if;

  -- Serialize the count-and-insert path per user so concurrent requests cannot
  -- all pass the rolling-window check together.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.submitted_by::text, 784113)
  );

  select count(*)::integer
  into recent_submission_count
  from public.user_submissions s
  where s.submitted_by = new.submitted_by
    and s.created_at >= pg_catalog.now() - interval '24 hours';

  if recent_submission_count >= 10 then
    raise exception 'Submission limit reached; try again later'
      using errcode = 'P0001';
  end if;

  new.status := 'pending';
  return new;
end;
$$;

create or replace function public.events_nearby(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles double precision,
  p_limit integer default 200
)
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  event_type text,
  start_date date,
  start_time time,
  end_date date,
  end_time time,
  timezone text,
  venue_name text,
  address text,
  town text,
  county text,
  country_code text,
  postcode text,
  latitude double precision,
  longitude double precision,
  price_text text,
  booking_required boolean,
  booking_url text,
  organiser_name text,
  organiser_url text,
  image_url text,
  is_verified boolean,
  source_count integer,
  going_count integer,
  distance_miles double precision
)
language sql
security invoker
set search_path = ''
stable
as $$
  with params as (
    select
      p_latitude as latitude,
      p_longitude as longitude,
      least(greatest(coalesce(p_radius_miles, 50.0), 1.0), 250.0) as radius_miles,
      least(greatest(coalesce(p_limit, 200), 1), 200) as result_limit
  ),
  bounded as (
    select
      e.*,
      p.radius_miles,
      2.0 * 3958.7613 * asin(
        sqrt(
          least(
            1.0,
            power(sin(radians(e.latitude - p.latitude) / 2.0), 2.0)
            + cos(radians(p.latitude))
              * cos(radians(e.latitude))
              * power(sin(radians(e.longitude - p.longitude) / 2.0), 2.0)
          )
        )
      ) as distance_miles
    from public.events e
    cross join params p
    where p.latitude between -90.0 and 90.0
      and p.longitude between -180.0 and 180.0
      and e.status = 'published'
      and coalesce(e.end_date, e.start_date) >= current_date
      and e.latitude is not null
      and e.longitude is not null
      and e.latitude between
        p.latitude - (p.radius_miles / 69.0)
        and p.latitude + (p.radius_miles / 69.0)
      and e.longitude between
        p.longitude - least(180.0, p.radius_miles / greatest(0.000001, 69.172 * abs(cos(radians(p.latitude)))))
        and p.longitude + least(180.0, p.radius_miles / greatest(0.000001, 69.172 * abs(cos(radians(p.latitude)))))
  )
  select
    b.id,
    b.title,
    b.slug,
    b.description,
    b.event_type,
    b.start_date,
    b.start_time,
    b.end_date,
    b.end_time,
    b.timezone,
    b.venue_name,
    b.address,
    b.town,
    b.county,
    b.country_code,
    b.postcode,
    b.latitude,
    b.longitude,
    b.price_text,
    b.booking_required,
    b.booking_url,
    b.organiser_name,
    b.organiser_url,
    b.image_url,
    b.is_verified,
    b.source_count,
    b.going_count,
    b.distance_miles
  from bounded b
  where b.distance_miles <= b.radius_miles
  order by b.distance_miles, b.start_date, b.start_time nulls last, b.title
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

-- Shared roadbooks are deliberately exposed through a high-entropy token rather
-- than table SELECT policies. An is_shared policy would allow callers to list
-- every shared roadbook through the Data API.
create or replace function public.get_shared_roadbook(p_share_token uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  shared_roadbook jsonb;
begin
  -- The setting is transaction-local, so pooled connections cannot leak it to
  -- another request. RLS below binds all shared-row reads to this exact token.
  perform pg_catalog.set_config('classicsgo.share_token', p_share_token::text, true);

  select jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'description', r.description,
      'created_at', r.created_at,
      'events', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', e.id,
              'title', e.title,
              'slug', e.slug,
              'description', e.description,
              'event_type', e.event_type,
              'start_date', e.start_date,
              'start_time', e.start_time,
              'end_date', e.end_date,
              'end_time', e.end_time,
              'timezone', e.timezone,
              'venue_name', e.venue_name,
              'address', e.address,
              'town', e.town,
              'county', e.county,
              'country_code', e.country_code,
              'postcode', e.postcode,
              'latitude', e.latitude,
              'longitude', e.longitude,
              'price_text', e.price_text,
              'booking_required', e.booking_required,
              'booking_url', e.booking_url,
              'organiser_name', e.organiser_name,
              'organiser_url', e.organiser_url,
              'image_url', e.image_url,
              'going_count', e.going_count,
              'position', re.position
            ) order by re.position, e.start_date, e.start_time nulls last
          )
          from public.roadbook_events re
          join public.events e on e.id = re.event_id
          where re.roadbook_id = r.id
            and e.status = 'published'
        ),
        '[]'::jsonb
      )
    )
  into shared_roadbook
  from public.roadbooks r
  where r.share_token = p_share_token
    and r.is_shared
  limit 1;

  return shared_roadbook;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.refresh_going_count() from public, anon, authenticated;
revoke all on function private.enforce_submission_rate_limit() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.has_roadbook() from public, anon, authenticated;
revoke all on function public.events_nearby(double precision, double precision, double precision, integer) from public, anon, authenticated;
revoke all on function public.get_shared_roadbook(uuid) from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_roadbook() to authenticated;
grant execute on function public.events_nearby(double precision, double precision, double precision, integer) to anon, authenticated;
grant execute on function public.get_shared_roadbook(uuid) to anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'events', 'user_submissions', 'member_locations', 'member_vehicles',
    'roadbooks', 'alert_rules', 'source_registry', 'review_queue'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name, table_name);
  end loop;
end $$;

drop trigger if exists event_attendance_count_insert on public.event_attendance;
create trigger event_attendance_count_insert
after insert on public.event_attendance
for each row execute function private.refresh_going_count();

drop trigger if exists event_attendance_count_delete on public.event_attendance;
create trigger event_attendance_count_delete
after delete on public.event_attendance
for each row execute function private.refresh_going_count();

drop trigger if exists user_submissions_rate_limit on public.user_submissions;
create trigger user_submissions_rate_limit
before insert on public.user_submissions
for each row execute function private.enforce_submission_rate_limit();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_sources enable row level security;
alter table public.event_observations enable row level security;
alter table public.saved_events enable row level security;
alter table public.event_attendance enable row level security;
alter table public.user_submissions enable row level security;
alter table public.member_locations enable row level security;
alter table public.member_vehicles enable row level security;
alter table public.roadbooks enable row level security;
alter table public.roadbook_events enable row level security;
alter table public.alert_rules enable row level security;
alter table public.member_notifications enable row level security;
alter table public.source_registry enable row level security;
alter table public.agent_runs enable row level security;
alter table public.review_queue enable row level security;

create policy "profiles_read_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "profiles_admin_read" on public.profiles for select to authenticated
using ((select private.is_admin()));
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "events_public_read" on public.events for select to anon, authenticated
using (status = 'published');
create policy "events_admin_manage" on public.events for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "event_sources_public_read" on public.event_sources for select to anon, authenticated
using (exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
create policy "event_sources_admin_manage" on public.event_sources for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "event_observations_admin" on public.event_observations for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "saved_events_own" on public.saved_events for all to authenticated
using ((select auth.uid()) = user_id and (select private.has_roadbook()))
with check (
  (select auth.uid()) = user_id
  and (select private.has_roadbook())
  and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
);
create policy "event_attendance_own" on public.event_attendance for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
);

create policy "submissions_insert_own" on public.user_submissions for insert to authenticated
with check ((select auth.uid()) = submitted_by and status = 'pending');
create policy "submissions_read_own" on public.user_submissions for select to authenticated
using ((select auth.uid()) = submitted_by);
create policy "submissions_admin_read" on public.user_submissions for select to authenticated
using ((select private.is_admin()));
create policy "submissions_admin_update" on public.user_submissions for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "submissions_admin_delete" on public.user_submissions for delete to authenticated
using ((select private.is_admin()));

create policy "member_locations_own" on public.member_locations for all to authenticated
using ((select auth.uid()) = user_id and (select private.has_roadbook()))
with check ((select auth.uid()) = user_id and (select private.has_roadbook()));
create policy "member_vehicles_own" on public.member_vehicles for all to authenticated
using ((select auth.uid()) = user_id and (select private.has_roadbook()))
with check ((select auth.uid()) = user_id and (select private.has_roadbook()));
create policy "roadbooks_paid_own" on public.roadbooks for all to authenticated
using ((select auth.uid()) = user_id and (select private.has_roadbook()))
with check ((select auth.uid()) = user_id and (select private.has_roadbook()));
create policy "roadbooks_share_token_read" on public.roadbooks for select to anon, authenticated
using (
  is_shared
  and share_token::text = nullif(pg_catalog.current_setting('classicsgo.share_token', true), '')
);
create policy "roadbook_events_owner" on public.roadbook_events for all to authenticated
using (exists (select 1 from public.roadbooks r where r.id = roadbook_id and r.user_id = (select auth.uid()) and (select private.has_roadbook())))
with check (
  exists (select 1 from public.roadbooks r where r.id = roadbook_id and r.user_id = (select auth.uid()) and (select private.has_roadbook()))
  and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
);
create policy "roadbook_events_share_token_read" on public.roadbook_events for select to anon, authenticated
using (
  exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.is_shared
      and r.share_token::text = nullif(pg_catalog.current_setting('classicsgo.share_token', true), '')
  )
);
create policy "alert_rules_paid_own" on public.alert_rules for all to authenticated
using ((select auth.uid()) = user_id and (select private.has_roadbook()))
with check (
  (select auth.uid()) = user_id
  and (select private.has_roadbook())
  and (
    location_id is null
    or exists (
      select 1
      from public.member_locations ml
      where ml.id = location_id
        and ml.user_id = (select auth.uid())
    )
  )
);
create policy "member_notifications_own" on public.member_notifications for select to authenticated
using ((select auth.uid()) = user_id);
create policy "member_notifications_update_own" on public.member_notifications for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "source_registry_admin" on public.source_registry for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "agent_runs_admin" on public.agent_runs for select to authenticated
using ((select private.is_admin()));
create policy "review_queue_admin" on public.review_queue for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.events, public.event_sources to anon, authenticated;
grant select (id, name, description, share_token, is_shared, created_at) on public.roadbooks to anon;
grant select (roadbook_id, event_id, position) on public.roadbook_events to anon;
grant select on public.profiles to authenticated;
grant update (display_name, home_location, home_postcode, latitude, longitude, home_radius_miles, digest_frequency) on public.profiles to authenticated;
grant select, delete on public.saved_events to authenticated;
grant insert (user_id, event_id, reminder_preference) on public.saved_events to authenticated;
grant update (reminder_preference) on public.saved_events to authenticated;
grant select, delete on public.event_attendance to authenticated;
grant insert (user_id, event_id) on public.event_attendance to authenticated;
grant select, delete on public.user_submissions to authenticated;
grant insert (submitted_by, event_name, event_url, event_date, location_text, notes) on public.user_submissions to authenticated;
grant update (status) on public.user_submissions to authenticated;
grant select, delete on public.member_locations to authenticated;
grant insert (user_id, label, place_name, latitude, longitude, radius_miles, is_home) on public.member_locations to authenticated;
grant update (label, place_name, latitude, longitude, radius_miles, is_home) on public.member_locations to authenticated;
grant select, delete on public.member_vehicles to authenticated;
grant insert (user_id, name, make, model, year) on public.member_vehicles to authenticated;
grant update (name, make, model, year) on public.member_vehicles to authenticated;
grant select, delete on public.roadbooks to authenticated;
grant insert (user_id, name, description, is_shared) on public.roadbooks to authenticated;
grant update (name, description, is_shared) on public.roadbooks to authenticated;
grant select, delete on public.roadbook_events to authenticated;
grant insert (roadbook_id, event_id, position, notes) on public.roadbook_events to authenticated;
grant update (position, notes) on public.roadbook_events to authenticated;
grant select, delete on public.alert_rules to authenticated;
grant insert (user_id, name, location_id, event_type, marque, radius_miles, frequency, enabled) on public.alert_rules to authenticated;
grant update (name, location_id, event_type, marque, radius_miles, frequency, enabled) on public.alert_rules to authenticated;
grant select on public.member_notifications to authenticated;
grant update (is_read) on public.member_notifications to authenticated;
grant insert, update, delete on public.events, public.event_sources, public.event_observations to authenticated;
grant select, insert, update, delete on public.source_registry, public.review_queue to authenticated;
grant select on public.agent_runs, public.event_observations to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(coalesce(u.email, ''), '@', 1), '')
from auth.users u
on conflict (id) do nothing;

update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id
  and lower(coalesce(u.email, '')) in ('matthewcoxall@classicsgo.com', 'matthewcoxall@googlemail.com');

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  home_location text,
  home_postcode text,
  latitude double precision,
  longitude double precision,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  event_type text not null,
  start_date date not null,
  start_time time,
  end_date date,
  end_time time,
  venue_name text,
  address text,
  town text,
  county text,
  postcode text,
  latitude double precision,
  longitude double precision,
  price_text text,
  booking_required boolean,
  booking_url text,
  organiser_name text,
  organiser_url text,
  image_url text,
  status text default 'draft' check (status in ('draft','review','published','rejected','expired')),
  confidence_score integer default 0,
  is_verified boolean default false,
  source_count integer default 0,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  source_url text not null,
  source_title text,
  source_type text,
  raw_excerpt text,
  discovered_at timestamptz default now(),
  last_seen_at timestamptz,
  confidence_score integer default 0
);

create table if not exists public.user_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id),
  event_name text,
  event_url text,
  event_date text,
  location_text text,
  notes text,
  status text default 'pending' check (status in ('pending','approved','rejected','merged')),
  created_at timestamptz default now()
);

create table if not exists public.saved_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  reminder_preference text,
  created_at timestamptz default now(),
  unique(user_id, event_id)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text default 'running',
  searches_performed integer default 0,
  results_found integer default 0,
  events_created integer default 0,
  events_updated integer default 0,
  duplicates_found integer default 0,
  errors jsonb default '[]'::jsonb,
  notes text
);

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  proposed_event jsonb not null,
  source_url text,
  reason text,
  confidence_score integer default 0,
  status text default 'pending' check (status in ('pending','approved','rejected','merged')),
  created_at timestamptz default now()
);

create index if not exists events_status_start_date_idx on public.events(status, start_date);
create index if not exists events_type_idx on public.events(event_type);
create index if not exists events_town_county_idx on public.events(town, county);
create index if not exists event_sources_event_id_idx on public.event_sources(event_id);
create unique index if not exists event_sources_event_id_source_url_key on public.event_sources(event_id, source_url);
create index if not exists review_queue_status_idx on public.review_queue(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

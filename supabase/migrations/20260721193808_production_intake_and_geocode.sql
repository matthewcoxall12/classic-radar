-- Backend-only intake queues and privacy-preserving location cache used by
-- the Vercel migration. Browser roles intentionally receive no table access;
-- validated application routes write with the server-only Supabase key.

create table if not exists public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (char_length(event_name) between 3 and 120),
  organiser_name text not null check (char_length(organiser_name) between 2 and 100),
  email text not null check (char_length(email) between 3 and 180),
  club_name text not null default '' check (char_length(club_name) <= 120),
  official_url text not null check (char_length(official_url) <= 500),
  venue text not null check (char_length(venue) between 2 and 160),
  town_postcode text not null check (char_length(town_postcode) between 2 and 160),
  start_date date not null,
  end_date date,
  category text not null check (category in ('Show', 'Meet', 'Autojumble', 'Motorsport', 'Run')),
  description text not null check (char_length(description) between 30 and 1500),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'approved', 'rejected')),
  internal_notes text not null default '' check (char_length(internal_notes) <= 2000),
  assigned_to text not null default '' check (char_length(assigned_to) <= 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.partner_enquiries (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (char_length(contact_name) between 2 and 100),
  organisation_name text not null check (char_length(organisation_name) between 2 and 140),
  email text not null check (char_length(email) between 3 and 180),
  organisation_type text not null check (char_length(organisation_type) between 2 and 80),
  website text not null default '' check (char_length(website) <= 500),
  message text not null check (char_length(message) between 20 and 1500),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'closed')),
  internal_notes text not null default '' check (char_length(internal_notes) <= 2000),
  assigned_to text not null default '' check (char_length(assigned_to) <= 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (char_length(contact_name) between 2 and 100),
  email text not null check (char_length(email) between 3 and 180),
  request_type text not null
    check (request_type in ('access', 'correction', 'deletion', 'restriction', 'objection', 'other')),
  message text not null check (char_length(message) between 20 and 2000),
  status text not null default 'new'
    check (status in ('new', 'verifying', 'in_progress', 'completed', 'refused')),
  internal_notes text not null default '' check (char_length(internal_notes) <= 2000),
  assigned_to text not null default '' check (char_length(assigned_to) <= 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.geocode_cache (
  cache_key text primary key check (cache_key ~ '^[a-f0-9]{64}$'),
  label text not null check (char_length(label) between 1 and 300),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  provider text not null default 'nominatim-compatible',
  expires_at bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_submissions_status_created_idx
  on public.event_submissions(status, created_at desc);
create index if not exists partner_enquiries_status_created_idx
  on public.partner_enquiries(status, created_at desc);
create index if not exists privacy_requests_status_created_idx
  on public.privacy_requests(status, created_at desc);
create index if not exists geocode_cache_expiry_idx
  on public.geocode_cache(expires_at);

drop trigger if exists event_submissions_updated_at on public.event_submissions;
create trigger event_submissions_updated_at
before update on public.event_submissions
for each row execute function private.set_updated_at();

drop trigger if exists partner_enquiries_updated_at on public.partner_enquiries;
create trigger partner_enquiries_updated_at
before update on public.partner_enquiries
for each row execute function private.set_updated_at();

drop trigger if exists privacy_requests_updated_at on public.privacy_requests;
create trigger privacy_requests_updated_at
before update on public.privacy_requests
for each row execute function private.set_updated_at();

drop trigger if exists geocode_cache_updated_at on public.geocode_cache;
create trigger geocode_cache_updated_at
before update on public.geocode_cache
for each row execute function private.set_updated_at();

alter table public.event_submissions enable row level security;
alter table public.partner_enquiries enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.geocode_cache enable row level security;

revoke all on table public.event_submissions from public, anon, authenticated;
revoke all on table public.partner_enquiries from public, anon, authenticated;
revoke all on table public.privacy_requests from public, anon, authenticated;
revoke all on table public.geocode_cache from public, anon, authenticated;

grant select, insert, update, delete on table public.event_submissions to service_role;
grant select, insert, update, delete on table public.partner_enquiries to service_role;
grant select, insert, update, delete on table public.privacy_requests to service_role;
grant select, insert, update, delete on table public.geocode_cache to service_role;

-- A single atomic lease keeps public Nominatim-compatible lookups at least
-- 1.05 seconds apart across concurrent Vercel instances.
create table if not exists private.geocode_leases (
  bucket_key text primary key,
  expires_at bigint not null,
  updated_at timestamptz not null default now()
);
revoke all on table private.geocode_leases from public, anon, authenticated;
grant select, insert, update, delete on table private.geocode_leases to service_role;

create or replace function public.claim_geocode_lease(
  p_now_ms bigint,
  p_duration_ms integer default 1050
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_claimed boolean;
begin
  if p_now_ms < 1 or p_duration_ms < 1000 or p_duration_ms > 10000 then
    raise exception using errcode = '22023', message = 'Invalid geocode lease request';
  end if;

  insert into private.geocode_leases (bucket_key, expires_at, updated_at)
  values ('nominatim-global', p_now_ms + p_duration_ms, clock_timestamp())
  on conflict (bucket_key) do update
    set expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    where private.geocode_leases.expires_at <= p_now_ms
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$function$;

revoke all on function public.claim_geocode_lease(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.claim_geocode_lease(bigint, integer)
  to service_role;

comment on table public.event_submissions is
  'Backend-only public event intake queue; browser roles have no direct access.';
comment on table public.partner_enquiries is
  'Backend-only partnership enquiry queue; browser roles have no direct access.';
comment on table public.privacy_requests is
  'Backend-only data-rights request queue; browser roles have no direct access.';
comment on table public.geocode_cache is
  'Backend-only cache of hashed location queries and normalized coordinates.';
comment on function public.claim_geocode_lease(bigint, integer) is
  'Service-role-only atomic spacing lease for the configured geocoder.';

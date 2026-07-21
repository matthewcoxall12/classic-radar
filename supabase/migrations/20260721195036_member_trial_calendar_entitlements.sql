-- Supabase-backed Roadbook trials and private calendar feeds.
-- Billing remains deliberately fail-closed in the application until Stripe's
-- own persistence layer is migrated; these columns preserve the Sites v13
-- account contract without exposing them to direct profile updates.

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_calendar_token_idx
  on public.profiles(calendar_token);

alter table public.alert_rules drop constraint if exists alert_rules_frequency_check;
alter table public.alert_rules
  add constraint alert_rules_frequency_check
  check (frequency in ('instant', 'daily', 'weekly'));

create table if not exists private.roadbook_trial_claims (
  identity_hash bytea primary key,
  claimed_at timestamptz not null default now()
);

revoke all on private.roadbook_trial_claims from public, anon, authenticated, service_role;

create or replace function private.has_roadbook()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (
      select
        p.is_admin
        or (
          p.tier = 'roadbook'
          and (
            p.subscription_status is distinct from 'trialing'
            or p.subscription_expires_at > pg_catalog.now()
          )
        )
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function private.has_roadbook() from public, anon, authenticated, service_role;
grant execute on function private.has_roadbook() to authenticated;

create or replace function public.start_own_roadbook_trial()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_identity_hash bytea;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select extensions.digest(i.provider || ':' || i.provider_id, 'sha256')
  into v_identity_hash
  from auth.identities i
  where i.user_id = v_user_id
  order by i.created_at
  limit 1;

  if v_identity_hash is null then
    raise exception using errcode = '28000', message = 'Verified identity required';
  end if;

  insert into private.roadbook_trial_claims(identity_hash)
  values (v_identity_hash)
  on conflict do nothing;

  if not found then
    raise exception using errcode = 'P0001', message = 'Trial already used';
  end if;

  update public.profiles p
  set tier = 'roadbook',
      subscription_status = 'trialing',
      subscription_expires_at = pg_catalog.now() + interval '14 days',
      trial_started_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where p.id = v_user_id
    and p.tier = 'free'
    and p.trial_started_at is null
    and p.stripe_subscription_id is null
  returning p.* into v_profile;

  if not found then
    delete from private.roadbook_trial_claims where identity_hash = v_identity_hash;
    raise exception using errcode = 'P0001', message = 'Trial is unavailable';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.start_own_roadbook_trial() from public, anon, authenticated, service_role;
grant execute on function public.start_own_roadbook_trial() to authenticated;

create or replace function public.rotate_own_calendar_token()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null or not private.has_roadbook() then
    raise exception using errcode = '42501', message = 'Roadbook membership required';
  end if;

  update public.profiles p
  set calendar_token = extensions.gen_random_uuid(), updated_at = pg_catalog.now()
  where p.id = auth.uid()
  returning p.calendar_token into v_token;

  return v_token;
end;
$$;

revoke all on function public.rotate_own_calendar_token() from public, anon, authenticated, service_role;
grant execute on function public.rotate_own_calendar_token() to authenticated;

create or replace function public.rotate_own_roadbook_share_token(p_roadbook_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null or not private.has_roadbook() then
    raise exception using errcode = '42501', message = 'Roadbook membership required';
  end if;

  update public.roadbooks r
  set share_token = extensions.gen_random_uuid(),
      is_shared = true,
      updated_at = pg_catalog.now()
  where r.id = p_roadbook_id and r.user_id = auth.uid()
  returning r.share_token into v_token;

  return v_token;
end;
$$;

revoke all on function public.rotate_own_roadbook_share_token(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rotate_own_roadbook_share_token(uuid) to authenticated;

-- Preserve the existing capability-token/RLS design while including the
-- private note expected by the Sites v13 shared-roadbook page.
create or replace function public.get_shared_roadbook(p_share_token uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  shared_roadbook jsonb;
begin
  perform pg_catalog.set_config('classicsgo.share_token', p_share_token::text, true);

  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'description', r.description,
    'created_at', r.created_at,
    'events', coalesce((
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
          'position', re.position,
          'notes', re.notes
        ) order by re.position, e.start_date, e.start_time nulls last
      )
      from public.roadbook_events re
      join public.events e on e.id = re.event_id
      where re.roadbook_id = r.id and e.status = 'published'
    ), '[]'::jsonb)
  )
  into shared_roadbook
  from public.roadbooks r
  where r.share_token = p_share_token and r.is_shared
  limit 1;

  return shared_roadbook;
end;
$$;

revoke all on function public.get_shared_roadbook(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_shared_roadbook(uuid) to anon, authenticated;

create or replace function public.get_calendar_feed(p_calendar_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_feed jsonb;
begin
  select jsonb_build_object(
    'display_name', p.display_name,
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'description', e.description,
          'venue', e.venue_name,
          'town', e.town,
          'postcode', e.postcode,
          'start_date', e.start_date,
          'end_date', e.end_date,
          'start_time', e.start_time,
          'price', e.price_text,
          'official_url', coalesce(e.booking_url, e.organiser_url)
        ) order by e.start_date, e.start_time nulls last, e.title
      )
      from public.saved_events s
      join public.events e on e.id = s.event_id
      where s.user_id = p.id
        and e.status = 'published'
        and coalesce(e.end_date, e.start_date) >= (pg_catalog.now())::date
    ), '[]'::jsonb)
  )
  into v_feed
  from public.profiles p
  where p.calendar_token = p_calendar_token
    and p.tier = 'roadbook'
    and (
      p.subscription_status is distinct from 'trialing'
      or p.subscription_expires_at > pg_catalog.now()
    );

  return v_feed;
end;
$$;

revoke all on function public.get_calendar_feed(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_calendar_feed(uuid) to anon, authenticated;

comment on table private.roadbook_trial_claims is
  'Irreversible identity hashes retained solely to enforce one no-card trial per identity.';
comment on function public.get_calendar_feed(uuid) is
  'Returns a published-event calendar only for an active high-entropy member token.';

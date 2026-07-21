-- Move privileged member capability operations behind the Vercel service
-- boundary. The application verifies the current user and same-origin
-- mutation before supplying a user ID. Browser roles cannot call these RPCs.

create or replace function public.start_managed_roadbook_trial(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity_hash bytea;
  v_profile public.profiles;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'A user ID is required';
  end if;

  select extensions.digest(i.provider || ':' || i.provider_id, 'sha256')
  into v_identity_hash
  from auth.identities i
  where i.user_id = p_user_id
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
  where p.id = p_user_id
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

create or replace function public.rotate_managed_calendar_token(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and (
        p.is_admin
        or (
          p.tier = 'roadbook'
          and (
            p.subscription_status is distinct from 'trialing'
            or p.subscription_expires_at > pg_catalog.now()
          )
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Roadbook membership required';
  end if;

  update public.profiles p
  set calendar_token = extensions.gen_random_uuid(),
      updated_at = pg_catalog.now()
  where p.id = p_user_id
  returning p.calendar_token into v_token;

  return v_token;
end;
$$;

create or replace function public.rotate_managed_roadbook_share_token(
  p_user_id uuid,
  p_roadbook_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and (
        p.is_admin
        or (
          p.tier = 'roadbook'
          and (
            p.subscription_status is distinct from 'trialing'
            or p.subscription_expires_at > pg_catalog.now()
          )
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Roadbook membership required';
  end if;

  update public.roadbooks r
  set share_token = extensions.gen_random_uuid(),
      is_shared = true,
      updated_at = pg_catalog.now()
  where r.id = p_roadbook_id and r.user_id = p_user_id
  returning r.share_token into v_token;

  if v_token is null then
    raise exception using errcode = 'P0002', message = 'Roadbook not found';
  end if;
  return v_token;
end;
$$;

create or replace function public.get_managed_calendar_feed(p_calendar_token uuid)
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
        and coalesce(e.end_date, e.start_date) >= pg_catalog.now()::date
    ), '[]'::jsonb)
  )
  into v_feed
  from public.profiles p
  where p.calendar_token = p_calendar_token
    and (
      p.is_admin
      or (
        p.tier = 'roadbook'
        and (
          p.subscription_status is distinct from 'trialing'
          or p.subscription_expires_at > pg_catalog.now()
        )
      )
    );

  return v_feed;
end;
$$;

revoke all on function public.start_managed_roadbook_trial(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rotate_managed_calendar_token(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rotate_managed_roadbook_share_token(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_managed_calendar_feed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_managed_roadbook_trial(uuid) to service_role;
grant execute on function public.rotate_managed_calendar_token(uuid) to service_role;
grant execute on function public.rotate_managed_roadbook_share_token(uuid, uuid) to service_role;
grant execute on function public.get_managed_calendar_feed(uuid) to service_role;

revoke all on function public.start_own_roadbook_trial()
  from public, anon, authenticated, service_role;
revoke all on function public.rotate_own_calendar_token()
  from public, anon, authenticated, service_role;
revoke all on function public.rotate_own_roadbook_share_token(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_calendar_feed(uuid)
  from public, anon, authenticated, service_role;
drop function public.start_own_roadbook_trial();
drop function public.rotate_own_calendar_token();
drop function public.rotate_own_roadbook_share_token(uuid);
drop function public.get_calendar_feed(uuid);

comment on function public.get_managed_calendar_feed(uuid) is
  'Service-role-only capability-token calendar feed for the Vercel application.';

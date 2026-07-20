-- Self-service account controls use the caller's JWT only. No service-role
-- credential is exposed to the application.
create or replace function private.require_recent_auth(p_max_age_seconds integer default 900)
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_created_at timestamptz;
  v_amr_authenticated_at timestamptz;
  v_authenticated_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select s.created_at
  into v_session_created_at
  from auth.sessions as s
  where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and s.user_id = v_user_id;

  select max(to_timestamp((entry ->> 'timestamp')::double precision))
  into v_amr_authenticated_at
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
  where entry ->> 'timestamp' ~ '^[0-9]{10}(?:[0-9]{3})?$';

  if v_amr_authenticated_at is not null
     and extract(epoch from v_amr_authenticated_at) > 9999999999 then
    v_amr_authenticated_at := to_timestamp(extract(epoch from v_amr_authenticated_at) / 1000);
  end if;

  v_authenticated_at := coalesce(
    greatest(v_session_created_at, v_amr_authenticated_at),
    v_session_created_at,
    v_amr_authenticated_at
  );

  if v_authenticated_at is null
     or v_authenticated_at < clock_timestamp() - make_interval(secs => p_max_age_seconds) then
    raise exception using errcode = '28000', message = 'Recent authentication required';
  end if;

  return v_user_id;
end;
$function$;

revoke all on function private.require_recent_auth(integer) from public, anon, authenticated, service_role;

create or replace function public.export_own_account_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $function$
declare
  v_user_id uuid := private.require_recent_auth(900);
begin
  return jsonb_build_object(
    'schema_version', 1,
    'exported_at', clock_timestamp(),
    'account', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'phone', u.phone,
        'created_at', u.created_at,
        'updated_at', u.updated_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed_at', u.email_confirmed_at,
        'user_metadata', u.raw_user_meta_data
      )
      from auth.users as u
      where u.id = v_user_id
    ),
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', i.provider,
        'provider_id', i.provider_id,
        'email', i.email,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'last_sign_in_at', i.last_sign_in_at
      ) order by i.created_at)
      from auth.identities as i
      where i.user_id = v_user_id
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'refreshed_at', s.refreshed_at,
        'user_agent', s.user_agent,
        'ip', s.ip::text,
        'assurance_level', s.aal::text,
        'not_after', s.not_after
      ) order by s.created_at)
      from auth.sessions as s
      where s.user_id = v_user_id
    ), '[]'::jsonb),
    'profile', (
      select to_jsonb(p)
      from public.profiles as p
      where p.id = v_user_id
    ),
    'saved_events', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.saved_events as row_data
      where row_data.user_id = v_user_id
    ), '[]'::jsonb),
    'event_attendance', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.event_attendance as row_data
      where row_data.user_id = v_user_id
    ), '[]'::jsonb),
    'event_submissions', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.user_submissions as row_data
      where row_data.submitted_by = v_user_id
    ), '[]'::jsonb),
    'member_locations', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.member_locations as row_data
      where row_data.user_id = v_user_id
    ), '[]'::jsonb),
    'member_vehicles', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.member_vehicles as row_data
      where row_data.user_id = v_user_id
    ), '[]'::jsonb),
    'roadbooks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.roadbooks as row_data
      where row_data.user_id = v_user_id
    ), '[]'::jsonb),
    'roadbook_events', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.roadbook_events as row_data
      join public.roadbooks as owner on owner.id = row_data.roadbook_id
      where owner.user_id = v_user_id
    ), '[]'::jsonb),
    'alert_rules', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.alert_rules as row_data
      where row_data.user_id = v_user_id
    ), '[]'::jsonb),
    'member_notifications', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.member_notifications as row_data
      where row_data.user_id = v_user_id
    ), '[]'::jsonb),
    'welcome_email_delivery', (
      select to_jsonb(row_data) - 'provider_message_id'
      from public.welcome_email_deliveries as row_data
      where row_data.user_id = v_user_id
    )
  );
end;
$function$;

revoke all on function public.export_own_account_data() from public, anon, authenticated, service_role;
grant execute on function public.export_own_account_data() to authenticated;

create or replace function public.delete_own_account(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $function$
declare
  v_user_id uuid := private.require_recent_auth(900);
  v_tier text;
  v_is_admin boolean;
begin
  if p_confirmation <> 'DELETE' then
    raise exception using errcode = '22023', message = 'Confirmation phrase is invalid';
  end if;

  select p.tier, p.is_admin
  into v_tier, v_is_admin
  from public.profiles as p
  where p.id = v_user_id;

  if coalesce(v_is_admin, false) then
    raise exception using errcode = '42501', message = 'Administrator accounts require manual transfer and deletion';
  end if;
  if coalesce(v_tier, 'free') <> 'free' then
    raise exception using errcode = '42501', message = 'Cancel paid membership before deleting the account';
  end if;

  delete from auth.users as u where u.id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Account was not found';
  end if;
end;
$function$;

revoke all on function public.delete_own_account(text) from public, anon, authenticated, service_role;
grant execute on function public.delete_own_account(text) to authenticated;

comment on function public.export_own_account_data() is
  'Exports only the recently authenticated caller account and related rows.';
comment on function public.delete_own_account(text) is
  'Deletes only the recently authenticated non-admin free account and cascades owned rows.';

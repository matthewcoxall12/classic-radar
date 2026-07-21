-- Sensitive data export and account deletion are invoked only by the Vercel
-- server after it has verified the Supabase user, same-origin mutation and
-- fresh authentication. Browser roles cannot execute either function.

create or replace function public.export_managed_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public
as $function$
declare
  v_email text;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'A user ID is required';
  end if;

  select lower(u.email)
  into v_email
  from auth.users as u
  where u.id = p_user_id;

  if v_email is null then
    raise exception using errcode = 'P0002', message = 'Account was not found';
  end if;

  return jsonb_build_object(
    'schema_version', 2,
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
      where u.id = p_user_id
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
      where i.user_id = p_user_id
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
      where s.user_id = p_user_id
    ), '[]'::jsonb),
    'profile', (
      select to_jsonb(p)
      from public.profiles as p
      where p.id = p_user_id
    ),
    'saved_events', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.saved_events as row_data
      where row_data.user_id = p_user_id
    ), '[]'::jsonb),
    'event_attendance', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.event_attendance as row_data
      where row_data.user_id = p_user_id
    ), '[]'::jsonb),
    'user_submissions', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.user_submissions as row_data
      where row_data.submitted_by = p_user_id
    ), '[]'::jsonb),
    'member_locations', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.member_locations as row_data
      where row_data.user_id = p_user_id
    ), '[]'::jsonb),
    'member_vehicles', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.member_vehicles as row_data
      where row_data.user_id = p_user_id
    ), '[]'::jsonb),
    'roadbooks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.roadbooks as row_data
      where row_data.user_id = p_user_id
    ), '[]'::jsonb),
    'roadbook_events', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.roadbook_events as row_data
      join public.roadbooks as owner on owner.id = row_data.roadbook_id
      where owner.user_id = p_user_id
    ), '[]'::jsonb),
    'alert_rules', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.alert_rules as row_data
      where row_data.user_id = p_user_id
    ), '[]'::jsonb),
    'member_notifications', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at)
      from public.member_notifications as row_data
      where row_data.user_id = p_user_id
    ), '[]'::jsonb),
    'welcome_email_delivery', (
      select to_jsonb(row_data) - 'provider_message_id'
      from public.welcome_email_deliveries as row_data
      where row_data.user_id = p_user_id
    ),
    'public_event_submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', row_data.id,
        'event_name', row_data.event_name,
        'organiser_name', row_data.organiser_name,
        'email', row_data.email,
        'club_name', row_data.club_name,
        'official_url', row_data.official_url,
        'venue', row_data.venue,
        'town_postcode', row_data.town_postcode,
        'start_date', row_data.start_date,
        'end_date', row_data.end_date,
        'category', row_data.category,
        'description', row_data.description,
        'status', row_data.status,
        'created_at', row_data.created_at,
        'updated_at', row_data.updated_at
      ) order by row_data.created_at)
      from public.event_submissions as row_data
      where lower(row_data.email) = v_email
    ), '[]'::jsonb),
    'partner_enquiries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', row_data.id,
        'contact_name', row_data.contact_name,
        'organisation_name', row_data.organisation_name,
        'email', row_data.email,
        'organisation_type', row_data.organisation_type,
        'website', row_data.website,
        'message', row_data.message,
        'status', row_data.status,
        'created_at', row_data.created_at,
        'updated_at', row_data.updated_at
      ) order by row_data.created_at)
      from public.partner_enquiries as row_data
      where lower(row_data.email) = v_email
    ), '[]'::jsonb),
    'privacy_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', row_data.id,
        'contact_name', row_data.contact_name,
        'email', row_data.email,
        'request_type', row_data.request_type,
        'message', row_data.message,
        'status', row_data.status,
        'created_at', row_data.created_at,
        'updated_at', row_data.updated_at
      ) order by row_data.created_at)
      from public.privacy_requests as row_data
      where lower(row_data.email) = v_email
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.export_managed_account_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.export_managed_account_data(uuid) to service_role;

create or replace function public.delete_managed_account(
  p_user_id uuid,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth, public
as $function$
declare
  v_email text;
  v_tier text;
  v_is_admin boolean;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'A user ID is required';
  end if;
  if p_confirmation is distinct from 'DELETE' then
    raise exception using errcode = '22023', message = 'Confirmation phrase is invalid';
  end if;

  select lower(u.email)
  into v_email
  from auth.users as u
  where u.id = p_user_id
  for update;

  if v_email is null then
    raise exception using errcode = 'P0002', message = 'Account was not found';
  end if;

  select p.tier, p.is_admin
  into v_tier, v_is_admin
  from public.profiles as p
  where p.id = p_user_id;

  if coalesce(v_is_admin, false) then
    raise exception using errcode = '42501', message = 'Administrator accounts require manual transfer and deletion';
  end if;
  if coalesce(v_tier, 'free') <> 'free' then
    raise exception using errcode = '42501', message = 'Cancel paid membership before deleting the account';
  end if;

  delete from public.event_submissions
  where lower(email) = v_email;

  delete from public.partner_enquiries
  where lower(email) = v_email;

  update public.privacy_requests
  set contact_name = 'Deleted account',
      email = 'deleted+' || substring(id::text, 1, 20) || '@invalid.example',
      message = 'Request content erased after verified account deletion.',
      status = 'completed',
      internal_notes = '',
      assigned_to = '',
      updated_at = clock_timestamp()
  where lower(email) = v_email;

  delete from auth.users
  where id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Account was not found';
  end if;
end;
$function$;

revoke all on function public.delete_managed_account(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_managed_account(uuid, text) to service_role;

-- Retire the authenticated SECURITY DEFINER endpoints. Their replacements are
-- callable only with the server-held Supabase secret key.
revoke all on function public.export_own_account_data()
  from public, anon, authenticated, service_role;
revoke all on function public.delete_own_account(text)
  from public, anon, authenticated, service_role;
drop function if exists public.export_own_account_data();
drop function if exists public.delete_own_account(text);

comment on function public.export_managed_account_data(uuid) is
  'Service-role-only export for a Vercel-verified, freshly authenticated user.';
comment on function public.delete_managed_account(uuid, text) is
  'Service-role-only atomic deletion for a Vercel-verified, freshly authenticated non-admin free account.';

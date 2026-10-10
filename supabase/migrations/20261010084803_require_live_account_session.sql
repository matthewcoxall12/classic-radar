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
    and s.user_id = v_user_id
    and (s.not_after is null or s.not_after > clock_timestamp());

  -- A recently signed JWT alone is insufficient after global sign-out or deletion.
  if v_session_created_at is null then
    raise exception using errcode = '28000', message = 'Fresh authentication required';
  end if;

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


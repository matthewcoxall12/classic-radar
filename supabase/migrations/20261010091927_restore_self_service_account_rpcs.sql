-- The service-only account migration removed the caller-facing RPCs while the
-- website retained them. Expose only these narrow authenticated wrappers;
-- callers can never supply a user ID or call the managed functions directly.
create or replace function public.export_own_account_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  member_id uuid := private.require_recent_auth(900);
begin
  return public.export_managed_account_data(member_id) || pg_catalog.jsonb_build_object(
    'published_events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event) order by event.created_at)
      from public.events as event where event.created_by = member_id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.delete_own_account(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  member_id uuid := private.require_recent_auth(900);
begin
  if p_confirmation is distinct from 'DELETE' then
    raise exception using errcode = '22023', message = 'Confirmation phrase is invalid';
  end if;
  -- The managed function additionally blocks administrators and paid accounts,
  -- removes owned private data and anonymises retained privacy request records.
  perform public.delete_managed_account(member_id, p_confirmation);
end;
$function$;

revoke all on function public.export_own_account_data() from public, anon, authenticated, service_role;
revoke all on function public.delete_own_account(text) from public, anon, authenticated, service_role;
grant execute on function public.export_own_account_data() to authenticated;
grant execute on function public.delete_own_account(text) to authenticated;

-- Keep the arbitrary-UUID capabilities and auth-table helper private.
revoke all on function public.export_managed_account_data(uuid) from public, anon, authenticated;
revoke all on function public.delete_managed_account(uuid,text) from public, anon, authenticated;
revoke all on function private.require_recent_auth(integer) from public, anon, authenticated, service_role;

comment on function public.export_own_account_data() is
  'Exports only the current caller after checking a live recently authenticated session.';
comment on function public.delete_own_account(text) is
  'Deletes only the current caller with a live recent session, DELETE confirmation and administrator/billing protection.';

-- Harden the account-deletion confirmation check. In PostgreSQL, `NULL <>`
-- evaluates to NULL rather than true, so use an explicit null-safe comparison.
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
  if p_confirmation is distinct from 'DELETE' then
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

comment on function public.delete_own_account(text) is
  'Deletes only the recently authenticated non-admin free account and cascades owned rows; requires a null-safe DELETE confirmation.';

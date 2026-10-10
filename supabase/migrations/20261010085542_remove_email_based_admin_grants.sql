-- An email address is contact information, never a source of administrator
-- privileges. Existing verified administrator grants are preserved. Future
-- owner grants must be explicit, trusted updates to a verified user's UUID.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

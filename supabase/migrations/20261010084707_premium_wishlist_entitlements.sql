-- Membership comes from protected profile columns, never editable JWT metadata.
-- Existing production profiles already have billing metadata; include the
-- entitlement columns here so a fresh environment has the same contract.
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
create or replace function private.has_roadbook()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin or (
    p.tier = 'roadbook'
    and (p.subscription_status is null or p.subscription_status in ('active', 'trialing'))
    and (p.subscription_expires_at is null or p.subscription_expires_at > pg_catalog.now())
    and (p.subscription_status is distinct from 'trialing' or p.subscription_expires_at > pg_catalog.now())
  ) from public.profiles p where p.id = (select auth.uid())), false);
$$;
revoke all on function private.has_roadbook() from public, anon;
grant execute on function private.has_roadbook() to authenticated;

drop policy if exists saved_events_own on public.saved_events;
-- Existing free wishlists remain stored, but access now requires Roadbook.
create policy saved_events_premium_own on public.saved_events for all to authenticated
using ((select auth.uid()) = user_id and (select private.has_roadbook()))
with check ((select auth.uid()) = user_id and (select private.has_roadbook())
  and exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));

-- Defensive column grants prevent self-upgrades and admin impersonation.
revoke update on public.profiles from authenticated;
grant update (display_name, home_location, home_postcode, latitude, longitude, home_radius_miles, digest_frequency)
on public.profiles to authenticated;

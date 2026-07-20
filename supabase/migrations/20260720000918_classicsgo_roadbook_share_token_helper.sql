-- Keep the request-local share token behind a stable helper. Supabase's RLS
-- advisor identifies current_setting() even when it is directly wrapped in an
-- init-plan SELECT, while a stable helper called through SELECT is cached once
-- per statement as intended.

create or replace function private.share_token_setting()
returns text
language sql
security invoker
set search_path = ''
stable
as $$
  select nullif(pg_catalog.current_setting('classicsgo.share_token', true), '');
$$;

revoke all on function private.share_token_setting() from public, anon, authenticated;

-- `private` is not an exposed Data API schema. Anonymous callers need schema
-- USAGE only so the RLS policy can resolve this helper; no other private
-- function grants are broadened.
grant usage on schema private to anon;
grant execute on function private.share_token_setting() to anon, authenticated;

drop policy if exists "roadbooks_anon_read" on public.roadbooks;
drop policy if exists "roadbooks_authenticated_read" on public.roadbooks;

create policy "roadbooks_anon_read"
on public.roadbooks
for select
to anon
using (
  is_shared
  and share_token::text = (select private.share_token_setting())
);

create policy "roadbooks_authenticated_read"
on public.roadbooks
for select
to authenticated
using (
  (
    (select auth.uid()) = user_id
    and (select private.has_roadbook())
  )
  or (
    is_shared
    and share_token::text = (select private.share_token_setting())
  )
);

drop policy if exists "roadbook_events_anon_read" on public.roadbook_events;
drop policy if exists "roadbook_events_authenticated_read" on public.roadbook_events;

create policy "roadbook_events_anon_read"
on public.roadbook_events
for select
to anon
using (
  exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.is_shared
      and r.share_token::text = (select private.share_token_setting())
  )
);

create policy "roadbook_events_authenticated_read"
on public.roadbook_events
for select
to authenticated
using (
  exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.user_id = (select auth.uid())
      and (select private.has_roadbook())
  )
  or exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.is_shared
      and r.share_token::text = (select private.share_token_setting())
  )
);

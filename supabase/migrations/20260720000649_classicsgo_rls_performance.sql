-- Consolidate permissive SELECT policies and cache request-scoped helpers once
-- per statement. This keeps the same access model while removing Supabase RLS
-- advisor warnings on the production schema.

-- Profiles: owners see themselves; admins see every profile.
drop policy if exists "profiles_read_own" on public.profiles;
drop policy if exists "profiles_admin_read" on public.profiles;
drop policy if exists "profiles_authenticated_read" on public.profiles;

create policy "profiles_authenticated_read"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (select private.is_admin())
);

-- Events: anonymous users see published events. Authenticated admins also see
-- moderation states. Admin writes are split so they no longer add a second
-- permissive SELECT policy through FOR ALL.
drop policy if exists "events_public_read" on public.events;
drop policy if exists "events_admin_manage" on public.events;
drop policy if exists "events_anon_read" on public.events;
drop policy if exists "events_authenticated_read" on public.events;
drop policy if exists "events_admin_insert" on public.events;
drop policy if exists "events_admin_update" on public.events;
drop policy if exists "events_admin_delete" on public.events;

create policy "events_anon_read"
on public.events
for select
to anon
using (status = 'published');

create policy "events_authenticated_read"
on public.events
for select
to authenticated
using (
  status = 'published'
  or (select private.is_admin())
);

create policy "events_admin_insert"
on public.events
for insert
to authenticated
with check ((select private.is_admin()));

create policy "events_admin_update"
on public.events
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "events_admin_delete"
on public.events
for delete
to authenticated
using ((select private.is_admin()));

-- Event sources mirror event visibility. Admin writes remain available without
-- creating another authenticated SELECT policy.
drop policy if exists "event_sources_public_read" on public.event_sources;
drop policy if exists "event_sources_admin_manage" on public.event_sources;
drop policy if exists "event_sources_anon_read" on public.event_sources;
drop policy if exists "event_sources_authenticated_read" on public.event_sources;
drop policy if exists "event_sources_admin_insert" on public.event_sources;
drop policy if exists "event_sources_admin_update" on public.event_sources;
drop policy if exists "event_sources_admin_delete" on public.event_sources;

create policy "event_sources_anon_read"
on public.event_sources
for select
to anon
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.status = 'published'
  )
);

create policy "event_sources_authenticated_read"
on public.event_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.status = 'published'
  )
  or (select private.is_admin())
);

create policy "event_sources_admin_insert"
on public.event_sources
for insert
to authenticated
with check ((select private.is_admin()));

create policy "event_sources_admin_update"
on public.event_sources
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "event_sources_admin_delete"
on public.event_sources
for delete
to authenticated
using ((select private.is_admin()));

-- Submissions: a single read policy covers owner and administrator visibility.
drop policy if exists "submissions_read_own" on public.user_submissions;
drop policy if exists "submissions_admin_read" on public.user_submissions;
drop policy if exists "submissions_authenticated_read" on public.user_submissions;

create policy "submissions_authenticated_read"
on public.user_submissions
for select
to authenticated
using (
  (select auth.uid()) = submitted_by
  or (select private.is_admin())
);

-- Roadbooks: public sharing stays bound to the transaction-local UUID set by
-- get_shared_roadbook(). Owner writes are split by command to avoid FOR ALL
-- contributing a second authenticated SELECT policy.
drop policy if exists "roadbooks_paid_own" on public.roadbooks;
drop policy if exists "roadbooks_share_token_read" on public.roadbooks;
drop policy if exists "roadbooks_anon_read" on public.roadbooks;
drop policy if exists "roadbooks_authenticated_read" on public.roadbooks;
drop policy if exists "roadbooks_owner_insert" on public.roadbooks;
drop policy if exists "roadbooks_owner_update" on public.roadbooks;
drop policy if exists "roadbooks_owner_delete" on public.roadbooks;

create policy "roadbooks_anon_read"
on public.roadbooks
for select
to anon
using (
  is_shared
  and share_token::text = (
    select nullif(pg_catalog.current_setting('classicsgo.share_token', true), '')
  )
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
    and share_token::text = (
      select nullif(pg_catalog.current_setting('classicsgo.share_token', true), '')
    )
  )
);

create policy "roadbooks_owner_insert"
on public.roadbooks
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.has_roadbook())
);

create policy "roadbooks_owner_update"
on public.roadbooks
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.has_roadbook())
)
with check (
  (select auth.uid()) = user_id
  and (select private.has_roadbook())
);

create policy "roadbooks_owner_delete"
on public.roadbooks
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.has_roadbook())
);

-- Roadbook entries follow the same owner-or-share visibility model. The event
-- publication check remains on owner inserts and updates.
drop policy if exists "roadbook_events_owner" on public.roadbook_events;
drop policy if exists "roadbook_events_share_token_read" on public.roadbook_events;
drop policy if exists "roadbook_events_anon_read" on public.roadbook_events;
drop policy if exists "roadbook_events_authenticated_read" on public.roadbook_events;
drop policy if exists "roadbook_events_owner_insert" on public.roadbook_events;
drop policy if exists "roadbook_events_owner_update" on public.roadbook_events;
drop policy if exists "roadbook_events_owner_delete" on public.roadbook_events;

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
      and r.share_token::text = (
        select nullif(pg_catalog.current_setting('classicsgo.share_token', true), '')
      )
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
      and r.share_token::text = (
        select nullif(pg_catalog.current_setting('classicsgo.share_token', true), '')
      )
  )
);

create policy "roadbook_events_owner_insert"
on public.roadbook_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.user_id = (select auth.uid())
      and (select private.has_roadbook())
  )
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.status = 'published'
  )
);

create policy "roadbook_events_owner_update"
on public.roadbook_events
for update
to authenticated
using (
  exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.user_id = (select auth.uid())
      and (select private.has_roadbook())
  )
)
with check (
  exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.user_id = (select auth.uid())
      and (select private.has_roadbook())
  )
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.status = 'published'
  )
);

create policy "roadbook_events_owner_delete"
on public.roadbook_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.roadbooks r
    where r.id = roadbook_id
      and r.user_id = (select auth.uid())
      and (select private.has_roadbook())
  )
);

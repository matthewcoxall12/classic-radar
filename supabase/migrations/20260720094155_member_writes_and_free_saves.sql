grant insert on table public.saved_events to authenticated;
grant insert on table public.event_attendance to authenticated;
grant update on table public.profiles to authenticated;
grant insert on table public.user_submissions to authenticated;

drop policy if exists saved_events_own on public.saved_events;

create policy saved_events_own
on public.saved_events
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.events as event
    where event.id = saved_events.event_id
      and event.status = 'published'
  )
);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_sources enable row level security;
alter table public.user_submissions enable row level security;
alter table public.saved_events enable row level security;
alter table public.agent_runs enable row level security;
alter table public.review_queue enable row level security;

create policy "profiles can read own profile"
on public.profiles for select
using (auth.uid() = id or public.is_admin());

create policy "profiles can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id and is_admin = false);

create policy "public can read published events"
on public.events for select
using (status = 'published' or public.is_admin());

create policy "admins manage events"
on public.events for all
using (public.is_admin())
with check (public.is_admin());

create policy "public can read sources for published events"
on public.event_sources for select
using (
  exists (
    select 1 from public.events
    where events.id = event_sources.event_id
    and (events.status = 'published' or public.is_admin())
  )
);

create policy "admins manage event sources"
on public.event_sources for all
using (public.is_admin())
with check (public.is_admin());

create policy "users create submissions"
on public.user_submissions for insert
with check (auth.uid() = submitted_by);

create policy "users read own submissions"
on public.user_submissions for select
using (auth.uid() = submitted_by or public.is_admin());

create policy "admins manage submissions"
on public.user_submissions for all
using (public.is_admin())
with check (public.is_admin());

create policy "users manage own saved events"
on public.saved_events for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "admins read saved events"
on public.saved_events for select
using (public.is_admin());

create policy "admins read agent runs"
on public.agent_runs for select
using (public.is_admin());

create policy "admins manage review queue"
on public.review_queue for all
using (public.is_admin())
with check (public.is_admin());

-- Edge Functions should use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS for agent writes.

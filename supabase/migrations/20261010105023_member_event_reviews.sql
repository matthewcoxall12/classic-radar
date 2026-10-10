-- Member reviews are public opinions, not proof of attendance.
create table public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 20 and 2000),
  reviewer_name text not null default 'ClassicsGo member' check (char_length(reviewer_name) between 1 and 80 and position('@' in reviewer_name) = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,event_id)
);
create index event_reviews_event_created_idx on public.event_reviews(event_id,created_at desc,id);
alter table public.event_reviews enable row level security;
revoke all on public.event_reviews from public,anon,authenticated;
grant select(id,event_id,rating,body,reviewer_name,created_at,updated_at) on public.event_reviews to anon,authenticated;
-- Own-review filtering needs the auth UUID only for authenticated requests.
-- Public review cards never request it, and anonymous callers cannot read it.
grant select(user_id) on public.event_reviews to authenticated;
grant insert(event_id,user_id,rating,body) on public.event_reviews to authenticated;
grant update(rating,body) on public.event_reviews to authenticated;
grant delete on public.event_reviews to authenticated;
grant all on public.event_reviews to service_role;

-- Private persistent quota survives deleting and reposting a review.
create table private.review_write_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  writes integer not null default 1 check(writes between 1 and 25)
);
alter table private.review_write_limits enable row level security;
revoke all on private.review_write_limits from public,anon,authenticated;
create or replace function private.consume_review_write_limit()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare member_id uuid := auth.uid(); affected integer;
begin
  if member_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(member_id::text,58193));
  insert into private.review_write_limits as quota(user_id,window_started_at,writes)
  values(member_id,clock_timestamp(),1)
  on conflict(user_id) do update
    set window_started_at = case when quota.window_started_at < clock_timestamp()-interval '24 hours' then clock_timestamp() else quota.window_started_at end,
        writes = case when quota.window_started_at < clock_timestamp()-interval '24 hours' then 1 else quota.writes+1 end
    where quota.window_started_at < clock_timestamp()-interval '24 hours' or quota.writes < 25;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'daily review writing limit reached'; end if;
end;
$$;
revoke all on function private.consume_review_write_limit() from public,anon,authenticated,service_role;
grant execute on function private.consume_review_write_limit() to authenticated;

create or replace function private.guard_member_review_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare member_id uuid := auth.uid(); public_name text;
begin
  if member_id is null or new.user_id is distinct from member_id then raise exception 'Review ownership is required'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Please sign in with a permanent account'; end if;
  if not exists(
    select 1 from public.events e where e.id=new.event_id and e.status='published'
      and coalesce(e.end_date,e.start_date) < (clock_timestamp() at time zone 'Europe/London')::date
  ) then raise exception 'Reviews open after the event has finished'; end if;
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.event_id is distinct from old.event_id
      or new.user_id is distinct from old.user_id or new.reviewer_name is distinct from old.reviewer_name
      or new.created_at is distinct from old.created_at then raise exception 'Protected review fields cannot be changed'; end if;
  else
    select nullif(btrim(regexp_replace(normalize(p.display_name,NFKC),'[[:cntrl:]]',' ','g')),'') into public_name from public.profiles p where p.id=member_id;
    new.reviewer_name := case when public_name is null or position('@' in public_name)>0 then 'ClassicsGo member' else left(public_name,80) end;
    new.created_at := clock_timestamp();
  end if;
  perform private.consume_review_write_limit();
  new.body := btrim(new.body);
  new.updated_at := case when tg_op='INSERT' then new.created_at else clock_timestamp() end;
  return new;
end;
$$;
revoke all on function private.guard_member_review_write() from public,anon,authenticated,service_role;
create trigger guard_member_review_write before insert or update on public.event_reviews for each row execute function private.guard_member_review_write();

create policy reviews_public_read on public.event_reviews for select to anon,authenticated using(
  exists(select 1 from public.events e where e.id=event_reviews.event_id and e.status='published'
    and coalesce(e.end_date,e.start_date) < (clock_timestamp() at time zone 'Europe/London')::date)
);
create policy reviews_owner_read on public.event_reviews for select to authenticated using((select auth.uid())=user_id);
create policy reviews_owner_insert on public.event_reviews for insert to authenticated with check(
  (select auth.uid())=user_id and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  and exists(select 1 from public.events e where e.id=event_reviews.event_id and e.status='published'
    and coalesce(e.end_date,e.start_date) < (clock_timestamp() at time zone 'Europe/London')::date)
);
create policy reviews_owner_update on public.event_reviews for update to authenticated
using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy reviews_owner_or_admin_delete on public.event_reviews for delete to authenticated
using((select auth.uid())=user_id or (select private.is_admin()));

create or replace function public.event_review_summary(p_event_id uuid)
returns table(review_count bigint,average_rating numeric)
language sql stable security invoker set search_path = '' as $$
  select count(*)::bigint,round(avg(r.rating)::numeric,1)
  from public.event_reviews r join public.events e on e.id=r.event_id
  where r.event_id=p_event_id and e.status='published'
    and coalesce(e.end_date,e.start_date) < (clock_timestamp() at time zone 'Europe/London')::date;
$$;
revoke all on function public.event_review_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.event_review_summary(uuid) to anon,authenticated;

-- Preserve the recent-session account export and include new review data.
-- Auth-user deletion cascades to both reviews and the private quota ledger.
create or replace function public.export_own_account_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_recent_auth(900);
begin
  return public.export_managed_account_data(member_id) || pg_catalog.jsonb_build_object(
    'published_events',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event) order by event.created_at)
      from public.events event where event.created_by=member_id),'[]'::jsonb),
    'event_reviews',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(review) order by review.created_at)
      from public.event_reviews review where review.user_id=member_id),'[]'::jsonb),
    'review_writing_limit',(select pg_catalog.to_jsonb(quota) from private.review_write_limits quota where quota.user_id=member_id)
  );
end;
$$;
revoke all on function public.export_own_account_data() from public,anon,authenticated,service_role;
grant execute on function public.export_own_account_data() to authenticated;

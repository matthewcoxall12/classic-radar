-- Signed-in members publish and maintain their own listings. Importer/admin paths remain unchanged.
alter table public.events add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists events_created_by_date_idx on public.events(created_by, created_at desc) where created_by is not null;

create or replace function private.guard_member_event_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare member_id uuid := auth.uid();
begin
  -- The existing SECURITY DEFINER attendance trigger updates going_count as its
  -- trusted owner. Direct API member writes always run as authenticated.
  if current_user not in ('authenticated','anon') or member_id is null or (select private.is_admin()) then return new; end if;
  if tg_op = 'INSERT' then
    if new.created_by is distinct from member_id then raise exception 'Event ownership is required'; end if;
    perform pg_advisory_xact_lock(hashtextextended(member_id::text, 58191));
    if (select count(*) from public.events where created_by = member_id and created_at > now() - interval '24 hours') >= 10 then
      raise exception 'daily publishing limit reached';
    end if;
    new.status := 'published';
    new.is_verified := false;
    new.confidence_score := 0;
    new.source_count := 0;
    new.going_count := 0;
    new.first_seen_at := now();
    new.created_at := now();
    new.last_checked_at := null;
  else
    if old.created_by is distinct from member_id or new.created_by is distinct from old.created_by then raise exception 'You cannot change this event'; end if;
    if old.status not in ('published','cancelled') or new.status not in ('published','cancelled') then raise exception 'This listing is managed by ClassicsGo'; end if;
    if new.id is distinct from old.id or new.slug is distinct from old.slug or new.dedupe_key is distinct from old.dedupe_key
      or new.is_verified is distinct from old.is_verified or new.confidence_score is distinct from old.confidence_score
      or new.source_count is distinct from old.source_count or new.going_count is distinct from old.going_count
      or new.first_seen_at is distinct from old.first_seen_at or new.created_at is distinct from old.created_at
      or new.last_checked_at is distinct from old.last_checked_at then raise exception 'Protected event fields cannot be changed'; end if;
  end if;
  if char_length(new.description) not between 30 and 6000
    or new.country_code <> 'GB' or new.timezone <> 'Europe/London'
    or coalesce(char_length(new.venue_name),0) not between 1 and 180
    or coalesce(char_length(new.address),0) not between 1 and 300
    or coalesce(char_length(new.town),0) not between 1 and 100
    or coalesce(char_length(new.county),0) > 100
    or coalesce(new.postcode,'') !~ '^(GIR 0AA|[A-PR-UWYZ][A-HK-Y]?[0-9][0-9A-HJKPSTUW]? [0-9][ABD-HJLNP-UW-Z]{2})$'
    or coalesce(char_length(new.organiser_name),0) not between 1 and 180
    or coalesce(char_length(new.price_text),0) not between 1 and 250
    or new.latitude is null or new.longitude is null
    or new.latitude not between 49 and 61.5 or new.longitude not between -8.5 and 2.5
    or new.event_type not in ('Classic car show','Cars & coffee','Club meet','Autojumble','Rally / road run','Motorsport','Museum / venue event','American / hot rod','Vintage / pre-war','Marque-specific')
    or new.start_date > current_date + interval '3 years'
    or (new.end_date is not null and new.end_date > current_date + interval '3 years')
    or (new.start_time is not null and new.end_time is not null and coalesce(new.end_date,new.start_date) = new.start_date and new.end_time < new.start_time)
    or (tg_op = 'INSERT' and new.start_date < current_date)
    or (new.booking_required and coalesce(new.booking_url,'') = '')
    or coalesce(new.organiser_url,'') !~ '^https?://[A-Za-z0-9.-]+\.[A-Za-z0-9-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    or char_length(new.organiser_url) > 1000
    or (new.booking_url is not null and (char_length(new.booking_url) > 1000 or new.booking_url !~ '^https?://[A-Za-z0-9.-]+\.[A-Za-z0-9-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'))
    then raise exception 'Please provide complete, valid event details'; end if;
  if new.image_url is not null and new.image_url not like
    'https://rnayhhsurmztrohtftqo.supabase.co/storage/v1/object/public/event-images/' || member_id::text || '/' || new.id::text || '/%' then raise exception 'Use an image uploaded for this event'; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_member_event_write() from public, anon, authenticated;
drop trigger if exists guard_member_event_write on public.events;
create trigger guard_member_event_write before insert or update on public.events for each row execute function private.guard_member_event_write();

create policy events_owner_read on public.events for select to authenticated using ((select auth.uid()) = created_by);
-- Retain shared event URLs and cancellation notices; search still explicitly
-- selects published listings. Draft/review/rejected events remain private.
create policy events_cancelled_public_read on public.events for select to anon, authenticated using (status = 'cancelled');
create policy events_owner_insert on public.events for insert to authenticated with check ((select auth.uid()) = created_by and status = 'published' and is_verified = false and confidence_score = 0 and source_count = 0 and going_count = 0);
create policy events_owner_update on public.events for update to authenticated using ((select auth.uid()) = created_by and status in ('published','cancelled')) with check ((select auth.uid()) = created_by and status in ('published','cancelled'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('event-images','event-images',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = true,file_size_limit = excluded.file_size_limit,allowed_mime_types = excluded.allowed_mime_types;
-- A narrow private aggregate avoids recursively querying storage.objects from
-- its own policy. No caller-supplied owner or bucket is accepted.
create or replace function private.can_upload_event_image() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare member_id uuid := auth.uid();
begin
  if member_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(member_id::text, 58192));
  return (select count(*) from storage.objects o where o.bucket_id = 'event-images'
    and (storage.foldername(o.name))[1] = member_id::text
    and o.created_at > now() - interval '24 hours') < 30;
end;
$$;
revoke all on function private.can_upload_event_image() from public, anon, authenticated;
grant execute on function private.can_upload_event_image() to authenticated;
create policy event_images_owner_read on storage.objects for select to authenticated using (bucket_id = 'event-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy event_images_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'event-images' and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name),1) = 2
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
  and (select private.can_upload_event_image())
);
create policy event_images_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'event-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

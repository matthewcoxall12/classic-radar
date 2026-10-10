-- Run after premium_wishlist_entitlements. All fixture writes roll back.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('de568f56-3a1b-4b76-a8f4-62742b4b0001', 'audit-free@classicsgo.invalid', '{}'),
 ('de568f56-3a1b-4b76-a8f4-62742b4b0002', 'audit-premium@classicsgo.invalid', '{}'),
 ('de568f56-3a1b-4b76-a8f4-62742b4b0003', 'audit-other@classicsgo.invalid', '{}');
update public.profiles set tier = 'roadbook', is_admin = false where id in ('de568f56-3a1b-4b76-a8f4-62742b4b0002', 'de568f56-3a1b-4b76-a8f4-62742b4b0003');
insert into public.events (id,title,slug,dedupe_key,event_type,start_date,status)
values ('de568f56-3a1b-4b76-a8f4-62742b4b0010','Transactional membership audit','transactional-membership-audit','transactional-membership-audit','Classic car show','2027-06-01','published');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"de568f56-3a1b-4b76-a8f4-62742b4b0001","role":"authenticated"}',true);
do $$ begin
  if private.has_roadbook() then raise exception 'Free user incorrectly entitled'; end if;
  if has_column_privilege('authenticated','public.profiles','tier','UPDATE') or has_column_privilege('authenticated','public.profiles','is_admin','UPDATE') then raise exception 'Membership/admin privilege escalation possible'; end if;
  begin
    insert into public.saved_events (user_id,event_id) values ('de568f56-3a1b-4b76-a8f4-62742b4b0001','de568f56-3a1b-4b76-a8f4-62742b4b0010');
    raise exception 'Free wishlist write was allowed';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.event_attendance (user_id,event_id) values ('de568f56-3a1b-4b76-a8f4-62742b4b0001','de568f56-3a1b-4b76-a8f4-62742b4b0010');
do $$ begin
  if (select going_count from public.events where id='de568f56-3a1b-4b76-a8f4-62742b4b0010') <> 1 then raise exception 'Going count did not increment'; end if;
end $$;
delete from public.event_attendance where event_id='de568f56-3a1b-4b76-a8f4-62742b4b0010';
do $$ begin
  if (select going_count from public.events where id='de568f56-3a1b-4b76-a8f4-62742b4b0010') <> 0 then raise exception 'Going count did not decrement'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"de568f56-3a1b-4b76-a8f4-62742b4b0002","role":"authenticated"}',true);
insert into public.saved_events (user_id,event_id) values ('de568f56-3a1b-4b76-a8f4-62742b4b0002','de568f56-3a1b-4b76-a8f4-62742b4b0010');
-- IDs and share tokens use defaults because API grants intentionally prohibit custom values.
insert into public.roadbooks (user_id,name,description,is_shared) values ('de568f56-3a1b-4b76-a8f4-62742b4b0002','Audit weekend','Public weekend summary',true);
select set_config('classicsgo.audit_book',(select id::text from public.roadbooks where name='Audit weekend'),true);
select set_config('classicsgo.audit_token',(select share_token::text from public.roadbooks where name='Audit weekend'),true);
insert into public.roadbook_events (roadbook_id,event_id,position,notes) values (current_setting('classicsgo.audit_book')::uuid,'de568f56-3a1b-4b76-a8f4-62742b4b0010',1,'PRIVATE STOP NOTE');
do $$ begin
  if not private.has_roadbook() or (select count(*) from public.saved_events) <> 1 then raise exception 'Premium wishlist failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"de568f56-3a1b-4b76-a8f4-62742b4b0003","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.saved_events) or exists(select 1 from public.roadbooks) then raise exception 'Private plans visible to another member'; end if;
end $$;
reset role;
update public.profiles set subscription_status='trialing',subscription_expires_at=now()-interval '1 minute' where id='de568f56-3a1b-4b76-a8f4-62742b4b0002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"de568f56-3a1b-4b76-a8f4-62742b4b0002","role":"authenticated"}',true);
do $$ begin
  if private.has_roadbook() or exists(select 1 from public.saved_events) then raise exception 'Expired membership retains premium access'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  if public.get_shared_roadbook(current_setting('classicsgo.audit_token')::uuid) is not null then raise exception 'Expired owner still shares premium plans'; end if;
  if has_table_privilege('anon','public.roadbooks','SELECT') or has_table_privilege('anon','public.roadbook_events','SELECT') then raise exception 'Guest can query private trip tables'; end if;
  if has_any_column_privilege('anon','public.roadbooks','SELECT') or has_any_column_privilege('anon','public.roadbook_events','SELECT') then raise exception 'Guest retains raw trip column grants'; end if;
end $$;
reset role;
update public.profiles set subscription_status=null,subscription_expires_at=null where id='de568f56-3a1b-4b76-a8f4-62742b4b0002';
set local role anon;
do $$ declare shared jsonb; begin
  shared := public.get_shared_roadbook(current_setting('classicsgo.audit_token')::uuid);
  if shared is null or jsonb_array_length(shared->'events') <> 1 then raise exception 'Shared plan unavailable'; end if;
  if shared::text like '%PRIVATE STOP NOTE%' then raise exception 'Private stop notes leaked'; end if;
  if public.get_shared_roadbook('de568f56-3a1b-4b76-a8f4-62742b4b0099') is not null then raise exception 'Wrong share token accepted'; end if;
end $$;
reset role;
update public.roadbooks set is_shared=false where id=current_setting('classicsgo.audit_book')::uuid;
set local role anon;
do $$ begin
  if public.get_shared_roadbook(current_setting('classicsgo.audit_token')::uuid) is not null then raise exception 'Unshared plan remains accessible'; end if;
end $$;
rollback;

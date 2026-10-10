-- Run only after member_event_reviews migration. Every fixture is rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('fd200000-0000-4000-8000-000000000001','review-owner-qa@example.invalid','{}'),
 ('fd200000-0000-4000-8000-000000000002','review-other-qa@example.invalid','{}');
update public.profiles set display_name='Review QA Member' where id='fd200000-0000-4000-8000-000000000001';
update public.profiles set display_name='private-email＠example.invalid' where id='fd200000-0000-4000-8000-000000000002';
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('fd200000-0000-4000-8000-000000000020','fd200000-0000-4000-8000-000000000001',now(),now()),
 ('fd200000-0000-4000-8000-000000000021','fd200000-0000-4000-8000-000000000002',now(),now());
insert into public.events(id,title,slug,dedupe_key,description,event_type,start_date,end_date,status) values
 ('fd200000-0000-4000-8000-000000000010','Completed review QA','completed-review-qa','completed-review-qa','Synthetic rollback-only event.','Club meet',(now() at time zone 'Europe/London')::date-2,null,'published'),
 ('fd200000-0000-4000-8000-000000000011','Future review QA','future-review-qa','future-review-qa','Synthetic rollback-only event.','Club meet',(now() at time zone 'Europe/London')::date+1,null,'published'),
 ('fd200000-0000-4000-8000-000000000012','Today review QA','today-review-qa','today-review-qa','Synthetic rollback-only event.','Club meet',(now() at time zone 'Europe/London')::date,null,'published'),
 ('fd200000-0000-4000-8000-000000000013','Multi-day review QA','multiday-review-qa','multiday-review-qa','Synthetic rollback-only event.','Club meet',(now() at time zone 'Europe/London')::date-2,(now() at time zone 'Europe/London')::date,'published'),
 ('fd200000-0000-4000-8000-000000000014','Cancelled review QA','cancelled-review-qa','cancelled-review-qa','Synthetic rollback-only event.','Club meet',(now() at time zone 'Europe/London')::date-2,null,'cancelled');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fd200000-0000-4000-8000-000000000001","session_id":"fd200000-0000-4000-8000-000000000020","role":"authenticated"}',true);
do $$
declare event_key uuid; blocked boolean; i integer;
begin
  insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010','fd200000-0000-4000-8000-000000000001',5,'Friendly marshals, good facilities and a lovely range of classics.');
  if not exists(select 1 from public.event_reviews where user_id=auth.uid() and reviewer_name='Review QA Member' and created_at=updated_at) then raise exception 'Authoritative name or new-review timestamp failed'; end if;
  if jsonb_array_length(public.export_own_account_data()->'event_reviews')<>1 then raise exception 'Own review missing from account export'; end if;
  if not (public.export_own_account_data() ? 'published_events') then raise exception 'Published-event export was lost'; end if;
  blocked:=false;
  begin insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010',auth.uid(),4,'Trying to create a second review for the same event.'); exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Duplicate member/event review accepted'; end if;
  foreach event_key in array array['fd200000-0000-4000-8000-000000000011'::uuid,'fd200000-0000-4000-8000-000000000012','fd200000-0000-4000-8000-000000000013','fd200000-0000-4000-8000-000000000014'] loop
    blocked:=false;
    begin insert into public.event_reviews(event_id,user_id,rating,body) values(event_key,auth.uid(),5,'A premature or cancelled-event review that must be rejected.'); exception when others then blocked:=true; end;
    if not blocked then raise exception 'Unfinished/cancelled event accepted review %',event_key; end if;
  end loop;
  blocked:=false;
  begin update public.event_reviews set rating=0 where user_id=auth.uid(); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Invalid rating accepted'; end if;
  blocked:=false;
  begin update public.event_reviews set body='Too short' where user_id=auth.uid(); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Short review accepted'; end if;
  blocked:=false;
  begin update public.event_reviews set reviewer_name='Forged reviewer' where user_id=auth.uid(); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Caller forged display name'; end if;
  blocked:=false;
  begin update public.event_reviews set created_at='2000-01-01' where user_id=auth.uid(); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Caller forged creation time'; end if;
  blocked:=false;
  begin update public.event_reviews set user_id='fd200000-0000-4000-8000-000000000002' where user_id=auth.uid(); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Caller reassigned author'; end if;
  blocked:=false;
  begin update public.event_reviews set event_id='fd200000-0000-4000-8000-000000000011' where user_id=auth.uid(); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Caller reassigned reviewed event'; end if;
  update public.event_reviews set rating=3,body='An enjoyable gathering, although parking signs could have been clearer.' where user_id=auth.uid();
  if not exists(select 1 from public.event_review_summary('fd200000-0000-4000-8000-000000000010') where review_count=1 and average_rating=3) then raise exception 'Aggregate failed after owner edit'; end if;
  -- Initial insert + one successful edit = two writes. Fill the quota to 25.
  for i in 1..23 loop update public.event_reviews set body='Useful quota test review edit number '||i||' with enough characters.' where user_id=auth.uid(); end loop;
  blocked:=false;
  begin update public.event_reviews set body='This twenty-sixth review write must be rejected by the quota.' where user_id=auth.uid(); exception when others then if sqlerrm like '%daily review writing limit%' then blocked:=true; else raise; end if; end;
  if not blocked then raise exception 'Daily review write quota failed'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"fd200000-0000-4000-8000-000000000002","session_id":"fd200000-0000-4000-8000-000000000021","role":"authenticated"}',true);
do $$
declare affected integer; blocked boolean:=false;
begin
  update public.event_reviews set rating=1 where user_id='fd200000-0000-4000-8000-000000000001';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Other member changed review'; end if;
  delete from public.event_reviews where user_id='fd200000-0000-4000-8000-000000000001';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Other member deleted review'; end if;
  begin insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010','fd200000-0000-4000-8000-000000000001',1,'Trying to impersonate another reviewer with a valid-length body.'); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Reviewer impersonation accepted'; end if;
  insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010',auth.uid(),4,'Great atmosphere and friendly people throughout the meet.');
  if not exists(select 1 from public.event_reviews where user_id=auth.uid() and reviewer_name='ClassicsGo member') then raise exception 'Email-like profile name was exposed'; end if;
  if jsonb_array_length(public.export_own_account_data()->'event_reviews')<>1 or public.export_own_account_data()->'event_reviews'->0->>'user_id'<>auth.uid()::text then raise exception 'Account export omitted own review or exposed another reviewer'; end if;
  if not exists(select 1 from public.event_review_summary('fd200000-0000-4000-8000-000000000010') where review_count=2 and average_rating=3.5) then raise exception 'Accurate average/count failed'; end if;
end;
$$;
set local role anon;
do $$
declare blocked boolean:=false;
begin
  if (select count(*) from public.event_reviews where event_id='fd200000-0000-4000-8000-000000000010')<>2 then raise exception 'Public completed-event reviews missing'; end if;
  if exists(select 1 from public.event_reviews where position('@' in reviewer_name)>0 or position('＠' in reviewer_name)>0) then raise exception 'Email appeared as public display name'; end if;
  begin insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010','fd200000-0000-4000-8000-000000000002',4,'Anonymous callers must never be allowed to publish a review.'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Unauthenticated insert accepted'; end if;
  blocked:=false;
  begin perform user_id from public.event_reviews limit 1; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Anonymous caller read private auth UUID'; end if;
end;
$$;
reset role;
-- If an event is withdrawn or rescheduled, public opinions and aggregates hide.
update public.events set status='review' where id='fd200000-0000-4000-8000-000000000010';
set local role anon;
do $$
begin
  if exists(select 1 from public.event_reviews where event_id='fd200000-0000-4000-8000-000000000010') then raise exception 'Reviews leaked on withdrawn event'; end if;
  if not exists(select 1 from public.event_review_summary('fd200000-0000-4000-8000-000000000010') where review_count=0 and average_rating is null) then raise exception 'Withdrawn event aggregate leaked'; end if;
end;
$$;
reset role;
update public.events set status='published',start_date=(now() at time zone 'Europe/London')::date+1 where id='fd200000-0000-4000-8000-000000000010';
set local role anon;
do $$
begin
  if exists(select 1 from public.event_reviews where event_id='fd200000-0000-4000-8000-000000000010') then raise exception 'Reviews leaked on rescheduled future event'; end if;
end;
$$;
reset role;
update public.events set start_date=(now() at time zone 'Europe/London')::date-2 where id='fd200000-0000-4000-8000-000000000010';
-- Persistent quota cannot be evaded by deleting/reposting.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fd200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
delete from public.event_reviews where user_id=auth.uid();
do $$
declare blocked boolean:=false;
begin
  begin insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010',auth.uid(),5,'Reposting after deletion should still respect the writing quota.'); exception when others then if sqlerrm like '%daily review writing limit%' then blocked:=true; else raise; end if; end;
  if not blocked then raise exception 'Delete/repost bypassed quota'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"fd200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
delete from public.event_reviews where user_id=auth.uid();
do $$ begin if exists(select 1 from public.event_reviews where event_id='fd200000-0000-4000-8000-000000000010') then raise exception 'Own review deletion failed'; end if; end; $$;
insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010',auth.uid(),4,'Review fixture for checking removal by a moderator.');
reset role;
update public.profiles set is_admin=true where id='fd200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fd200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
delete from public.event_reviews where user_id='fd200000-0000-4000-8000-000000000002';
do $$ begin if exists(select 1 from public.event_reviews where user_id='fd200000-0000-4000-8000-000000000002') then raise exception 'Administrator could not moderate review'; end if; end; $$;
select set_config('request.jwt.claims','{"sub":"fd200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.event_reviews(event_id,user_id,rating,body) values('fd200000-0000-4000-8000-000000000010',auth.uid(),4,'Review fixture for checking account deletion cleanup.');
reset role;
delete from auth.users where id='fd200000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.event_reviews where user_id='fd200000-0000-4000-8000-000000000002') then raise exception 'Account deletion left review author data'; end if;
  if exists(select 1 from private.review_write_limits where user_id='fd200000-0000-4000-8000-000000000002') then raise exception 'Account deletion left review quota data'; end if;
end; $$;
rollback;
select 'PASS: completed-only UK eligibility, one review per member/event, owner edits/deletion, no impersonation or forged fields, bounded text/rating, public names without email, correct aggregates, hidden withdrawn/future-event reviews, persistent quota, anonymous read-only. All fixtures rolled back.' as result;

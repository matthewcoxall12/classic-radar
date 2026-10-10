-- Run only against the intended project after migration; all mutations roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values ('fd100000-0000-4000-8000-000000000010','event-owner-qa@example.invalid','{}'::jsonb),('fd100000-0000-4000-8000-000000000011','event-other-qa@example.invalid','{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fd100000-0000-4000-8000-000000000010","role":"authenticated"}',true);
do $$
declare blocked boolean := false; i integer;
begin
  insert into public.events(id,title,slug,dedupe_key,description,event_type,start_date,venue_name,address,town,postcode,latitude,longitude,price_text,organiser_name,organiser_url,created_by,status,is_verified,confidence_score,source_count,going_count)
  values ('fd100000-0000-4000-8000-000000000001','Rollback publishing test','rollback-publishing-test','rollback-publishing-test','A valid rollback-only classic car event used to check member publication.','Club meet',current_date+1,'Test hall','Test Street','Cullompton','EX15 1QP',50.87,-3.38,'Free','Test club','https://example.com/events','fd100000-0000-4000-8000-000000000010','review',true,100,9,100);
  if not exists (select 1 from public.events where id='fd100000-0000-4000-8000-000000000001' and status='published' and not is_verified and confidence_score=0 and source_count=0 and going_count=0) then raise exception 'Member publishing did not enforce safe metadata'; end if;
  update public.events set title='Edited rollback test' where id='fd100000-0000-4000-8000-000000000001';
  update public.events set status='cancelled' where id='fd100000-0000-4000-8000-000000000001';
  if not exists(select 1 from public.events where id='fd100000-0000-4000-8000-000000000001' and status='cancelled') then raise exception 'Owner cancellation or own read failed'; end if;
  update public.events set status='published' where id='fd100000-0000-4000-8000-000000000001';
  begin update public.events set is_verified=true where id='fd100000-0000-4000-8000-000000000001'; exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member forged verification'; end if;
  blocked:=false;
  begin update public.events set created_by='fd100000-0000-4000-8000-000000000011' where id='fd100000-0000-4000-8000-000000000001'; exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member reassigned ownership'; end if;
  blocked:=false;
  begin update public.events set postcode='AAAAA' where id='fd100000-0000-4000-8000-000000000001'; exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member saved invalid postcode'; end if;
  blocked:=false;
  begin update public.events set latitude=0 where id='fd100000-0000-4000-8000-000000000001'; exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member saved coordinates outside UK'; end if;
  blocked:=false;
  begin update public.events set venue_name=null where id='fd100000-0000-4000-8000-000000000001'; exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member removed required venue'; end if;
  blocked:=false;
  begin update public.events set start_time='12:00',end_time='11:00' where id='fd100000-0000-4000-8000-000000000001'; exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member saved reversed times'; end if;
  blocked:=false;
  begin update public.events set organiser_url='https://user:pass@example.com' where id='fd100000-0000-4000-8000-000000000001'; exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member saved credential URL'; end if;
  for i in 2..10 loop
    insert into public.events(title,slug,dedupe_key,description,event_type,start_date,venue_name,address,town,postcode,latitude,longitude,price_text,organiser_name,organiser_url,created_by)
    select title,'rollback-publishing-test-'||i,'rollback-publishing-test-'||i,description,event_type,start_date,venue_name,address,town,postcode,latitude,longitude,price_text,organiser_name,organiser_url,created_by from public.events where id='fd100000-0000-4000-8000-000000000001';
  end loop;
  blocked:=false;
  begin
    insert into public.events(title,slug,dedupe_key,description,event_type,start_date,venue_name,address,town,postcode,latitude,longitude,price_text,organiser_name,organiser_url,created_by)
    select title,'rollback-publishing-test-11','rollback-publishing-test-11',description,event_type,start_date,venue_name,address,town,postcode,latitude,longitude,price_text,organiser_name,organiser_url,created_by from public.events where id='fd100000-0000-4000-8000-000000000001';
  exception when others then if sqlerrm like '%daily publishing limit%' then blocked:=true; else raise; end if; end;
  if not blocked then raise exception 'Member exceeded publishing quota'; end if;
end;
$$;
update public.events set status='cancelled' where id='fd100000-0000-4000-8000-000000000001';
set local role anon;
do $$
begin
  if not exists(select 1 from public.events where id='fd100000-0000-4000-8000-000000000001' and status='cancelled') then raise exception 'Cancelled public page unavailable to visitors'; end if;
  if exists(select 1 from public.events where id='fd100000-0000-4000-8000-000000000001' and status='published') then raise exception 'Cancelled event appears in published directory query'; end if;
end;
$$;
set local role authenticated;
update public.events set status='published' where id='fd100000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"fd100000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$
declare touched integer; blocked boolean:=false;
begin
  update public.events set title='Malicious other-owner edit' where id='fd100000-0000-4000-8000-000000000001';
  get diagnostics touched=row_count;
  if touched<>0 then raise exception 'Other member edited event'; end if;
  insert into public.event_attendance(user_id,event_id) values('fd100000-0000-4000-8000-000000000011','fd100000-0000-4000-8000-000000000001');
  if not exists(select 1 from public.events where id='fd100000-0000-4000-8000-000000000001' and going_count=1) then raise exception 'Going count did not increment'; end if;
  delete from public.event_attendance where user_id='fd100000-0000-4000-8000-000000000011' and event_id='fd100000-0000-4000-8000-000000000001';
  if not exists(select 1 from public.events where id='fd100000-0000-4000-8000-000000000001' and going_count=0) then raise exception 'Going count did not decrement'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('event-images','fd100000-0000-4000-8000-000000000010/fd100000-0000-4000-8000-000000000001/image.jpg');
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Other member uploaded into owner folder'; end if;
  insert into storage.objects(bucket_id,name) values('event-images','fd100000-0000-4000-8000-000000000011/fd100000-0000-4000-8000-000000000002/image.jpg');
  if not exists(select 1 from storage.objects where bucket_id='event-images' and name='fd100000-0000-4000-8000-000000000011/fd100000-0000-4000-8000-000000000002/image.jpg') then raise exception 'Owner cannot read own image metadata'; end if;
  -- Supabase storage.protect_delete intentionally rejects direct SQL DELETE.
  -- Object deletion must use the authenticated Storage API. Rollback removes
  -- this synthetic metadata fixture without disabling that protection.
end;
$$;
reset role;
rollback;
select 'PASS: owner publish/edit/cancel, anti-forgery, date/postcode/URL validation, rate limit, cross-owner isolation, going counts, storage own-folder access. All test changes rolled back.' as result;


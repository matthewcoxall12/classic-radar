-- Full caller-role integration. Synthetic records only; no email services.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-4000-8000-000000000010','account-rpc-qa@example.invalid','{}'),
('00000000-0000-4000-8000-000000000011','other-account-rpc-qa@example.invalid','{}');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000010',now(),now());
insert into public.events(id,title,slug,dedupe_key,event_type,start_date,status,created_by) values
('00000000-0000-4000-8000-000000000013','Export fixture one','account-export-qa-one','account-export-qa-one','Club meet',current_date+1,'published','00000000-0000-4000-8000-000000000010'),
('00000000-0000-4000-8000-000000000014','Export fixture two','account-export-qa-two','account-export-qa-two','Club meet',current_date+1,'published','00000000-0000-4000-8000-000000000011');
select set_config('request.jwt.claims',json_build_object(
  'sub','00000000-0000-4000-8000-000000000010','session_id','00000000-0000-4000-8000-000000000012','role','authenticated',
  'amr',json_build_array(json_build_object('method','oauth','timestamp',extract(epoch from now())::bigint))
)::text,true);
set local role authenticated;
do $test$
declare payload jsonb; blocked boolean := false;
begin
  payload := public.export_own_account_data();
  if payload->'account'->>'id' <> '00000000-0000-4000-8000-000000000010'
    or payload->'profile'->>'id' <> '00000000-0000-4000-8000-000000000010'
    or jsonb_array_length(payload->'published_events') <> 1
    or payload->'published_events'->0->>'id' <> '00000000-0000-4000-8000-000000000013'
    or payload::text like '%other-account-rpc-qa%' then
    raise exception 'Account export was not limited to the caller';
  end if;
  begin perform public.export_managed_account_data('00000000-0000-4000-8000-000000000011');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Member called arbitrary-user export'; end if;
  blocked := false;
  begin perform public.delete_managed_account('00000000-0000-4000-8000-000000000011','DELETE');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Member called arbitrary-user deletion'; end if;
  blocked := false;
  begin perform private.require_recent_auth(900);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Member called privileged auth-table helper'; end if;
  blocked := false;
  begin perform public.delete_own_account(null);
  exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'Null confirmation was accepted'; end if;
end;
$test$;
reset role;
update public.profiles set is_admin=true where id='00000000-0000-4000-8000-000000000010';
set local role authenticated;
do $test$
begin
  begin perform public.delete_own_account('DELETE'); raise exception 'Administrator deletion accepted';
  exception when insufficient_privilege then
    if sqlerrm not like '%Administrator%' then raise; end if;
  end;
end;
$test$;
reset role;
update public.profiles set is_admin=false,tier='roadbook' where id='00000000-0000-4000-8000-000000000010';
set local role authenticated;
do $test$
begin
  begin perform public.delete_own_account('DELETE'); raise exception 'Paid account deletion accepted';
  exception when insufficient_privilege then
    if sqlerrm not like '%paid membership%' then raise; end if;
  end;
end;
$test$;
reset role;
update public.profiles set tier='free' where id='00000000-0000-4000-8000-000000000010';
update auth.sessions set created_at=now()-interval '2 hours'
where id='00000000-0000-4000-8000-000000000012';
select set_config('request.jwt.claims',json_build_object(
  'sub','00000000-0000-4000-8000-000000000010','session_id','00000000-0000-4000-8000-000000000012','role','authenticated',
  'amr',json_build_array(json_build_object('method','oauth','timestamp',extract(epoch from now()-interval '2 hours')::bigint))
)::text,true);
set local role authenticated;
do $test$
begin
  begin perform public.export_own_account_data(); raise exception 'Stale export accepted';
  exception when sqlstate '28000' then null; end;
  begin perform public.delete_own_account('DELETE'); raise exception 'Stale deletion accepted';
  exception when sqlstate '28000' then null; end;
end;
$test$;
reset role;
update auth.sessions set created_at=now() where id='00000000-0000-4000-8000-000000000012';
set local role authenticated;
-- Fresh session timestamp is sufficient even when an earlier AMR was supplied.
select public.delete_own_account('DELETE');
reset role;
do $test$
begin
  if exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000010')
    or exists(select 1 from auth.sessions where id='00000000-0000-4000-8000-000000000012')
    or not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000011') then
    raise exception 'Own deletion/session revocation was not isolated';
  end if;
  if not exists(select 1 from public.events where id='00000000-0000-4000-8000-000000000013' and created_by is null) then
    raise exception 'Public listing was not retained without the deleted owner';
  end if;
end;
$test$;
set local role authenticated;
do $test$
begin
  begin perform public.export_own_account_data(); raise exception 'Deleted session export accepted';
  exception when sqlstate '28000' then null; end;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
  begin perform public.export_own_account_data(); raise exception 'Anonymous export accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_own_account('DELETE'); raise exception 'Anonymous deletion accepted';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
rollback;
select 'PASS: authenticated own export/delete, isolation, managed-RPC denial, confirmation, freshness and revoked session checks. Synthetic changes rolled back.' as result;

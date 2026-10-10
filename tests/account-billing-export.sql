-- Run as postgres after export_own_billing_account_data. Synthetic fixtures only.
-- No external Stripe requests; every fixture is rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('fd300000-0000-4000-8000-000000000001','billing-export-alpha@example.invalid','{}'),
('fd300000-0000-4000-8000-000000000002','billing-export-beta@example.invalid','{}');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('fd300000-0000-4000-8000-000000000003','fd300000-0000-4000-8000-000000000001',now(),now()),
('fd300000-0000-4000-8000-000000000004','fd300000-0000-4000-8000-000000000002',now(),now());
insert into private.billing_customers(user_id,customer_id,subscription_id,subscription_status,expires_at,cancel_at_period_end) values
('fd300000-0000-4000-8000-000000000001','cus_exportAlpha','sub_exportAlpha','active',now()+interval '1 year',false),
('fd300000-0000-4000-8000-000000000002','cus_exportBeta','sub_exportBeta','canceled',now()-interval '1 day',true);
insert into private.billing_webhook_events(event_id,user_id) values
('evt_exportAlpha','fd300000-0000-4000-8000-000000000001'),
('evt_exportBeta','fd300000-0000-4000-8000-000000000002');

select set_config('request.jwt.claims',json_build_object(
 'sub','fd300000-0000-4000-8000-000000000001','session_id','fd300000-0000-4000-8000-000000000003','role','authenticated',
 'amr',json_build_array(json_build_object('method','oauth','timestamp',extract(epoch from now())::bigint))
)::text,true);
set local role authenticated;
do $test$
declare exported jsonb; account_keys text[]; event_keys text[];
begin
 exported := public.export_own_account_data();
 if exported->'billing_account'->>'customer_id'<>'cus_exportAlpha'
    or exported->'billing_account'->>'subscription_id'<>'sub_exportAlpha'
    or exported->'billing_account'->>'subscription_status'<>'active'
    or exported->'billing_account'->>'cancel_at_period_end'<>'false'
    or exported->'billing_account'->>'expires_at' is null
    or exported->'billing_account'->>'updated_at' is null then
   raise exception 'Own billing account incomplete';
 end if;
 select array_agg(key order by key) into account_keys from jsonb_object_keys(exported->'billing_account') key;
 if account_keys is distinct from array['cancel_at_period_end','customer_id','expires_at','subscription_id','subscription_status','updated_at'] then
   raise exception 'Operational billing fields exposed';
 end if;
 if jsonb_array_length(exported->'billing_events')<>1
    or exported->'billing_events'->0->>'event_id'<>'evt_exportAlpha'
    or exported->'billing_events'->0->>'processed_at' is null then
   raise exception 'Own billing events incomplete or another customer included';
 end if;
 select array_agg(key order by key) into event_keys from jsonb_object_keys(exported->'billing_events'->0) key;
 if event_keys is distinct from array['event_id','processed_at'] then raise exception 'Unexpected webhook data exposed'; end if;
 if exported::text like '%exportBeta%' then raise exception 'Another customer leaked in account export'; end if;
 if not exported ?& array['published_events','event_reviews','review_writing_limit'] then raise exception 'Existing export sections lost'; end if;
 if exported->'account'->>'id'<>'fd300000-0000-4000-8000-000000000001' then raise exception 'Managed account export lost'; end if;
 begin perform 1 from private.billing_customers; raise exception 'Direct customer table read allowed';
 exception when insufficient_privilege then null; end;
 begin perform 1 from private.billing_webhook_events; raise exception 'Direct webhook table read allowed';
 exception when insufficient_privilege then null; end;
 begin perform public.export_managed_account_data('fd300000-0000-4000-8000-000000000002'); raise exception 'Arbitrary account export allowed';
 exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
select set_config('request.jwt.claims',json_build_object(
 'sub','fd300000-0000-4000-8000-000000000002','session_id','fd300000-0000-4000-8000-000000000004','role','authenticated',
 'amr',json_build_array(json_build_object('method','oauth','timestamp',extract(epoch from now())::bigint))
)::text,true);
set local role authenticated;
do $test$
declare exported jsonb;
begin
 exported := public.export_own_account_data();
 if exported->'billing_account'->>'customer_id'<>'cus_exportBeta'
    or exported->'billing_account'->>'cancel_at_period_end'<>'true'
    or exported->'billing_events'->0->>'event_id'<>'evt_exportBeta'
    or jsonb_array_length(exported->'billing_events')<>1
    or exported::text like '%exportAlpha%' then raise exception 'Second member billing isolation failed'; end if;
end;
$test$;
reset role;
delete from private.billing_webhook_events where user_id='fd300000-0000-4000-8000-000000000002';
delete from private.billing_customers where user_id='fd300000-0000-4000-8000-000000000002';
set local role authenticated;
do $test$
declare exported jsonb;
begin
 exported := public.export_own_account_data();
 if exported->'billing_account' is distinct from 'null'::jsonb or exported->'billing_events' is distinct from '[]'::jsonb then
   raise exception 'Member without billing received another account or events';
 end if;
end;
$test$;
reset role;
delete from auth.sessions where id='fd300000-0000-4000-8000-000000000004';
set local role authenticated;
do $test$
begin
 begin perform public.export_own_account_data(); raise exception 'Revoked session exported billing data';
 exception when invalid_authorization_specification then null; end;
end;
$test$;
reset role;
do $test$
begin
 if has_function_privilege('anon','public.export_own_account_data()','EXECUTE')
   or has_function_privilege('service_role','public.export_own_account_data()','EXECUTE') then
   raise exception 'Own export exposed to non-member roles';
 end if;
end;
$test$;
rollback;

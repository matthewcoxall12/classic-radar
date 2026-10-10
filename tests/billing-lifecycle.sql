-- Run as postgres after stripe_billing_lifecycle. No Stripe/API/email requests.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-4000-8000-000000000030','billing-qa@example.invalid','{}'),
('00000000-0000-4000-8000-000000000031','manual-billing-qa@example.invalid','{}');
update public.profiles set tier='roadbook',subscription_status=null where id='00000000-0000-4000-8000-000000000031';
set local role service_role;
select public.billing_bind_customer('00000000-0000-4000-8000-000000000030','cus_qa');
select public.billing_bind_customer('00000000-0000-4000-8000-000000000031','cus_manual');
do $test$
declare lease jsonb; again jsonb; renewed jsonb; blocked boolean := false;
begin
 lease := public.billing_acquire_checkout('00000000-0000-4000-8000-000000000030');
 if lease is null then raise exception 'Checkout lease not acquired'; end if;
 if public.billing_acquire_checkout('00000000-0000-4000-8000-000000000030') is not null then raise exception 'Concurrent cross-plan checkout accepted'; end if;
 perform public.billing_release_checkout('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000099');
 if public.billing_acquire_checkout('00000000-0000-4000-8000-000000000030') is not null then raise exception 'Wrong lease released reservation'; end if;
 perform public.billing_release_checkout('00000000-0000-4000-8000-000000000030',(lease->>'lock_id')::uuid);
 again := public.billing_acquire_checkout('00000000-0000-4000-8000-000000000030');
 if again->>'generation'<>lease->>'generation' then raise exception 'Ambiguous retry changed idempotency generation'; end if;
 begin perform public.billing_advance_checkout('00000000-0000-4000-8000-000000000030',(lease->>'lock_id')::uuid);
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Old lease advanced checkout generation'; end if;
 if public.billing_advance_checkout('00000000-0000-4000-8000-000000000030',(again->>'lock_id')::uuid)::text=again->>'generation' then raise exception 'Known closed session did not rotate generation'; end if;
 perform public.billing_release_checkout('00000000-0000-4000-8000-000000000030',(again->>'lock_id')::uuid);
end;
$test$;
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at) values
('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000030',now(),now());
select set_config('request.jwt.claims',json_build_object(
 'sub','00000000-0000-4000-8000-000000000030','session_id','00000000-0000-4000-8000-000000000032','role','authenticated',
 'amr',json_build_array(json_build_object('method','oauth','timestamp',extract(epoch from now())::bigint))
)::text,true);
set local role authenticated;
do $test$
begin
 begin perform public.delete_own_account('DELETE'); raise exception 'Pending Checkout account deleted';
 exception when insufficient_privilege then
  if sqlerrm not like '%linked billing%' then raise; end if;
 end;
 begin perform public.billing_acquire_checkout('00000000-0000-4000-8000-000000000030'); raise exception 'Public checkout lease accepted';
 exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
set local role service_role;
select public.billing_apply_subscription('evt_qa1',100,now(),'cus_qa','sub_qa',1,'active',now()+interval '1 year',false);
reset role;
do $test$
begin
 if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000030' and tier='roadbook' and subscription_status='active') then raise exception 'Active billing did not grant membership'; end if;
 if has_function_privilege('authenticated','public.billing_bind_customer(uuid,text)','execute')
   or has_function_privilege('anon','public.billing_apply_subscription(text,bigint,timestamptz,text,text,bigint,text,timestamptz,boolean)','execute') then raise exception 'Billing privileges leaked'; end if;
end;
$test$;
set local role service_role;
do $test$
begin
 if public.billing_apply_subscription('evt_qa1',100,now(),'cus_qa','sub_qa',1,'canceled',now(),false)<>'duplicate' then raise exception 'Duplicate event accepted'; end if;
 if public.billing_apply_subscription('evt_old',99,now(),'cus_qa','sub_qa',1,'canceled',now(),false)<>'stale' then raise exception 'Old event overwrote membership'; end if;
end;
$test$;
select public.billing_apply_subscription('evt_cancelend',101,now(),'cus_qa','sub_qa',1,'active',now()+interval '1 year',true);
reset role;
do $test$
begin
 if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000030' and tier='roadbook') then raise exception 'Scheduled cancellation ended paid access early'; end if;
end;
$test$;
set local role service_role;
select public.billing_apply_subscription('evt_cancelled',102,now(),'cus_qa','sub_qa',1,'canceled',now()+interval '1 year',false);
select public.billing_apply_subscription('evt_newsub',103,now(),'cus_qa','sub_new',2,'active',now()+interval '1 year',false);
do $test$
begin
 if public.billing_apply_subscription('evt_oldcancel',104,now(),'cus_qa','sub_qa',1,'canceled',now(),false)<>'stale' then raise exception 'Old subscription canceled new subscription'; end if;
end;
$test$;
do $test$
begin
 if public.billing_apply_subscription('evt_equalcancel',104,now(),'cus_qa','sub_other',2,'canceled',now(),false)<>'stale' then raise exception 'Same-second old subscription overwrote active subscription'; end if;
end;
$test$;
select public.billing_apply_subscription('evt_unpaid' ,105,now(),'cus_qa','sub_new',2,'unpaid',now()+interval '1 year',false);
select public.billing_apply_subscription('evt_manual',100,now(),'cus_manual','sub_manual',1,'canceled',now(),false);
reset role;
do $test$
begin
 if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000030' and tier='free' and subscription_status='unpaid') then raise exception 'Unpaid membership retained access'; end if;
 if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000031' and tier='roadbook' and subscription_status is null) then raise exception 'Manual early access was overwritten'; end if;
end;
$test$;
rollback;
select 'PASS: service-only billing, active/cancel/expiry lifecycle, idempotency, stale events, old subscriptions and manual grants. Synthetic changes rolled back.' as result;

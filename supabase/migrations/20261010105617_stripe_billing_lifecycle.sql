-- Server-side Stripe webhooks are the only billing writer. No public client
-- key, user-editable metadata, or success-page query can grant membership.
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;

create table private.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique check (customer_id ~ '^cus_[A-Za-z0-9]+$'),
  checkout_generation uuid not null default gen_random_uuid(),
  checkout_lock_id uuid,
  checkout_lock_until timestamptz,
  subscription_id text,
  subscription_created bigint not null default 0,
  subscription_status text,
  expires_at timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_created bigint not null default 0,
  last_observed_at timestamptz not null default 'epoch',
  updated_at timestamptz not null default now()
);
-- Preserve mappings from any earlier server-managed billing integration.
insert into private.billing_customers(user_id,customer_id,subscription_id,subscription_status,expires_at)
select id,stripe_customer_id,stripe_subscription_id,subscription_status,subscription_expires_at
from public.profiles where stripe_customer_id ~ '^cus_[A-Za-z0-9]+$';

create table private.billing_webhook_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  processed_at timestamptz not null default now()
);
alter table private.billing_customers enable row level security;
alter table private.billing_webhook_events enable row level security;
revoke all on private.billing_customers,private.billing_webhook_events from public,anon,authenticated,service_role;

create function public.billing_customer_for_user(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $function$
  select customer_id from private.billing_customers where user_id=p_user_id;
$function$;

create function public.billing_bind_customer(p_user_id uuid,p_customer_id text)
returns void language plpgsql security definer set search_path='' as $function$
declare existing_customer text;
begin
  if p_user_id is null or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Invalid billing identity'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,58193));
  select customer_id into existing_customer from private.billing_customers where user_id=p_user_id;
  if existing_customer is not null and existing_customer<>p_customer_id then raise exception 'Customer identity cannot be reassigned'; end if;
  insert into private.billing_customers(user_id,customer_id) values(p_user_id,p_customer_id) on conflict(user_id) do nothing;
  update public.profiles set stripe_customer_id=p_customer_id where id=p_user_id;
end;
$function$;

-- A lease spans external Stripe calls. Generation remains stable after an
-- ambiguous timeout, so annual/monthly retries cannot create two subscriptions.
create function public.billing_acquire_checkout(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare result jsonb;
begin
  update private.billing_customers set checkout_lock_id=gen_random_uuid(),
    checkout_lock_until=pg_catalog.now()+interval '2 minutes'
    where user_id=p_user_id and (checkout_lock_until is null or checkout_lock_until<pg_catalog.now())
    returning jsonb_build_object('lock_id',checkout_lock_id,'generation',checkout_generation) into result;
  return result;
end;
$function$;
create function public.billing_release_checkout(p_user_id uuid,p_lock_id uuid)
returns void language sql security definer set search_path='' as $function$
  update private.billing_customers set checkout_lock_id=null,checkout_lock_until=null
    where user_id=p_user_id and checkout_lock_id=p_lock_id;
$function$;
create function public.billing_advance_checkout(p_user_id uuid,p_lock_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare generation uuid;
begin
  update private.billing_customers set checkout_generation=gen_random_uuid()
    where user_id=p_user_id and checkout_lock_id=p_lock_id and checkout_lock_until>pg_catalog.now()
    returning checkout_generation into generation;
  if generation is null then raise exception 'Checkout reservation expired'; end if;
  return generation;
end;
$function$;
revoke all on function public.billing_acquire_checkout(uuid),public.billing_release_checkout(uuid,uuid),public.billing_advance_checkout(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.billing_acquire_checkout(uuid),public.billing_release_checkout(uuid,uuid),public.billing_advance_checkout(uuid,uuid) to service_role;

create function public.billing_apply_subscription(
  p_event_id text,p_event_created bigint,p_observed_at timestamptz,
  p_customer_id text,p_subscription_id text,p_subscription_created bigint,
  p_status text,p_expires_at timestamptz,p_cancel_at_period_end boolean
) returns text language plpgsql security definer set search_path='' as $function$
declare customer private.billing_customers; manual_access boolean; saved integer;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    or p_event_created is null or p_event_created<=0
    or p_subscription_created is null or p_subscription_created<=0
    or p_observed_at is null or p_observed_at>pg_catalog.now()+interval '5 minutes'
    or p_expires_at is null or p_cancel_at_period_end is null
    or p_status is null or p_status not in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')
    then raise exception 'Invalid subscription state'; end if;
  select * into customer from private.billing_customers where customer_id=p_customer_id for update;
  if not found then return 'ignored_unknown_customer'; end if;
  insert into private.billing_webhook_events(event_id,user_id) values(p_event_id,customer.user_id) on conflict(event_id) do nothing;
  get diagnostics saved=row_count;
  if saved=0 then return 'duplicate'; end if;
  -- An old canceled subscription must never overwrite a newer paid one.
  if p_subscription_created<customer.subscription_created
    or (p_subscription_created=customer.subscription_created and p_subscription_id<>customer.subscription_id
      and (customer.subscription_status not in ('canceled','incomplete_expired') or p_event_created<=customer.last_event_created))
    or (p_subscription_id=customer.subscription_id and (
      p_event_created<customer.last_event_created
      or (p_event_created=customer.last_event_created and p_observed_at<customer.last_observed_at)
    )) then return 'stale'; end if;
  select p.is_admin or (p.tier='roadbook' and p.subscription_status is null)
    into manual_access from public.profiles p where p.id=customer.user_id for update;
  update private.billing_customers set subscription_id=p_subscription_id,subscription_created=p_subscription_created,
    subscription_status=p_status,expires_at=p_expires_at,cancel_at_period_end=p_cancel_at_period_end,
    last_event_created=p_event_created,last_observed_at=p_observed_at,updated_at=pg_catalog.now()
    where user_id=customer.user_id;
  if not coalesce(manual_access,false) then
    update public.profiles set
      stripe_customer_id=p_customer_id,stripe_subscription_id=p_subscription_id,
      tier=case when p_status in ('active','trialing') and p_expires_at>pg_catalog.now() then 'roadbook' else 'free' end,
      subscription_status=p_status,subscription_expires_at=p_expires_at
      where id=customer.user_id;
  end if;
  return 'applied';
end;
$function$;

revoke all on function public.billing_customer_for_user(uuid) from public,anon,authenticated,service_role;
revoke all on function public.billing_bind_customer(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.billing_apply_subscription(text,bigint,timestamptz,text,text,bigint,text,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.billing_customer_for_user(uuid) to service_role;
grant execute on function public.billing_bind_customer(uuid,text) to service_role;
grant execute on function public.billing_apply_subscription(text,bigint,timestamptz,text,text,bigint,text,timestamptz,boolean) to service_role;

-- Keep profile billing columns protected even if an earlier deployment widened
-- table-level privileges. Ordinary preference updates continue to work.
revoke update on public.profiles from authenticated;
grant update(display_name,home_location,home_postcode,latitude,longitude,home_radius_miles,digest_frequency) on public.profiles to authenticated;

-- A delinquent subscription may still retry payments even though access is
-- suspended. Do not orphan its billing portal by deleting the local account.
create or replace function public.delete_own_account(p_confirmation text)
returns void language plpgsql security definer set search_path='' as $function$
declare member_id uuid := private.require_recent_auth(900);
begin
  if p_confirmation is distinct from 'DELETE' then
    raise exception using errcode='22023',message='Confirmation phrase is invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(member_id::text,58193));
  if exists(select 1 from private.billing_customers c where c.user_id=member_id) then
    raise exception using errcode='42501',message='A linked billing account requires support to verify Stripe cleanup before account deletion';
  end if;
  perform public.delete_managed_account(member_id,p_confirmation);
end;
$function$;
revoke all on function public.delete_own_account(text) from public,anon,authenticated,service_role;
grant execute on function public.delete_own_account(text) to authenticated;

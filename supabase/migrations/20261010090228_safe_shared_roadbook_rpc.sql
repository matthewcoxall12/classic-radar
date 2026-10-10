-- This narrowly scoped public bearer-token read is intentionally a definer:
-- guests must never receive grants to private trip tables or private stop notes.
-- A random UUID token + explicit sharing + current owner entitlement authorize
-- only the enumerated public plan fields, with no arbitrary owner lookup.
create or replace function public.get_shared_roadbook(p_share_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name',r.name,'description',r.description,
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'title',e.title,'slug',e.slug,'start_date',e.start_date,
      'start_time',e.start_time,'end_date',e.end_date,'end_time',e.end_time,
      'venue_name',e.venue_name,'town',e.town,'county',e.county,'postcode',e.postcode
    ) order by re.position,e.start_date,e.start_time nulls last,e.id)
    from public.roadbook_events re join public.events e on e.id=re.event_id
    where re.roadbook_id=r.id and e.status='published'),'[]'::jsonb)
  )
  from public.roadbooks r join public.profiles p on p.id=r.user_id
  where r.share_token=p_share_token and r.is_shared
    and (p.is_admin or (
      p.tier='roadbook'
      and (p.subscription_status is null or p.subscription_status in ('active','trialing'))
      and (p.subscription_expires_at is null or p.subscription_expires_at>pg_catalog.now())
      and (p.subscription_status is distinct from 'trialing' or p.subscription_expires_at>pg_catalog.now())
    ))
  limit 1;
$$;
revoke all on function public.get_shared_roadbook(uuid) from public,anon,authenticated;
grant execute on function public.get_shared_roadbook(uuid) to anon,authenticated;
revoke all on public.roadbooks,public.roadbook_events from anon;

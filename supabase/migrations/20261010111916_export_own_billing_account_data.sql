-- Keep the recent-session export complete without exposing operational billing locks.
create or replace function public.export_own_account_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_recent_auth(900);
begin
  return public.export_managed_account_data(member_id) || pg_catalog.jsonb_build_object(
    'published_events',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event) order by event.created_at)
      from public.events event where event.created_by=member_id),'[]'::jsonb),
    'event_reviews',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(review) order by review.created_at)
      from public.event_reviews review where review.user_id=member_id),'[]'::jsonb),
    'review_writing_limit',(select pg_catalog.to_jsonb(quota) from private.review_write_limits quota where quota.user_id=member_id),
    'billing_account',(select pg_catalog.jsonb_build_object(
      'customer_id',billing.customer_id,
      'subscription_id',billing.subscription_id,
      'subscription_status',billing.subscription_status,
      'expires_at',billing.expires_at,
      'cancel_at_period_end',billing.cancel_at_period_end,
      'updated_at',billing.updated_at
    ) from private.billing_customers billing where billing.user_id=member_id),
    'billing_events',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'event_id',webhook.event_id,'processed_at',webhook.processed_at
    ) order by webhook.processed_at,webhook.event_id)
      from private.billing_webhook_events webhook where webhook.user_id=member_id),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.export_own_account_data() from public,anon,authenticated,service_role;
grant execute on function public.export_own_account_data() to authenticated;

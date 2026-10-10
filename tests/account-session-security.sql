-- Run as postgres after require_live_account_session. Synthetic fixtures are
-- rolled back; no existing accounts, sessions or email services are touched.
begin;
insert into auth.users(id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000000', 'session-security-qa@example.invalid', '{}'::jsonb);
insert into auth.sessions(id, user_id, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000000', now(), now());
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-000000000000',
  'session_id', '00000000-0000-4000-8000-000000000001',
  'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint))
)::text, true);
do $test$
begin
  if private.require_recent_auth(900) <> '00000000-0000-4000-8000-000000000000'::uuid then
    raise exception 'SECURITY REGRESSION: recent live session not accepted';
  end if;
end;
$test$;
update auth.sessions set created_at = now() - interval '2 hours'
where id = '00000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-000000000000',
  'session_id', '00000000-0000-4000-8000-000000000001',
  'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now() - interval '2 hours')::bigint))
)::text, true);
do $test$
begin
  begin
    perform private.require_recent_auth(900);
    raise exception 'SECURITY REGRESSION: stale authentication accepted';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Recent authentication required' then raise; end if;
  end;
end;
$test$;
update auth.sessions set created_at = now(), not_after = now() - interval '1 minute'
where id = '00000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-000000000000',
  'session_id', '00000000-0000-4000-8000-000000000001',
  'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint))
)::text, true);
do $test$
begin
  begin
    perform private.require_recent_auth(900);
    raise exception 'SECURITY REGRESSION: expired session accepted';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Fresh authentication required' then raise; end if;
  end;
end;
$test$;
delete from auth.sessions where id = '00000000-0000-4000-8000-000000000001';
do $test$
begin
  begin
    perform private.require_recent_auth(900);
    raise exception 'SECURITY REGRESSION: a missing/revoked session accepted';
  exception when sqlstate '28000' then
    if sqlerrm <> 'Fresh authentication required' then raise; end if;
  end;
end;
$test$;
rollback;

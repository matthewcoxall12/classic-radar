-- Synthetic signup only; no emails or real account changes. Run as postgres.
begin;
insert into auth.users(id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000002', 'admin-security-qa@example.invalid',
  '{"full_name":"Security QA","is_admin":true,"tier":"roadbook"}'::jsonb);
do $test$
begin
  if not exists (
    select 1 from public.profiles
    where id = '00000000-0000-4000-8000-000000000002'
      and display_name = 'Security QA' and is_admin = false and tier = 'free'
  ) then
    raise exception 'SECURITY REGRESSION: signup metadata granted privileges or profile initialization failed';
  end if;
  if pg_get_functiondef('private.handle_new_user()'::regprocedure) like '%matthewcoxall%' then
    raise exception 'SECURITY REGRESSION: email-based administrator granting remains';
  end if;
end;
$test$;
rollback;

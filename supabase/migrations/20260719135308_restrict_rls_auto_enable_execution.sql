
-- The source production project once contained a Sites-era helper. Keep this
-- historical hardening step replay-safe for clean Supabase projects where the
-- helper never existed.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$$;

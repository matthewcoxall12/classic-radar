-- Durable, privacy-preserving authentication audit records. Only the Vercel
-- service role may write or read this table; browser roles have no access.

create table if not exists public.auth_audit_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'signed_in',
    'signed_out',
    'reauthenticated',
    'other_sessions_revoked',
    'account_exported',
    'account_deleted',
    'auth_event'
  )),
  provider text,
  member_hash text,
  session_hash text,
  occurred_at timestamptz not null default clock_timestamp()
);

alter table public.auth_audit_events enable row level security;

revoke all on table public.auth_audit_events
  from public, anon, authenticated, service_role;
revoke all on sequence public.auth_audit_events_id_seq
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.auth_audit_events to service_role;
grant usage, select on sequence public.auth_audit_events_id_seq to service_role;

create index if not exists auth_audit_events_occurred_at_idx
  on public.auth_audit_events (occurred_at desc);
create index if not exists auth_audit_events_member_hash_idx
  on public.auth_audit_events (member_hash, occurred_at desc)
  where member_hash is not null;

comment on table public.auth_audit_events is
  'Service-only authentication audit trail containing keyed identifiers, not email addresses or raw session IDs.';

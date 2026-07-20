
create table public.welcome_email_deliveries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'sending'
    constraint welcome_email_deliveries_status_check
    check (status in ('sending', 'sent')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

comment on table public.welcome_email_deliveries is
  'Internal idempotency ledger for one welcome email per authenticated user.';

alter table public.welcome_email_deliveries enable row level security;

revoke all on table public.welcome_email_deliveries from anon, authenticated;
grant select, insert, update, delete on table public.welcome_email_deliveries to service_role;

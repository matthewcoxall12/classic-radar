-- Restore least-privilege INSERT grants after the free-save rollout. Row-level
-- security still constrains ownership and published-event references.
revoke insert on table public.saved_events from authenticated;
grant insert (user_id, event_id, reminder_preference)
  on table public.saved_events to authenticated;

revoke insert on table public.event_attendance from authenticated;
grant insert (user_id, event_id)
  on table public.event_attendance to authenticated;

-- created_at must remain server-controlled because the rate-limit trigger
-- counts recent submissions. Members may provide only the public form fields.
revoke insert on table public.user_submissions from authenticated;
grant insert (submitted_by, event_name, event_url, event_date, location_text, notes)
  on table public.user_submissions to authenticated;

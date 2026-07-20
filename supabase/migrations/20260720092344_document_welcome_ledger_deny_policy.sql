create policy "welcome ledger is backend only"
on public.welcome_email_deliveries
for all
to anon, authenticated
using (false)
with check (false);

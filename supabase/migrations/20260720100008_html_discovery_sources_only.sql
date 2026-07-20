-- The current bounded runner supports public HTML pages only. Keep reserved
-- RSS, ICS, sitemap and search records for future connectors, but do not send
-- them to the production crawler until a format-specific parser exists.
update public.source_registry
set
  is_active = false,
  notes = case
    when source_key = 'facebook-public-events'
      then 'Reserved for a future reviewed search connector; no private content or login bypass.'
    else concat('Inactive until a reviewed ', upper(format_hint), ' connector is available.')
  end,
  updated_at = now()
where format_hint <> 'html';

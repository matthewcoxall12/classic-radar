-- The IVVCC robots policy requests a per-host crawl delay that the current
-- concurrent worker does not yet implement. Keep the source registered but
-- inactive until that policy can be honoured.
update public.source_registry
set
  is_active = false,
  notes = 'Staged source: robots.txt requests Crawl-delay 10. Activate after the worker supports per-host delay.',
  updated_at = now()
where source_key = 'ivvcc-events';

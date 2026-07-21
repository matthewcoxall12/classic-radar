-- Official, public event calendars selected for regional and taxonomy coverage.
-- Discovery remains review-only; this migration does not publish event rows.
insert into public.source_registry (
  source_key,
  source_name,
  domain,
  start_url,
  source_type,
  format_hint,
  country_code,
  region,
  priority_weight,
  crawl_frequency,
  requires_review,
  is_active,
  notes
) values
  (
    'ivvcc-events',
    'Irish Veteran & Vintage Car Club',
    'ivvcc.ie',
    'https://www.ivvcc.ie/upcoming-events-calendar/',
    'federation',
    'html',
    'IE',
    'Ireland',
    96,
    'daily',
    true,
    true,
    'Official public 2026 calendar; review date ranges and organiser-supplied locations before publication.'
  ),
  (
    'vscc-events',
    'Vintage Sports-Car Club',
    'vscc.co.uk',
    'https://www.vscc.co.uk/page/events',
    'club',
    'html',
    'GB',
    null,
    95,
    'daily',
    true,
    true,
    'Official public calendar covering vintage trials, tours, races and hill climbs.'
  ),
  (
    'hrcr-events',
    'Historic Rally Car Register',
    'hrcr.co.uk',
    'https://www.hrcr.co.uk/events/month/',
    'club',
    'html',
    'GB',
    null,
    95,
    'daily',
    true,
    true,
    'Official public rally calendar with same-origin event details.'
  ),
  (
    'great-british-car-journey',
    'Great British Car Journey',
    'greatbritishcarjourney.com',
    'https://greatbritishcarjourney.com/whats-on/',
    'museum',
    'html',
    'GB',
    'East Midlands',
    95,
    'daily',
    true,
    true,
    'Official museum calendar with dated marque days, car shows and evening meets.'
  ),
  (
    'shuttleworth-events',
    'Shuttleworth',
    'shuttleworth.org',
    'https://www.shuttleworth.org/events',
    'museum',
    'html',
    'GB',
    'East of England',
    94,
    'daily',
    true,
    true,
    'Official venue calendar; publish only motoring-relevant listings after review.'
  ),
  (
    'concours-of-elegance',
    'Concours of Elegance',
    'concoursofelegance.co.uk',
    'https://concoursofelegance.co.uk/',
    'organiser',
    'html',
    'GB',
    'South East England',
    93,
    'daily',
    true,
    true,
    'Official organiser page for the Hampton Court Palace concours.'
  ),
  (
    'salon-prive',
    'Salon Privé Concours',
    'salonpriveconcours.com',
    'https://www.salonpriveconcours.com/',
    'organiser',
    'html',
    'GB',
    'South East England',
    93,
    'daily',
    true,
    true,
    'Official organiser page for the Blenheim Palace concours.'
  )
on conflict (source_key) do update set
  source_name = excluded.source_name,
  domain = excluded.domain,
  start_url = excluded.start_url,
  source_type = excluded.source_type,
  format_hint = excluded.format_hint,
  country_code = excluded.country_code,
  region = excluded.region,
  priority_weight = excluded.priority_weight,
  crawl_frequency = excluded.crawl_frequency,
  requires_review = excluded.requires_review,
  is_active = excluded.is_active,
  notes = excluded.notes,
  updated_at = now();

-- Quarantine the persistent 403 and back off the repeatedly unreachable page so
-- bounded canaries spend their budget on working official calendars.
update public.source_registry
set
  is_active = false,
  notes = 'Temporarily inactive after repeated HTTP 403 responses; reactivate only after a permitted public feed or page is available.',
  updated_at = now()
where source_key = 'classic-shows-uk';

update public.source_registry
set
  priority_weight = 70,
  crawl_frequency = 'weekly',
  notes = 'Backed off after repeated fetch failures; retained for periodic reachability checks.',
  updated_at = now()
where source_key = 'bicester-heritage';

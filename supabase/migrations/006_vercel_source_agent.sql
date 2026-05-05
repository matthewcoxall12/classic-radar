alter table public.source_registry
add column if not exists start_url text,
add column if not exists crawl_frequency text default 'daily',
add column if not exists requires_review boolean default false,
add column if not exists last_checked_at timestamptz,
add column if not exists last_error text;

update public.source_registry
set start_url = coalesce(start_url, 'https://' || domain)
where start_url is null;

alter table public.source_registry
alter column source_name set not null,
alter column domain set not null,
alter column start_url set not null,
alter column source_type set not null;

alter table public.agent_runs
add column if not exists sources_checked integer default 0,
add column if not exists pages_fetched integer default 0,
add column if not exists candidates_found integer default 0;

insert into public.source_registry
  (source_name, domain, start_url, source_type, priority_weight, crawl_frequency, is_active, requires_review, notes)
values
('Classic & Sports Car Calendar', 'classicandsportscar.com', 'https://www.classicandsportscar.com/calendar', 'classic_event_calendar', 85, 'daily', true, false, 'Classic event calendar.'),
('Classic Shows UK', 'classicshowsuk.co.uk', 'https://www.classicshowsuk.co.uk/', 'classic_event_calendar', 85, 'daily', true, false, 'Classic show calendar.'),
('The Classic Valuer Events', 'theclassicvaluer.com', 'https://theclassicvaluer.com/events', 'classic_event_calendar', 82, 'daily', true, false, 'Classic event listings.'),
('Car Events', 'carevents.com', 'https://www.carevents.com/', 'classic_event_calendar', 82, 'daily', true, false, 'Car event listings.'),
('Retro Rides Events', 'retroridesevents.com', 'https://retroridesevents.com/', 'classic_event_calendar', 85, 'daily', true, false, 'Retro event listings.'),
('Retro Rides Forum Events', 'forum.retro-rides.org', 'https://forum.retro-rides.org/', 'forum', 55, 'daily', true, true, 'Forum source requires review.'),
('PistonHeads Events', 'pistonheads.com', 'https://www.pistonheads.com/calendar', 'forum', 55, 'daily', true, true, 'Community calendar.'),
('Classic Car Weekly', 'classiccarweekly.co.uk', 'https://www.classiccarweekly.co.uk/', 'classic_event_calendar', 78, 'weekly', true, false, 'Publication site.'),
('Practical Classics', 'practicalclassics.co.uk', 'https://www.practicalclassics.co.uk/', 'classic_event_calendar', 78, 'weekly', true, false, 'Publication site.'),
('Autojumble.info', 'autojumble.info', 'https://www.autojumble.info/', 'classic_event_calendar', 80, 'daily', true, false, 'Autojumble listings.'),
('Eventbrite UK classic car search', 'eventbrite.co.uk', 'https://www.eventbrite.co.uk/', 'ticketing_platform', 75, 'daily', true, true, 'Ticketing platform; review for thin listings.'),
('TicketSource', 'ticketsource.co.uk', 'https://www.ticketsource.co.uk/', 'ticketing_platform', 75, 'daily', true, true, 'Ticketing platform.'),
('Ticket Tailor', 'tickettailor.com', 'https://www.tickettailor.com/', 'ticketing_platform', 75, 'daily', true, true, 'Ticketing platform.'),
('Skiddle', 'skiddle.com', 'https://www.skiddle.com/', 'ticketing_platform', 70, 'daily', true, true, 'Ticketing/search platform.'),
('Meetup', 'meetup.com', 'https://www.meetup.com/', 'social', 45, 'daily', true, true, 'Public social listings only.'),
('Beaulieu', 'beaulieu.co.uk', 'https://www.beaulieu.co.uk/events/', 'venue_or_museum', 90, 'daily', true, false, 'Major venue.'),
('Brooklands Museum', 'brooklandsmuseum.com', 'https://www.brooklandsmuseum.com/whats-on/', 'venue_or_museum', 90, 'daily', true, false, 'Museum events.'),
('British Motor Museum', 'britishmotormuseum.co.uk', 'https://www.britishmotormuseum.co.uk/whats-on', 'venue_or_museum', 90, 'daily', true, false, 'Museum events.'),
('Haynes Motor Museum', 'haynesmuseum.org', 'https://www.haynesmuseum.org/events', 'venue_or_museum', 90, 'daily', true, false, 'Museum events.'),
('Goodwood', 'goodwood.com', 'https://www.goodwood.com/motorsport/', 'venue_or_museum', 90, 'daily', true, false, 'Major motoring venue.'),
('Bicester Heritage', 'bicesterheritage.co.uk', 'https://bicesterheritage.co.uk/events/', 'venue_or_museum', 90, 'daily', true, false, 'Major heritage venue.'),
('Caffeine & Machine', 'caffeineandmachine.com', 'https://caffeineandmachine.com/', 'venue_or_museum', 88, 'daily', true, false, 'Motoring venue.'),
('Ace Cafe London', 'ace-cafe-london.com', 'https://london.acecafe.com/', 'venue_or_museum', 88, 'daily', true, false, 'Motoring venue.'),
('National Motor Museum', 'nationalmotormuseum.org.uk', 'https://nationalmotormuseum.org.uk/', 'venue_or_museum', 90, 'daily', true, false, 'Motoring museum.'),
('Lakeland Motor Museum', 'lakelandmotormuseum.co.uk', 'https://www.lakelandmotormuseum.co.uk/', 'venue_or_museum', 88, 'weekly', true, false, 'Motoring museum.'),
('Austin A30/A35 Owners Club', 'austina30a35ownersclub.co.uk', 'https://www.austina30a35ownersclub.co.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('MG Car Club', 'mgcc.co.uk', 'https://www.mgcc.co.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('MG Owners Club', 'mgownersclub.co.uk', 'https://www.mgownersclub.co.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('Jaguar Enthusiasts Club', 'jec.org.uk', 'https://jec.org.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('Vintage Sports-Car Club', 'vscc.co.uk', 'https://www.vscc.co.uk/', 'club_site', 82, 'weekly', true, true, 'Club site.'),
('Mini Owners Club', 'miniownersclub.co.uk', 'https://www.miniownersclub.co.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('Morris Minor Owners Club', 'mmoc.org.uk', 'https://www.mmoc.org.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('Triumph Sports Six Club', 'tssc.org.uk', 'https://www.tssc.org.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('TR Register', 'tr-register.co.uk', 'https://www.tr-register.co.uk/', 'club_site', 80, 'weekly', true, true, 'Club site.'),
('Ford Sidevalve Owners Club', 'fsoc.co.uk', 'https://www.fsoc.co.uk/', 'club_site', 78, 'weekly', true, true, 'Club site.'),
('Ford Anglia 105E Owners Club', 'fordanglia105eownersclub.co.uk', 'https://www.fordanglia105eownersclub.co.uk/', 'club_site', 78, 'weekly', true, true, 'Club site.'),
('Pre-50 American Auto Club', 'pre50aac.com', 'https://www.pre50aac.com/', 'club_site', 78, 'weekly', true, true, 'Club site.'),
('American Auto Club UK', 'americanautoclubuk.com', 'https://www.americanautoclubuk.com/', 'club_site', 78, 'weekly', true, true, 'Club site.'),
('Federation of British Historic Vehicle Clubs', 'fbhvc.co.uk', 'https://www.fbhvc.co.uk/', 'club_site', 80, 'weekly', true, true, 'Federation source.'),
('Historic Rally Car Register', 'hrcr.co.uk', 'https://www.hrcr.co.uk/', 'club_site', 80, 'weekly', true, true, 'Rally club source.'),
('Visit Hampshire events', 'visit-hampshire.co.uk', 'https://www.visit-hampshire.co.uk/whats-on', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Dorset events', 'visit-dorset.com', 'https://www.visit-dorset.com/whats-on', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Wiltshire events', 'visitwiltshire.co.uk', 'https://www.visitwiltshire.co.uk/whats-on', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Devon events', 'visitdevon.co.uk', 'https://www.visitdevon.co.uk/whats-on', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Cornwall events', 'visitcornwall.com', 'https://www.visitcornwall.com/whats-on', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Kent events', 'visitkent.co.uk', 'https://www.visitkent.co.uk/events/', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Surrey events', 'visitsurrey.com', 'https://www.visitsurrey.com/whats-on', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Sussex events', 'experiencewestsussex.com', 'https://www.experiencewestsussex.com/whats-on/', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Norfolk events', 'visitnorfolk.co.uk', 'https://www.visitnorfolk.co.uk/events', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.'),
('Visit Yorkshire events', 'yorkshire.com', 'https://www.yorkshire.com/events/', 'council_or_whats_on', 68, 'weekly', true, true, 'Regional listings.')
on conflict (domain) do update set
  source_name = excluded.source_name,
  start_url = excluded.start_url,
  source_type = excluded.source_type,
  priority_weight = excluded.priority_weight,
  crawl_frequency = excluded.crawl_frequency,
  is_active = excluded.is_active,
  requires_review = excluded.requires_review,
  notes = excluded.notes;

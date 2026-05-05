alter table public.agent_runs
add column if not exists review_queue_created integer default 0;

create table if not exists public.source_registry (
  id uuid primary key default gen_random_uuid(),
  domain text unique not null,
  source_name text,
  source_type text,
  priority_weight integer default 50,
  is_active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists source_registry_set_updated_at on public.source_registry;
create trigger source_registry_set_updated_at
before update on public.source_registry
for each row execute function public.set_updated_at();

alter table public.source_registry enable row level security;

create policy "admins read source registry"
on public.source_registry for select
using (public.is_admin());

create policy "admins manage source registry"
on public.source_registry for all
using (public.is_admin())
with check (public.is_admin());

insert into public.source_registry (domain, source_name, source_type, priority_weight, notes) values
('classicandsportscar.com', 'Classic & Sports Car Calendar', 'classic_event_calendar', 85, 'Strong classic calendar source.'),
('classicshowsuk.co.uk', 'Classic Shows UK', 'classic_event_calendar', 85, 'UK classic show calendar.'),
('theclassicvaluer.com', 'The Classic Valuer', 'classic_event_calendar', 82, 'Classic event listings.'),
('carevents.com', 'Car Events', 'classic_event_calendar', 82, 'General car event calendar.'),
('retrorides.org', 'Retro Rides Forum', 'forum', 55, 'Community source.'),
('retro-rides.org', 'Retro Rides Forum Alt', 'forum', 55, 'Community source.'),
('retroridesevents.com', 'Retro Rides Events', 'classic_event_calendar', 85, 'Event calendar.'),
('pistonheads.com', 'PistonHeads', 'forum', 55, 'Community and classifieds source.'),
('eventbrite.co.uk', 'Eventbrite UK', 'ticketing_platform', 75, 'Ticketing platform.'),
('ticketsource.co.uk', 'TicketSource', 'ticketing_platform', 75, 'Ticketing platform.'),
('tickettailor.com', 'Ticket Tailor', 'ticketing_platform', 75, 'Ticketing platform.'),
('meetup.com', 'Meetup', 'social', 45, 'Community listings.'),
('facebook.com', 'Facebook', 'facebook', 50, 'Requires strong date and location before publish.'),
('instagram.com', 'Instagram', 'social', 45, 'Social source.'),
('reddit.com', 'Reddit', 'forum', 55, 'Community source.'),
('beaulieu.co.uk', 'Beaulieu', 'venue_or_museum', 90, 'Major motoring venue.'),
('brooklandsmuseum.com', 'Brooklands Museum', 'venue_or_museum', 90, 'Major motoring museum.'),
('britishmotormuseum.co.uk', 'British Motor Museum', 'venue_or_museum', 90, 'Major motoring museum.'),
('haynesmuseum.org', 'Haynes Motor Museum', 'venue_or_museum', 90, 'Motoring museum.'),
('caffeineandmachine.com', 'Caffeine & Machine', 'venue_or_museum', 88, 'Motoring venue.'),
('ace-cafe-london.com', 'Ace Cafe London', 'venue_or_museum', 88, 'Motoring venue.'),
('bicesterheritage.co.uk', 'Bicester Heritage', 'venue_or_museum', 90, 'Major heritage venue.'),
('goodwood.com', 'Goodwood', 'venue_or_museum', 90, 'Major motoring venue.'),
('austina30a35ownersclub.co.uk', 'Austin A30/A35 Owners Club', 'club_site', 80, 'Marque club.'),
('mgcc.co.uk', 'MG Car Club', 'club_site', 80, 'Marque club.'),
('jaguarenthusiasts.co.uk', 'Jaguar Enthusiasts Club', 'club_site', 80, 'Marque club.'),
('vscc.co.uk', 'Vintage Sports-Car Club', 'club_site', 82, 'Historic motoring club.'),
('miniownersclub.co.uk', 'Mini Owners Club', 'club_site', 80, 'Marque club.'),
('nationalmotormuseum.org.uk', 'National Motor Museum', 'venue_or_museum', 90, 'Motoring museum.'),
('lakelandmotormuseum.co.uk', 'Lakeland Motor Museum', 'venue_or_museum', 88, 'Motoring museum.'),
('coventrytransportmuseum.co.uk', 'Coventry Transport Museum', 'venue_or_museum', 88, 'Transport museum.'),
('grampiantransportmuseum.com', 'Grampian Transport Museum', 'venue_or_museum', 88, 'Transport museum.'),
('transport-museum.com', 'London Transport Museum', 'venue_or_museum', 80, 'Transport museum.'),
('prescott-hillclimb.com', 'Prescott Hill Climb', 'venue_or_museum', 82, 'Historic venue.'),
('shelsleywalsh.com', 'Shelsley Walsh', 'venue_or_museum', 82, 'Historic venue.'),
('castlecombecircuit.co.uk', 'Castle Combe Circuit', 'venue_or_museum', 78, 'Venue source.'),
('silverstone.co.uk', 'Silverstone', 'venue_or_museum', 78, 'Venue source.'),
('msv.com', 'MotorSport Vision', 'venue_or_museum', 75, 'Venue group.'),
('whatsonlive.co.uk', 'WhatsOn Live', 'council_or_whats_on', 70, 'Regional listings.'),
('visitbritain.com', 'Visit Britain', 'council_or_whats_on', 70, 'Tourism listings.'),
('visitscotland.com', 'Visit Scotland', 'council_or_whats_on', 70, 'Tourism listings.'),
('visitwales.com', 'Visit Wales', 'council_or_whats_on', 70, 'Tourism listings.'),
('discovernorthernireland.com', 'Discover Northern Ireland', 'council_or_whats_on', 70, 'Tourism listings.'),
('visitcornwall.com', 'Visit Cornwall', 'council_or_whats_on', 68, 'Regional listings.'),
('visitdevon.co.uk', 'Visit Devon', 'council_or_whats_on', 68, 'Regional listings.'),
('visithampshire.co.uk', 'Visit Hampshire', 'council_or_whats_on', 68, 'Regional listings.'),
('visitsurrey.com', 'Visit Surrey', 'council_or_whats_on', 68, 'Regional listings.'),
('yorkshire.com', 'Welcome to Yorkshire', 'council_or_whats_on', 68, 'Regional listings.'),
('greatbritishmotorshows.com', 'Great British Motor Shows', 'classic_event_calendar', 84, 'Show organiser calendar.'),
('classicmotorevents.com', 'Classic Motor Events', 'classic_event_calendar', 82, 'Event organiser/calendar.'),
('capriclub.co.uk', 'Capri Club', 'club_site', 78, 'Marque club.')
on conflict (domain) do update set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  priority_weight = excluded.priority_weight,
  notes = excluded.notes;

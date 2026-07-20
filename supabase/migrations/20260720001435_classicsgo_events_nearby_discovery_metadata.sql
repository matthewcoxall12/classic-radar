-- Extend nearby event results with discovery-quality metadata. PostgreSQL
-- requires dropping the function before changing a RETURNS TABLE row type.
drop function if exists public.events_nearby(
  double precision,
  double precision,
  double precision,
  integer
);

create function public.events_nearby(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles double precision,
  p_limit integer default 200
)
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  event_type text,
  start_date date,
  start_time time,
  end_date date,
  end_time time,
  timezone text,
  venue_name text,
  address text,
  town text,
  county text,
  country_code text,
  postcode text,
  latitude double precision,
  longitude double precision,
  price_text text,
  booking_required boolean,
  booking_url text,
  organiser_name text,
  organiser_url text,
  image_url text,
  is_verified boolean,
  source_count integer,
  going_count integer,
  distance_miles double precision,
  confidence_score integer,
  last_checked_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  with params as (
    select
      p_latitude as latitude,
      p_longitude as longitude,
      least(greatest(coalesce(p_radius_miles, 50.0), 1.0), 250.0) as radius_miles,
      least(greatest(coalesce(p_limit, 200), 1), 200) as result_limit
  ),
  bounded as (
    select
      e.*,
      p.radius_miles,
      2.0 * 3958.7613 * asin(
        sqrt(
          least(
            1.0,
            power(sin(radians(e.latitude - p.latitude) / 2.0), 2.0)
            + cos(radians(p.latitude))
              * cos(radians(e.latitude))
              * power(sin(radians(e.longitude - p.longitude) / 2.0), 2.0)
          )
        )
      ) as distance_miles
    from public.events e
    cross join params p
    where p.latitude between -90.0 and 90.0
      and p.longitude between -180.0 and 180.0
      and e.status = 'published'
      and coalesce(e.end_date, e.start_date) >= current_date
      and e.latitude is not null
      and e.longitude is not null
      and e.latitude between
        p.latitude - (p.radius_miles / 69.0)
        and p.latitude + (p.radius_miles / 69.0)
      and e.longitude between
        p.longitude - least(180.0, p.radius_miles / greatest(0.000001, 69.172 * abs(cos(radians(p.latitude)))))
        and p.longitude + least(180.0, p.radius_miles / greatest(0.000001, 69.172 * abs(cos(radians(p.latitude)))))
  )
  select
    b.id,
    b.title,
    b.slug,
    b.description,
    b.event_type,
    b.start_date,
    b.start_time,
    b.end_date,
    b.end_time,
    b.timezone,
    b.venue_name,
    b.address,
    b.town,
    b.county,
    b.country_code,
    b.postcode,
    b.latitude,
    b.longitude,
    b.price_text,
    b.booking_required,
    b.booking_url,
    b.organiser_name,
    b.organiser_url,
    b.image_url,
    b.is_verified,
    b.source_count,
    b.going_count,
    b.distance_miles,
    b.confidence_score,
    b.last_checked_at
  from bounded b
  where b.distance_miles <= b.radius_miles
  order by b.distance_miles, b.start_date, b.start_time nulls last, b.title
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

revoke all on function public.events_nearby(
  double precision,
  double precision,
  double precision,
  integer
) from public, anon, authenticated;

grant execute on function public.events_nearby(
  double precision,
  double precision,
  double precision,
  integer
) to anon, authenticated;

comment on function public.events_nearby(
  double precision,
  double precision,
  double precision,
  integer
) is 'Returns up to 200 current or future published events within a capped 1-250 mile radius, including Haversine distance and discovery confidence metadata.';

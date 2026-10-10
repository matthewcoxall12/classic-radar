-- Apply every filter before sorting and pagination. The former nearby RPC
-- selected 200 nearest rows first, hiding valid later-date/category matches.
create or replace function public.search_public_events(
  p_start_date date,
  p_end_date date default null,
  p_query text default null,
  p_types text[] default null,
  p_country text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_miles double precision default 50,
  p_sort text default 'date',
  p_offset integer default 0,
  p_limit integer default 31
)
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  with parameters as (
    select least(greatest(coalesce(p_radius_miles,50),1),250) radius,
      replace(replace(replace(left(coalesce(p_query,''),120),'\','\\'),'%','\%'),'_','\_') search,
      p_latitude is not null or p_longitude is not null local_search
  ), filtered as (
    select e.*, case when p.local_search then
      2 * 3958.7613 * asin(sqrt(least(1.0,
        power(sin(radians(e.latitude-p_latitude)/2),2)
        + cos(radians(p_latitude))*cos(radians(e.latitude))*power(sin(radians(e.longitude-p_longitude)/2),2)
      ))) else null end distance_miles
    from public.events e cross join parameters p
    where e.status='published'
      and coalesce(e.end_date,e.start_date) >= p_start_date
      and (p_end_date is null or e.start_date <= p_end_date)
      and (p_country is null or e.country_code=p_country)
      and (coalesce(cardinality(p_types),0)=0 or e.event_type=any(p_types))
      and (p.search='' or concat_ws(' ',e.title,e.description,e.venue_name,e.town,e.county,e.event_type,e.organiser_name) ilike '%'||p.search||'%' escape '\')
      and (not p.local_search or (
        p_latitude between -90 and 90 and p_longitude between -180 and 180
        and e.latitude is not null and e.longitude is not null
        and e.latitude between p_latitude-(p.radius/69) and p_latitude+(p.radius/69)
        and e.longitude between p_longitude-least(180,p.radius/greatest(0.000001,69.172*abs(cos(radians(p_latitude)))))
          and p_longitude+least(180,p.radius/greatest(0.000001,69.172*abs(cos(radians(p_latitude)))))
      ))
  )
  select to_jsonb(f) from filtered f cross join parameters p
  where not p.local_search or f.distance_miles <= p.radius
  order by case when p.local_search and p_sort='distance' then f.distance_miles end,
    f.start_date,f.start_time nulls last,f.id
  offset greatest(0,least(coalesce(p_offset,0),2000000))
  limit least(greatest(coalesce(p_limit,31),1),201);
$$;
revoke all on function public.search_public_events(date,date,text,text[],text,double precision,double precision,double precision,text,integer,integer) from public,anon,authenticated;
grant execute on function public.search_public_events(date,date,text,text[],text,double precision,double precision,double precision,text,integer,integer) to anon,authenticated;
create index if not exists events_public_end_date_idx on public.events ((coalesce(end_date,start_date)),start_date,id) where status='published';

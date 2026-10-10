-- Run after paginated_filtered_event_search. Every fixture is rolled back.
begin;
insert into public.events (title,slug,dedupe_key,event_type,start_date,status,latitude,longitude,country_code)
select 'ZZCLASSICSGOAUDIT nearby '||i,'search-pagination-audit-'||i,'search-pagination-audit-'||i,
 'Cars & coffee','2099-01-02','published',51.0,-1.0,'GB'
from generate_series(1,205) i;
insert into public.events (title,slug,dedupe_key,event_type,start_date,end_date,status,latitude,longitude,country_code)
values ('ZZCLASSICSGOAUDIT rare target','search-pagination-target','search-pagination-target','Rally / road run','2099-01-03',null,'published',51.1,-1.0,'GB'),
 ('ZZCLASSICSGOAUDIT ongoing','search-pagination-ongoing','search-pagination-ongoing','Club meet','2098-12-30','2099-01-02','published',51.0,-1.0,'GB'),
 ('ZZCLASSICSGOAUDIT private target','search-pagination-private','search-pagination-private','Rally / road run','2099-01-03',null,'draft',51.0,-1.0,'GB');
set local role anon;
do $$ declare total integer; first_page jsonb[]; next_page jsonb[]; begin
  select count(*) into total from public.search_public_events('2099-01-01',null,'rare target',null,'GB',51.0,-1.0,50,'distance',0,31);
  if total<>1 then raise exception 'Text match beyond nearest 200 was lost'; end if;
  select count(*) into total from public.search_public_events('2099-01-01',null,'ZZCLASSICSGOAUDIT',array['Rally / road run'],'GB',51.0,-1.0,50,'date',0,31);
  if total<>1 then raise exception 'Category match beyond nearest 200 was lost'; end if;
  select count(*) into total from public.search_public_events('2099-01-03','2099-01-03','ZZCLASSICSGOAUDIT',null,'GB',51.0,-1.0,50,'date',0,31);
  if total<>1 then raise exception 'Date filter not applied before page limit or draft visible'; end if;
  select count(*) into total from public.search_public_events('2099-01-01','2099-01-01','ongoing',null,'GB',51.0,-1.0,50,'date',0,31);
  if total<>1 then raise exception 'Ongoing multi-day event missing'; end if;
  select count(*) into total from public.search_public_events('2099-01-03',null,'ongoing',null,'GB',51.0,-1.0,50,'date',0,31);
  if total<>0 then raise exception 'Ended event remained upcoming'; end if;
  select array_agg(item) into first_page from public.search_public_events('2099-01-01',null,'ZZCLASSICSGOAUDIT',null,'GB',51.0,-1.0,50,'date',0,31) item;
  select array_agg(item) into next_page from public.search_public_events('2099-01-01',null,'ZZCLASSICSGOAUDIT',null,'GB',51.0,-1.0,50,'date',30,31) item;
  if first_page[31]->>'id' is distinct from next_page[1]->>'id' then raise exception 'Pagination lookahead skipped a row'; end if;
  if exists(select 1 from unnest(first_page[1:30]) a join unnest(next_page[1:30]) b on a->>'id'=b->>'id') then raise exception 'Displayed pages overlap'; end if;
  select count(*) into total from public.search_public_events('2099-01-01',null,'ZZCLASSICSGOAUDIT',null,'GB',51.0,null,50,'date',0,31);
  if total<>0 then raise exception 'Invalid coordinate pair accepted'; end if;
end $$;
rollback;

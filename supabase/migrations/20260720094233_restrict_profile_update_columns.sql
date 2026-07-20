revoke update on table public.profiles from authenticated;
grant update (display_name, home_location, home_postcode, latitude, longitude, home_radius_miles, digest_frequency) on table public.profiles to authenticated;

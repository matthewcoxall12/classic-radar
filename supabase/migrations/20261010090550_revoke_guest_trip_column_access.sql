-- Table-level REVOKE does not remove historical column-level grants.
-- Guest sharing uses only the explicitly enumerated bearer-token RPC.
revoke select (id,user_id,name,description,share_token,is_shared,created_at,updated_at) on public.roadbooks from anon;
revoke select (roadbook_id,event_id,position,notes,created_at) on public.roadbook_events from anon;

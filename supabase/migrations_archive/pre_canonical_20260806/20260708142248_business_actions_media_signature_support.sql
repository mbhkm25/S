-- Keep grants explicit and add stable helper function list marker.
-- No schema changes required here; media RPCs are already created.

grant execute on function public.register_business_media_asset(uuid, text, text, text, text, bigint, text, integer) to authenticated;
grant execute on function public.set_business_profile_media(uuid, text, text, jsonb, boolean) to authenticated;;

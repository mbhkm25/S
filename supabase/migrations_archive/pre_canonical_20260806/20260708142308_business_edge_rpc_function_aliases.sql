-- Add short wrapper aliases with JSON payload to reduce Edge Function parameter signature mismatches.

create or replace function public.business_action_get_team(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.get_business_team((p_payload->>'business_id')::uuid);
end;
$$;

create or replace function public.business_action_get_catalog(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.get_business_catalog((p_payload->>'business_id')::uuid, coalesce((p_payload->>'include_hidden')::boolean, false));
end;
$$;

create or replace function public.business_action_register_media_asset(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.register_business_media_asset(
    (p_payload->>'business_id')::uuid,
    p_payload->>'asset_type',
    p_payload->>'storage_path',
    p_payload->>'mime_type',
    p_payload->>'file_name',
    nullif(p_payload->>'file_size', '')::bigint,
    p_payload->>'alt_text',
    coalesce(nullif(p_payload->>'display_order', '')::integer, 100)
  );
end;
$$;

create or replace function public.business_action_set_profile_media(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.set_business_profile_media(
    (p_payload->>'business_id')::uuid,
    p_payload->>'cover_image_path',
    p_payload->>'profile_image_path',
    coalesce(p_payload->'gallery_paths', '[]'::jsonb),
    coalesce((p_payload->>'resubmit_review')::boolean, false)
  );
end;
$$;

grant execute on function public.business_action_get_team(jsonb) to authenticated;
grant execute on function public.business_action_get_catalog(jsonb) to authenticated;
grant execute on function public.business_action_register_media_asset(jsonb) to authenticated;
grant execute on function public.business_action_set_profile_media(jsonb) to authenticated;;

begin;

create or replace function public.platform_admin_update_assistant_settings(
  p_payload jsonb,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_temperature numeric;
  v_recent_limit integer;
  v_search_limit integer;
  v_grounding_limit integer;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'admin_reason_required';
  end if;

  select to_jsonb(s) into v_before
  from public.sanad_assistant_settings s
  where singleton=true
  for update;

  v_temperature := coalesce((p_payload->>'temperature')::numeric,(v_before->>'temperature')::numeric);
  v_recent_limit := coalesce((p_payload->>'recent_messages_limit')::integer,(v_before->>'recent_messages_limit')::integer);
  v_search_limit := coalesce((p_payload->>'search_results_limit')::integer,(v_before->>'search_results_limit')::integer);
  v_grounding_limit := coalesce((p_payload->>'max_grounding_units')::integer,(v_before->>'max_grounding_units')::integer);

  if v_temperature < 0 or v_temperature > 1 then raise exception 'invalid_assistant_temperature'; end if;
  if v_recent_limit < 4 or v_recent_limit > 40 then raise exception 'invalid_recent_messages_limit'; end if;
  if v_search_limit < 3 or v_search_limit > 10 then raise exception 'invalid_search_results_limit'; end if;
  if v_grounding_limit < 3 or v_grounding_limit > 8 then raise exception 'invalid_grounding_units_limit'; end if;

  update public.sanad_assistant_settings set
    enabled = coalesce((p_payload->>'enabled')::boolean,enabled),
    memory_enabled = coalesce((p_payload->>'memory_enabled')::boolean,memory_enabled),
    fast_path_enabled = coalesce((p_payload->>'fast_path_enabled')::boolean,fast_path_enabled),
    website_sync_enabled = coalesce((p_payload->>'website_sync_enabled')::boolean,website_sync_enabled),
    model = coalesce(nullif(trim(p_payload->>'model'),''),model),
    temperature = v_temperature,
    recent_messages_limit = v_recent_limit,
    search_results_limit = v_search_limit,
    max_grounding_units = v_grounding_limit,
    response_style_version = coalesce(nullif(trim(p_payload->>'response_style_version'),''),response_style_version),
    prompt_version = coalesce(nullif(trim(p_payload->>'prompt_version'),''),prompt_version),
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where singleton=true
  returning to_jsonb(sanad_assistant_settings) into v_after;

  insert into public.platform_admin_audit_log(
    actor_user_id,action,target_type,target_id,reason,before_data,after_data
  ) values (
    auth.uid(),'assistant_settings_updated','sanad_assistant_settings','singleton',trim(p_reason),v_before,v_after
  );
end;
$$;

revoke all on function public.platform_admin_update_assistant_settings(jsonb,text) from public, anon;
grant execute on function public.platform_admin_update_assistant_settings(jsonb,text) to authenticated;

commit;

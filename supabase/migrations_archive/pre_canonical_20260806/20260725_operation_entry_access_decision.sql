create or replace function public.get_operation_entry_decision(p_public_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_operation record;
  v_existing boolean := false;
  v_usage jsonb;
begin
  if v_user is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'requires_auth', true,
      'will_consume', false
    );
  end if;

  select o.id, o.token_status, o.token_expires_at
    into v_operation
  from public.operations o
  where o.public_token = p_public_token
  limit 1;

  if v_operation.id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'operation_not_found',
      'requires_auth', false,
      'will_consume', false
    );
  end if;

  if v_operation.token_status is not null and v_operation.token_status <> 'active' then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'token_not_active',
      'requires_auth', false,
      'will_consume', false
    );
  end if;

  if v_operation.token_expires_at is not null and v_operation.token_expires_at <= now() then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'token_expired',
      'requires_auth', false,
      'will_consume', false
    );
  end if;

  if not public.sanad_user_has_basic_profile(v_user) then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'profile_incomplete',
      'requires_profile', true,
      'will_consume', false
    );
  end if;

  select exists(
    select 1
    from public.operation_access_logs l
    where l.user_id = v_user
      and l.operation_id = v_operation.id
  ) into v_existing;

  v_usage := public.get_my_operation_access_usage();

  if v_existing then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'previously_opened',
      'will_consume', false,
      'usage', v_usage
    );
  end if;

  if coalesce((v_usage ->> 'remaining')::integer, 0) <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'access_limit_reached',
      'requires_subscription', true,
      'will_consume', false,
      'usage', v_usage
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'new_access_available',
    'will_consume', true,
    'usage', v_usage
  );
end;
$function$;

revoke all on function public.get_operation_entry_decision(uuid) from public;
grant execute on function public.get_operation_entry_decision(uuid) to authenticated;

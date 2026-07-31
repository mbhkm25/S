begin;

do $$
declare
  v_policy public.financial_routing_rollout_policy%rowtype;
  v_before_inbox bigint;
  v_before_links bigint;
  v_result jsonb;
begin
  if to_regclass('public.financial_routing_rollout_policy') is null
     or to_regclass('public.financial_routing_rollout_targets') is null
     or to_regclass('public.financial_routing_rollout_decisions') is null then
    raise exception 'rollout tables missing';
  end if;

  select * into v_policy from public.financial_routing_rollout_policy where singleton=true;
  if v_policy.enabled or not v_policy.emergency_stop or v_policy.rollout_mode<>'shadow' then
    raise exception 'rollout policy must default to disabled emergency-stop shadow mode';
  end if;

  if has_table_privilege('authenticated','public.financial_routing_rollout_policy','SELECT')
     or has_table_privilege('authenticated','public.financial_routing_rollout_targets','INSERT')
     or has_table_privilege('authenticated','public.financial_routing_rollout_decisions','SELECT') then
    raise exception 'rollout internals exposed directly to authenticated';
  end if;

  if not exists(
    select 1 from pg_trigger
    where tgrelid='public.operation_routing_shadow_runs'::regclass
      and tgname='trg_evaluate_financial_routing_rollout'
      and not tgisinternal
  ) then
    raise exception 'rollout evaluation trigger missing';
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.business_operation_links'::regclass
      and conname='business_operation_links_link_type_check'
      and pg_get_constraintdef(oid) like '%auto_financial_account_match%'
  ) then
    raise exception 'automatic financial account link type missing';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.platform_admin_get_financial_routing_rollout_overview()',
    'EXECUTE'
  ) then
    raise exception 'guarded rollout overview RPC unavailable';
  end if;

  select count(*) into v_before_inbox from public.business_payment_inbox;
  select count(*) into v_before_links from public.business_operation_links where link_type='auto_financial_account_match';

  if exists(select 1 from public.operation_routing_shadow_runs) then
    select private.evaluate_financial_routing_rollout(
      (select id from public.operation_routing_shadow_runs order by created_at desc limit 1)
    ) into v_result;
    if v_result->>'decision_status'<>'denied' then
      raise exception 'disabled rollout must deny evaluation: %',v_result;
    end if;
  end if;

  if (select count(*) from public.business_payment_inbox)<>v_before_inbox then
    raise exception 'disabled rollout created payment inbox item';
  end if;
  if (select count(*) from public.business_operation_links where link_type='auto_financial_account_match')<>v_before_links then
    raise exception 'disabled rollout created automatic link';
  end if;
end $$;

rollback;

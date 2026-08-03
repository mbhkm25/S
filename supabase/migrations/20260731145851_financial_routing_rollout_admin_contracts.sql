create or replace function public.platform_admin_get_financial_routing_rollout_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_policy jsonb;
  v_gate jsonb;
  v_targets jsonb;
  v_recent jsonb;
  v_counts jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;

  select to_jsonb(p) into v_policy
  from public.financial_routing_rollout_policy p where singleton=true;
  v_gate:=private.financial_routing_benchmark_gate();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'business_id',t.business_id,'business_name',bp.name,
    'financial_account_id',t.financial_account_id,'account_label',a.account_label,
    'account_holder_name',a.account_holder_name,'account_status',a.status,
    'account_verification_status',a.verification_status,'account_routing_enabled',a.routing_enabled,
    'financial_entity_code',t.financial_entity_code,'match_strategy',t.match_strategy,
    'rollout_mode',t.rollout_mode,'enabled',t.enabled,'daily_cap',t.daily_cap,
    'valid_from',t.valid_from,'valid_until',t.valid_until,'notes',t.notes,
    'created_at',t.created_at,'updated_at',t.updated_at
  ) order by t.enabled desc,t.updated_at desc),'[]'::jsonb)
  into v_targets
  from public.financial_routing_rollout_targets t
  join public.business_profiles bp on bp.id=t.business_id
  left join public.business_financial_accounts a on a.id=t.financial_account_id;

  select jsonb_build_object(
    'total',count(*),
    'denied',count(*) filter(where decision_status='denied'),
    'enqueued',count(*) filter(where decision_status='enqueued'),
    'errors',count(*) filter(where decision_status='error'),
    'enqueued_today',count(*) filter(where decision_status='enqueued' and (enqueued_at at time zone 'Asia/Aden')::date=(now() at time zone 'Asia/Aden')::date),
    'enabled_targets',(select count(*) from public.financial_routing_rollout_targets where enabled),
    'canary_targets',(select count(*) from public.financial_routing_rollout_targets where enabled and rollout_mode='canary'),
    'live_targets',(select count(*) from public.financial_routing_rollout_targets where enabled and rollout_mode='live'),
    'payment_inbox_items',(select count(*) from public.business_payment_inbox where source_mode in ('canary','live')),
    'auto_links',(select count(*) from public.business_operation_links where link_type='auto_financial_account_match' and status='linked')
  ) into v_counts
  from public.financial_routing_rollout_decisions;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_evaluated_at desc),'[]'::jsonb)
  into v_recent
  from (
    select d.id,d.shadow_run_id,d.operation_id,d.business_id,bp.name business_name,
      d.financial_account_id,a.account_label,a.account_holder_name,d.target_id,
      d.decision_status,d.rollout_mode,d.match_score,d.match_strategy,d.gate_reasons,
      d.evaluation_count,d.last_error,d.first_evaluated_at,d.last_evaluated_at,d.enqueued_at
    from public.financial_routing_rollout_decisions d
    left join public.business_profiles bp on bp.id=d.business_id
    left join public.business_financial_accounts a on a.id=d.financial_account_id
    order by d.last_evaluated_at desc limit 100
  ) x;

  return jsonb_build_object(
    'policy',v_policy,
    'benchmark_gate',v_gate,
    'targets',v_targets,
    'counts',v_counts,
    'recent_decisions',v_recent,
    'activation_ready',
      coalesce((v_gate->>'allowed')::boolean,false)
      and coalesce((v_policy->>'enabled')::boolean,false)
      and not coalesce((v_policy->>'emergency_stop')::boolean,true)
      and coalesce(v_policy->>'rollout_mode','shadow') in ('canary','live')
  );
end;
$$;
revoke all on function public.platform_admin_get_financial_routing_rollout_overview() from public;
grant execute on function public.platform_admin_get_financial_routing_rollout_overview() to authenticated;

create or replace function public.platform_admin_search_financial_routing_target_accounts(
  p_query text default null,
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_query text:=lower(nullif(trim(coalesce(p_query,'')),'')); v_limit integer:=least(greatest(coalesce(p_limit,50),1),100); v_results jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id',a.business_id,'business_name',bp.name,'financial_account_id',a.id,
    'account_label',a.account_label,'account_holder_name',a.account_holder_name,
    'financial_entity_code',a.financial_entity_code,'financial_entity_name',fe.display_name_ar,
    'status',a.status,'verification_status',a.verification_status,'routing_enabled',a.routing_enabled,
    'identifiers',coalesce((select jsonb_agg(jsonb_build_object('type',i.identifier_type,'value',i.identifier_value,'currency',i.currency,'is_primary',i.is_primary) order by i.is_primary desc,i.created_at) from public.business_financial_identifiers i where i.financial_account_id=a.id and i.status='active'),'[]'::jsonb)
  ) order by bp.name,a.updated_at desc),'[]'::jsonb)
  into v_results
  from (
    select a.* from public.business_financial_accounts a
    join public.business_profiles bpq on bpq.id=a.business_id
    where v_query is null
      or lower(coalesce(bpq.name,'')) like '%'||v_query||'%'
      or lower(coalesce(a.account_label,'')) like '%'||v_query||'%'
      or lower(coalesce(a.account_holder_name,'')) like '%'||v_query||'%'
      or exists(select 1 from public.business_financial_identifiers i where i.financial_account_id=a.id and lower(i.identifier_value) like '%'||v_query||'%')
    order by a.updated_at desc limit v_limit
  ) a
  join public.business_profiles bp on bp.id=a.business_id
  join public.financial_entities fe on fe.code=a.financial_entity_code;
  return jsonb_build_object('results',v_results);
end;
$$;
revoke all on function public.platform_admin_search_financial_routing_target_accounts(text,integer) from public;
grant execute on function public.platform_admin_search_financial_routing_target_accounts(text,integer) to authenticated;

create or replace function public.platform_admin_set_routing_benchmark_hard_block(
  p_hard_block boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_reason text:=nullif(trim(coalesce(p_reason,'')),''); v_gate jsonb; v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(coalesce(v_reason,''))<10 then raise exception 'admin_reason_required'; end if;
  v_gate:=private.financial_routing_benchmark_gate();
  if not p_hard_block and not coalesce((v_gate->>'metrics_pass')::boolean,false) then
    raise exception 'benchmark_metrics_not_passed';
  end if;
  select to_jsonb(p) into v_before from public.routing_benchmark_policy p where singleton=true;
  update public.routing_benchmark_policy
  set activation_hard_block=p_hard_block,updated_by_user_id=auth.uid(),updated_at=now(),policy_version=policy_version+1
  where singleton=true returning to_jsonb(public.routing_benchmark_policy.*) into v_after;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'routing_benchmark_hard_block_updated','routing_benchmark_policy','singleton',v_reason,v_before,v_after);
  return jsonb_build_object('ok',true,'policy',v_after,'benchmark_gate',private.financial_routing_benchmark_gate());
end;
$$;
revoke all on function public.platform_admin_set_routing_benchmark_hard_block(boolean,text) from public;
grant execute on function public.platform_admin_set_routing_benchmark_hard_block(boolean,text) to authenticated;

create or replace function public.platform_admin_update_financial_routing_rollout_policy(
  p_enabled boolean,
  p_emergency_stop boolean,
  p_rollout_mode text,
  p_minimum_match_score numeric,
  p_allowed_shadow_statuses jsonb,
  p_allowed_match_strategies jsonb,
  p_global_daily_cap integer,
  p_default_business_daily_cap integer,
  p_require_verified_financial_account boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'' );
  v_gate jsonb;
  v_before jsonb;
  v_after jsonb;
  v_value text;
  v_enabled_targets integer:=0;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(coalesce(v_reason,''))<10 then raise exception 'admin_reason_required'; end if;
  if p_rollout_mode not in ('shadow','canary','live') then raise exception 'invalid_rollout_mode'; end if;
  if jsonb_typeof(coalesce(p_allowed_shadow_statuses,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_allowed_shadow_statuses,'[]'::jsonb))=0 then raise exception 'allowed_shadow_statuses_required'; end if;
  if jsonb_typeof(coalesce(p_allowed_match_strategies,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_allowed_match_strategies,'[]'::jsonb))=0 then raise exception 'allowed_match_strategies_required'; end if;
  if p_global_daily_cap not between 1 and 10000 or p_default_business_daily_cap not between 1 and 1000 then raise exception 'invalid_daily_cap'; end if;
  if p_minimum_match_score not between 0 and 100 then raise exception 'invalid_minimum_match_score'; end if;
  if p_rollout_mode='canary' and p_minimum_match_score<95 then raise exception 'canary_minimum_match_score_is_95'; end if;
  if p_rollout_mode='live' and p_minimum_match_score<99.5 then raise exception 'live_minimum_match_score_is_99_5'; end if;

  for v_value in select jsonb_array_elements_text(p_allowed_shadow_statuses)
  loop
    if v_value not in ('high_confidence_match','probable_match') then raise exception 'unsafe_shadow_status'; end if;
  end loop;
  for v_value in select jsonb_array_elements_text(p_allowed_match_strategies)
  loop
    if v_value not in ('receiver_account','document_account','credited_account','merchant_point','globally_unique_identifier','exact_financial_identifier') then
      raise exception 'unsafe_match_strategy';
    end if;
  end loop;

  v_gate:=private.financial_routing_benchmark_gate();
  select count(*)::integer into v_enabled_targets
  from public.financial_routing_rollout_targets
  where enabled and rollout_mode=p_rollout_mode
    and (valid_from is null or valid_from<=now()) and (valid_until is null or valid_until>now());

  if p_enabled then
    if p_emergency_stop then raise exception 'cannot_enable_with_emergency_stop'; end if;
    if p_rollout_mode='shadow' then raise exception 'cannot_enable_shadow_mode'; end if;
    if not coalesce((v_gate->>'allowed')::boolean,false) then raise exception 'benchmark_gate_not_passed'; end if;
    if v_enabled_targets=0 then raise exception 'enabled_rollout_target_required'; end if;
  end if;

  select to_jsonb(p) into v_before from public.financial_routing_rollout_policy p where singleton=true;
  update public.financial_routing_rollout_policy
  set enabled=p_enabled,emergency_stop=p_emergency_stop,rollout_mode=p_rollout_mode,
      minimum_match_score=p_minimum_match_score,allowed_shadow_statuses=p_allowed_shadow_statuses,
      allowed_match_strategies=p_allowed_match_strategies,global_daily_cap=p_global_daily_cap,
      default_business_daily_cap=p_default_business_daily_cap,
      require_verified_financial_account=p_require_verified_financial_account,
      policy_version=policy_version+1,updated_by_user_id=auth.uid(),updated_at=now()
  where singleton=true returning to_jsonb(public.financial_routing_rollout_policy.*) into v_after;

  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'financial_routing_rollout_policy_updated','financial_routing_rollout_policy','singleton',v_reason,v_before,v_after);
  return jsonb_build_object('ok',true,'policy',v_after,'benchmark_gate',v_gate,'enabled_targets',v_enabled_targets);
end;
$$;
revoke all on function public.platform_admin_update_financial_routing_rollout_policy(boolean,boolean,text,numeric,jsonb,jsonb,integer,integer,boolean,text) from public;
grant execute on function public.platform_admin_update_financial_routing_rollout_policy(boolean,boolean,text,numeric,jsonb,jsonb,integer,integer,boolean,text) to authenticated;

create or replace function public.platform_admin_emergency_stop_financial_routing(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_reason text:=nullif(trim(coalesce(p_reason,'')),'' ); v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(coalesce(v_reason,''))<10 then raise exception 'admin_reason_required'; end if;
  select to_jsonb(p) into v_before from public.financial_routing_rollout_policy p where singleton=true;
  update public.financial_routing_rollout_policy
  set enabled=false,emergency_stop=true,policy_version=policy_version+1,updated_by_user_id=auth.uid(),updated_at=now()
  where singleton=true returning to_jsonb(public.financial_routing_rollout_policy.*) into v_after;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'financial_routing_emergency_stop','financial_routing_rollout_policy','singleton',v_reason,v_before,v_after);
  return jsonb_build_object('ok',true,'policy',v_after);
end;
$$;
revoke all on function public.platform_admin_emergency_stop_financial_routing(text) from public;
grant execute on function public.platform_admin_emergency_stop_financial_routing(text) to authenticated;

create or replace function public.platform_admin_upsert_financial_routing_rollout_target(
  p_target_id uuid,
  p_business_id uuid,
  p_financial_account_id uuid,
  p_financial_entity_code text,
  p_match_strategy text,
  p_rollout_mode text,
  p_enabled boolean,
  p_daily_cap integer,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_notes text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'' );
  v_account public.business_financial_accounts%rowtype;
  v_target public.financial_routing_rollout_targets%rowtype;
  v_before jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(coalesce(v_reason,''))<10 then raise exception 'admin_reason_required'; end if;
  if p_rollout_mode not in ('canary','live') then raise exception 'invalid_rollout_mode'; end if;
  if p_daily_cap not between 1 and 1000 then raise exception 'invalid_daily_cap'; end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until<=p_valid_from then raise exception 'invalid_target_window'; end if;
  if p_match_strategy is not null and p_match_strategy not in ('receiver_account','document_account','credited_account','merchant_point','globally_unique_identifier','exact_financial_identifier') then raise exception 'unsafe_match_strategy'; end if;
  if not exists(select 1 from public.business_profiles where id=p_business_id) then raise exception 'business_not_found'; end if;

  if p_financial_account_id is not null then
    select * into v_account from public.business_financial_accounts where id=p_financial_account_id;
    if not found then raise exception 'financial_account_not_found'; end if;
    if v_account.business_id<>p_business_id then raise exception 'financial_account_business_conflict'; end if;
    if p_financial_entity_code is not null and v_account.financial_entity_code<>p_financial_entity_code then raise exception 'financial_entity_account_conflict'; end if;
    if p_enabled and (v_account.status<>'active' or not v_account.routing_enabled or v_account.verification_status<>'verified') then
      raise exception 'enabled_target_requires_verified_routing_account';
    end if;
  elsif p_enabled then
    raise exception 'enabled_target_requires_specific_financial_account';
  end if;

  if p_target_id is not null then
    select to_jsonb(t) into v_before from public.financial_routing_rollout_targets t where id=p_target_id;
    if v_before is null then raise exception 'rollout_target_not_found'; end if;
    update public.financial_routing_rollout_targets
    set business_id=p_business_id,financial_account_id=p_financial_account_id,
        financial_entity_code=coalesce(p_financial_entity_code,v_account.financial_entity_code),
        match_strategy=nullif(trim(coalesce(p_match_strategy,'')),''),rollout_mode=p_rollout_mode,
        enabled=p_enabled,daily_cap=p_daily_cap,valid_from=p_valid_from,valid_until=p_valid_until,
        notes=left(nullif(trim(coalesce(p_notes,'')),''),1000),updated_by_user_id=auth.uid(),updated_at=now()
    where id=p_target_id returning * into v_target;
  else
    insert into public.financial_routing_rollout_targets(
      business_id,financial_account_id,financial_entity_code,match_strategy,rollout_mode,enabled,
      daily_cap,valid_from,valid_until,notes,created_by_user_id,updated_by_user_id
    ) values(
      p_business_id,p_financial_account_id,coalesce(p_financial_entity_code,v_account.financial_entity_code),
      nullif(trim(coalesce(p_match_strategy,'')),''),p_rollout_mode,p_enabled,p_daily_cap,p_valid_from,p_valid_until,
      left(nullif(trim(coalesce(p_notes,'')),''),1000),auth.uid(),auth.uid()
    ) returning * into v_target;
  end if;

  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'financial_routing_rollout_target_upserted','financial_routing_rollout_target',v_target.id::text,v_reason,v_before,to_jsonb(v_target));
  return jsonb_build_object('ok',true,'target',to_jsonb(v_target));
end;
$$;
revoke all on function public.platform_admin_upsert_financial_routing_rollout_target(uuid,uuid,uuid,text,text,text,boolean,integer,timestamptz,timestamptz,text,text) from public;
grant execute on function public.platform_admin_upsert_financial_routing_rollout_target(uuid,uuid,uuid,text,text,text,boolean,integer,timestamptz,timestamptz,text,text) to authenticated;

create or replace function public.platform_admin_disable_financial_routing_rollout_target(
  p_target_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_reason text:=nullif(trim(coalesce(p_reason,'')),'' ); v_before jsonb; v_target public.financial_routing_rollout_targets%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(coalesce(v_reason,''))<10 then raise exception 'admin_reason_required'; end if;
  select to_jsonb(t) into v_before from public.financial_routing_rollout_targets t where id=p_target_id;
  if v_before is null then raise exception 'rollout_target_not_found'; end if;
  update public.financial_routing_rollout_targets set enabled=false,updated_by_user_id=auth.uid(),updated_at=now()
  where id=p_target_id returning * into v_target;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'financial_routing_rollout_target_disabled','financial_routing_rollout_target',p_target_id::text,v_reason,v_before,to_jsonb(v_target));
  return jsonb_build_object('ok',true,'target',to_jsonb(v_target));
end;
$$;
revoke all on function public.platform_admin_disable_financial_routing_rollout_target(uuid,text) from public;
grant execute on function public.platform_admin_disable_financial_routing_rollout_target(uuid,text) to authenticated;

create or replace function public.platform_admin_reevaluate_financial_routing_shadow_run(
  p_shadow_run_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_reason text:=nullif(trim(coalesce(p_reason,'')),'' ); v_result jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(coalesce(v_reason,''))<10 then raise exception 'admin_reason_required'; end if;
  v_result:=private.evaluate_financial_routing_rollout(p_shadow_run_id);
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,after_data)
  values(auth.uid(),'financial_routing_shadow_run_reevaluated','operation_routing_shadow_run',p_shadow_run_id::text,v_reason,v_result);
  return v_result;
end;
$$;
revoke all on function public.platform_admin_reevaluate_financial_routing_shadow_run(uuid,text) from public;
grant execute on function public.platform_admin_reevaluate_financial_routing_shadow_run(uuid,text) to authenticated;

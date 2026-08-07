alter table public.business_payment_inbox
  drop constraint business_payment_inbox_match_score_check;
alter table public.business_payment_inbox
  add constraint business_payment_inbox_match_score_check
  check (match_score is null or (match_score >= 0 and match_score <= 100));

alter table public.business_operation_links
  alter column linked_by_user_id drop not null;
alter table public.business_operation_links
  drop constraint business_operation_links_link_type_check;
alter table public.business_operation_links
  add constraint business_operation_links_link_type_check
  check (link_type in ('manual_after_verification','owner_linked','admin_linked','auto_financial_account_match'));

create table public.financial_routing_rollout_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  emergency_stop boolean not null default true,
  rollout_mode text not null default 'shadow' check (rollout_mode in ('shadow','canary','live')),
  minimum_match_score numeric not null default 99.5 check (minimum_match_score between 0 and 100),
  allowed_shadow_statuses jsonb not null default '["high_confidence_match"]'::jsonb check (jsonb_typeof(allowed_shadow_statuses)='array'),
  allowed_match_strategies jsonb not null default '["receiver_account"]'::jsonb check (jsonb_typeof(allowed_match_strategies)='array'),
  blocked_warning_codes jsonb not null default '["possible_fraud","document_title_contradicts_transaction_details","sender_receiver_conflict","wrong_selected_operation","ambiguous_account_numbers_in_details"]'::jsonb check (jsonb_typeof(blocked_warning_codes)='array'),
  minimum_analysis_contract_version integer not null default 2 check (minimum_analysis_contract_version >= 1),
  require_verified_financial_account boolean not null default true,
  require_benchmark_gate boolean not null default true,
  global_daily_cap integer not null default 10 check (global_daily_cap between 1 and 10000),
  default_business_daily_cap integer not null default 3 check (default_business_daily_cap between 1 and 1000),
  policy_version integer not null default 1 check (policy_version >= 1),
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.financial_routing_rollout_policy(singleton)
values(true)
on conflict(singleton) do nothing;

create table public.financial_routing_rollout_targets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  financial_account_id uuid references public.business_financial_accounts(id) on delete cascade,
  financial_entity_code text references public.financial_entities(code),
  match_strategy text,
  rollout_mode text not null default 'canary' check (rollout_mode in ('canary','live')),
  enabled boolean not null default false,
  daily_cap integer not null default 3 check (daily_cap between 1 and 1000),
  valid_from timestamptz,
  valid_until timestamptz,
  notes text,
  created_by_user_id uuid not null references public.profiles(id),
  updated_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create unique index financial_routing_rollout_targets_scope_uidx
on public.financial_routing_rollout_targets(
  business_id,
  coalesce(financial_account_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(financial_entity_code,''),
  coalesce(match_strategy,''),
  rollout_mode
);
create index financial_routing_rollout_targets_active_idx
on public.financial_routing_rollout_targets(enabled,rollout_mode,business_id,updated_at desc);
create index financial_routing_rollout_targets_account_idx
on public.financial_routing_rollout_targets(financial_account_id)
where financial_account_id is not null;
create index financial_routing_rollout_targets_created_by_idx
on public.financial_routing_rollout_targets(created_by_user_id);
create index financial_routing_rollout_targets_updated_by_idx
on public.financial_routing_rollout_targets(updated_by_user_id);

create table public.financial_routing_rollout_decisions (
  id uuid primary key default gen_random_uuid(),
  shadow_run_id uuid not null unique references public.operation_routing_shadow_runs(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  business_id uuid references public.business_profiles(id) on delete set null,
  financial_account_id uuid references public.business_financial_accounts(id) on delete set null,
  target_id uuid references public.financial_routing_rollout_targets(id) on delete set null,
  decision_status text not null check (decision_status in ('denied','enqueued','already_processed','error')),
  rollout_mode text not null check (rollout_mode in ('shadow','canary','live')),
  match_score numeric,
  match_strategy text,
  gate_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(gate_reasons)='array'),
  policy_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(policy_snapshot)='object'),
  benchmark_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(benchmark_snapshot)='object'),
  business_operation_link_id uuid references public.business_operation_links(id) on delete set null,
  payment_inbox_id uuid references public.business_payment_inbox(id) on delete set null,
  evaluation_count integer not null default 1 check (evaluation_count >= 1),
  last_error text,
  first_evaluated_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  enqueued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_routing_rollout_decisions_status_idx
on public.financial_routing_rollout_decisions(decision_status,last_evaluated_at desc);
create index financial_routing_rollout_decisions_business_idx
on public.financial_routing_rollout_decisions(business_id,decision_status,created_at desc)
where business_id is not null;
create index financial_routing_rollout_decisions_operation_idx
on public.financial_routing_rollout_decisions(operation_id);
create index financial_routing_rollout_decisions_account_idx
on public.financial_routing_rollout_decisions(financial_account_id)
where financial_account_id is not null;
create index financial_routing_rollout_decisions_target_idx
on public.financial_routing_rollout_decisions(target_id)
where target_id is not null;
create index financial_routing_rollout_decisions_link_idx
on public.financial_routing_rollout_decisions(business_operation_link_id)
where business_operation_link_id is not null;
create index financial_routing_rollout_decisions_inbox_idx
on public.financial_routing_rollout_decisions(payment_inbox_id)
where payment_inbox_id is not null;

alter table public.financial_routing_rollout_policy enable row level security;
alter table public.financial_routing_rollout_targets enable row level security;
alter table public.financial_routing_rollout_decisions enable row level security;
revoke all on public.financial_routing_rollout_policy from public,anon,authenticated;
revoke all on public.financial_routing_rollout_targets from public,anon,authenticated;
revoke all on public.financial_routing_rollout_decisions from public,anon,authenticated;

create or replace function private.financial_routing_benchmark_gate()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_policy public.routing_benchmark_policy%rowtype;
  v_reviews integer:=0;
  v_tp integer:=0;
  v_fp integer:=0;
  v_fn integer:=0;
  v_unreviewable integer:=0;
  v_min_segment integer:=0;
  v_precision numeric:=0;
  v_recall numeric:=0;
  v_false_positive_rate numeric:=0;
  v_unreviewable_rate numeric:=0;
  v_metrics_pass boolean:=false;
begin
  select * into v_policy from public.routing_benchmark_policy where singleton=true;

  with current_reviews as (
    select r.routing_verdict,
      coalesce(r.corrected_financial_entity_code,o.financial_entity_code,'unknown') as entity_code,
      coalesce(r.corrected_document_template,o.document_template,'unknown') as document_template
    from public.operation_routing_benchmark_reviews r
    join public.operation_routing_benchmark_cases c on c.id=r.case_id
    join public.operations o on o.id=c.operation_id
    where r.superseded_at is null and c.cohort='contract_v2_live' and c.review_stage='finalized'
  )
  select count(*)::integer,
    count(*) filter(where routing_verdict='correct_match')::integer,
    count(*) filter(where routing_verdict='wrong_match')::integer,
    count(*) filter(where routing_verdict='missed_match')::integer,
    count(*) filter(where routing_verdict='unreviewable')::integer
  into v_reviews,v_tp,v_fp,v_fn,v_unreviewable
  from current_reviews;

  with segments as (
    select coalesce(r.corrected_financial_entity_code,o.financial_entity_code,'unknown') entity_code,
      coalesce(r.corrected_document_template,o.document_template,'unknown') document_template,
      count(*)::integer reviewed_count
    from public.operation_routing_benchmark_reviews r
    join public.operation_routing_benchmark_cases c on c.id=r.case_id
    join public.operations o on o.id=c.operation_id
    where r.superseded_at is null and c.cohort='contract_v2_live' and c.review_stage='finalized'
    group by 1,2
  )
  select coalesce(min(reviewed_count),0) into v_min_segment from segments;

  v_precision:=case when v_tp+v_fp>0 then v_tp::numeric/(v_tp+v_fp) else 0 end;
  v_recall:=case when v_tp+v_fn>0 then v_tp::numeric/(v_tp+v_fn) else 0 end;
  v_false_positive_rate:=case when v_tp+v_fp>0 then v_fp::numeric/(v_tp+v_fp) else 0 end;
  v_unreviewable_rate:=case when v_reviews>0 then v_unreviewable::numeric/v_reviews else 0 end;

  v_metrics_pass:=
    v_reviews>=v_policy.minimum_contract_v2_reviews
    and v_min_segment>=v_policy.minimum_reviews_per_entity_template
    and v_precision>=v_policy.minimum_routing_precision
    and v_recall>=v_policy.minimum_routing_recall
    and v_false_positive_rate<=v_policy.maximum_false_positive_rate
    and v_unreviewable_rate<=v_policy.maximum_unreviewable_rate;

  return jsonb_build_object(
    'allowed',(not v_policy.activation_hard_block) and v_metrics_pass,
    'activation_hard_block',v_policy.activation_hard_block,
    'metrics_pass',v_metrics_pass,
    'policy_version',v_policy.policy_version,
    'minimum_contract_v2_reviews',v_policy.minimum_contract_v2_reviews,
    'minimum_reviews_per_entity_template',v_policy.minimum_reviews_per_entity_template,
    'minimum_routing_precision',v_policy.minimum_routing_precision,
    'minimum_routing_recall',v_policy.minimum_routing_recall,
    'maximum_false_positive_rate',v_policy.maximum_false_positive_rate,
    'maximum_unreviewable_rate',v_policy.maximum_unreviewable_rate,
    'contract_v2_reviews',v_reviews,
    'minimum_reviewed_segment',v_min_segment,
    'true_positives',v_tp,
    'false_positives',v_fp,
    'false_negatives',v_fn,
    'unreviewable',v_unreviewable,
    'routing_precision',v_precision,
    'routing_recall',v_recall,
    'false_positive_rate',v_false_positive_rate,
    'unreviewable_rate',v_unreviewable_rate
  );
end;
$$;
revoke all on function private.financial_routing_benchmark_gate() from public;

create or replace function private.enqueue_business_payment_inbox_system(
  p_business_id uuid,
  p_operation_id uuid,
  p_shadow_run_id uuid,
  p_financial_account_id uuid,
  p_source_mode text,
  p_match_score numeric,
  p_match_strategy text,
  p_routing_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_item public.business_payment_inbox%rowtype; v_created boolean:=false;
begin
  insert into public.business_payment_inbox(
    business_id,operation_id,routing_shadow_run_id,financial_account_id,source_mode,status,
    priority,match_score,match_strategy,routing_snapshot
  ) values(
    p_business_id,p_operation_id,p_shadow_run_id,p_financial_account_id,p_source_mode,'new',
    90,p_match_score,left(p_match_strategy,120),coalesce(p_routing_snapshot,'{}'::jsonb)
  )
  on conflict(business_id,operation_id) do nothing
  returning * into v_item;

  v_created:=v_item.id is not null;
  if not v_created then
    select * into v_item from public.business_payment_inbox
    where business_id=p_business_id and operation_id=p_operation_id;
  end if;

  if v_created then
    perform private.record_business_payment_inbox_event(
      v_item.id,'enqueued',null,null,'new','financial_routing_rollout',
      jsonb_build_object('source_mode',p_source_mode,'shadow_run_id',p_shadow_run_id)
    );
    perform private.notify_business_payment_inbox(v_item.id);
  end if;

  return v_item.id;
end;
$$;
revoke all on function private.enqueue_business_payment_inbox_system(uuid,uuid,uuid,uuid,text,numeric,text,jsonb) from public;

create or replace function private.evaluate_financial_routing_rollout(p_shadow_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.operation_routing_shadow_runs%rowtype;
  v_operation public.operations%rowtype;
  v_account public.business_financial_accounts%rowtype;
  v_policy public.financial_routing_rollout_policy%rowtype;
  v_target public.financial_routing_rollout_targets%rowtype;
  v_existing public.financial_routing_rollout_decisions%rowtype;
  v_gate jsonb;
  v_reasons jsonb:='[]'::jsonb;
  v_policy_snapshot jsonb;
  v_segment_reviews integer:=0;
  v_global_today integer:=0;
  v_business_today integer:=0;
  v_target_today integer:=0;
  v_link public.business_operation_links%rowtype;
  v_inbox_id uuid;
  v_now timestamptz:=now();
  v_mode text;
begin
  select * into v_run from public.operation_routing_shadow_runs where id=p_shadow_run_id for update;
  if not found then raise exception 'routing_shadow_run_not_found'; end if;

  select * into v_operation from public.operations where id=v_run.operation_id;
  select * into v_policy from public.financial_routing_rollout_policy where singleton=true;
  v_gate:=private.financial_routing_benchmark_gate();
  v_mode:=coalesce(v_policy.rollout_mode,'shadow');
  v_policy_snapshot:=jsonb_build_object(
    'enabled',v_policy.enabled,'emergency_stop',v_policy.emergency_stop,'rollout_mode',v_policy.rollout_mode,
    'minimum_match_score',v_policy.minimum_match_score,'allowed_shadow_statuses',v_policy.allowed_shadow_statuses,
    'allowed_match_strategies',v_policy.allowed_match_strategies,'blocked_warning_codes',v_policy.blocked_warning_codes,
    'minimum_analysis_contract_version',v_policy.minimum_analysis_contract_version,
    'require_verified_financial_account',v_policy.require_verified_financial_account,
    'require_benchmark_gate',v_policy.require_benchmark_gate,'global_daily_cap',v_policy.global_daily_cap,
    'default_business_daily_cap',v_policy.default_business_daily_cap,'policy_version',v_policy.policy_version
  );

  select * into v_existing from public.financial_routing_rollout_decisions where shadow_run_id=p_shadow_run_id for update;
  if found and v_existing.decision_status in ('enqueued','already_processed') then
    return jsonb_build_object('ok',true,'decision_status',v_existing.decision_status,'decision_id',v_existing.id,'idempotent',true);
  end if;

  if not v_policy.enabled then v_reasons:=v_reasons||jsonb_build_array('policy_disabled'); end if;
  if v_policy.emergency_stop then v_reasons:=v_reasons||jsonb_build_array('emergency_stop'); end if;
  if v_policy.rollout_mode='shadow' then v_reasons:=v_reasons||jsonb_build_array('rollout_mode_shadow'); end if;
  if v_policy.require_benchmark_gate and not coalesce((v_gate->>'allowed')::boolean,false) then
    v_reasons:=v_reasons||jsonb_build_array('benchmark_gate_not_passed');
  end if;
  if v_operation.analysis_contract_version<v_policy.minimum_analysis_contract_version then
    v_reasons:=v_reasons||jsonb_build_array('analysis_contract_too_old');
  end if;
  if v_operation.ai_status<>'completed' then v_reasons:=v_reasons||jsonb_build_array('analysis_not_completed'); end if;
  if coalesce(v_operation.possible_fraud,false) then v_reasons:=v_reasons||jsonb_build_array('possible_fraud'); end if;
  if v_run.matched_business_id is null or v_run.matched_account_id is null then
    v_reasons:=v_reasons||jsonb_build_array('missing_matched_business_or_account');
  end if;
  if coalesce(v_run.candidate_count,0)<>1 then v_reasons:=v_reasons||jsonb_build_array('candidate_count_not_one'); end if;
  if coalesce(v_run.match_score,0)<v_policy.minimum_match_score then v_reasons:=v_reasons||jsonb_build_array('match_score_below_policy'); end if;
  if not exists(select 1 from jsonb_array_elements_text(v_policy.allowed_shadow_statuses) x where x.value=v_run.status) then
    v_reasons:=v_reasons||jsonb_build_array('shadow_status_not_allowed');
  end if;
  if not exists(select 1 from jsonb_array_elements_text(v_policy.allowed_match_strategies) x where x.value=coalesce(v_run.match_strategy,'')) then
    v_reasons:=v_reasons||jsonb_build_array('match_strategy_not_allowed');
  end if;
  if exists(
    select 1
    from jsonb_array_elements_text(coalesce(v_operation.sanad_warnings,'[]'::jsonb)) warning
    join jsonb_array_elements_text(v_policy.blocked_warning_codes) blocked on blocked.value=warning.value
  ) then
    v_reasons:=v_reasons||jsonb_build_array('blocked_operation_warning');
  end if;

  if v_run.matched_account_id is not null then
    select * into v_account from public.business_financial_accounts where id=v_run.matched_account_id;
    if not found then
      v_reasons:=v_reasons||jsonb_build_array('financial_account_not_found');
    else
      if v_account.business_id is distinct from v_run.matched_business_id then
        v_reasons:=v_reasons||jsonb_build_array('financial_account_business_conflict');
      end if;
      if v_account.status<>'active' then v_reasons:=v_reasons||jsonb_build_array('financial_account_inactive'); end if;
      if not v_account.routing_enabled then v_reasons:=v_reasons||jsonb_build_array('financial_account_routing_disabled'); end if;
      if v_policy.require_verified_financial_account and v_account.verification_status<>'verified' then
        v_reasons:=v_reasons||jsonb_build_array('financial_account_not_verified');
      end if;
    end if;
  end if;

  select count(*)::integer into v_segment_reviews
  from public.operation_routing_benchmark_reviews r
  join public.operation_routing_benchmark_cases c on c.id=r.case_id
  join public.operations o on o.id=c.operation_id
  where r.superseded_at is null and c.cohort='contract_v2_live' and c.review_stage='finalized'
    and coalesce(r.corrected_financial_entity_code,o.financial_entity_code,'unknown')=coalesce(v_run.financial_entity_code,'unknown')
    and coalesce(r.corrected_document_template,o.document_template,'unknown')=coalesce(v_operation.document_template,'unknown');

  if v_segment_reviews < coalesce((v_gate->>'minimum_reviews_per_entity_template')::integer,20) then
    v_reasons:=v_reasons||jsonb_build_array('benchmark_segment_sample_insufficient');
  end if;

  select * into v_target
  from public.financial_routing_rollout_targets t
  where t.enabled and t.business_id=v_run.matched_business_id
    and t.rollout_mode=v_policy.rollout_mode
    and (t.financial_account_id is null or t.financial_account_id=v_run.matched_account_id)
    and (t.financial_entity_code is null or t.financial_entity_code=v_run.financial_entity_code)
    and (t.match_strategy is null or t.match_strategy=v_run.match_strategy)
    and (t.valid_from is null or t.valid_from<=v_now)
    and (t.valid_until is null or t.valid_until>v_now)
  order by
    ((t.financial_account_id is not null)::integer+(t.financial_entity_code is not null)::integer+(t.match_strategy is not null)::integer) desc,
    t.updated_at desc
  limit 1;

  if not found then v_reasons:=v_reasons||jsonb_build_array('no_enabled_rollout_target'); end if;

  select count(*)::integer into v_global_today
  from public.financial_routing_rollout_decisions d
  where d.decision_status='enqueued'
    and (d.enqueued_at at time zone 'Asia/Aden')::date=(v_now at time zone 'Asia/Aden')::date;
  if v_global_today>=v_policy.global_daily_cap then v_reasons:=v_reasons||jsonb_build_array('global_daily_cap_reached'); end if;

  if v_run.matched_business_id is not null then
    select count(*)::integer into v_business_today
    from public.financial_routing_rollout_decisions d
    where d.decision_status='enqueued' and d.business_id=v_run.matched_business_id
      and (d.enqueued_at at time zone 'Asia/Aden')::date=(v_now at time zone 'Asia/Aden')::date;
    if v_business_today>=v_policy.default_business_daily_cap then
      v_reasons:=v_reasons||jsonb_build_array('business_daily_cap_reached');
    end if;
  end if;

  if v_target.id is not null then
    select count(*)::integer into v_target_today
    from public.financial_routing_rollout_decisions d
    where d.decision_status='enqueued' and d.target_id=v_target.id
      and (d.enqueued_at at time zone 'Asia/Aden')::date=(v_now at time zone 'Asia/Aden')::date;
    if v_target_today>=v_target.daily_cap then v_reasons:=v_reasons||jsonb_build_array('target_daily_cap_reached'); end if;
  end if;

  if exists(
    select 1 from public.business_operation_links l
    where l.operation_id=v_run.operation_id and l.status='linked'
      and l.business_id is distinct from v_run.matched_business_id
  ) then
    v_reasons:=v_reasons||jsonb_build_array('operation_linked_to_different_business');
  end if;
  if exists(
    select 1 from public.business_operation_links l
    where l.operation_id=v_run.operation_id and l.business_id=v_run.matched_business_id and l.status='unlinked'
  ) then
    v_reasons:=v_reasons||jsonb_build_array('existing_business_link_unlinked');
  end if;

  if jsonb_array_length(v_reasons)>0 then
    insert into public.financial_routing_rollout_decisions(
      shadow_run_id,operation_id,business_id,financial_account_id,target_id,decision_status,
      rollout_mode,match_score,match_strategy,gate_reasons,policy_snapshot,benchmark_snapshot
    ) values(
      v_run.id,v_run.operation_id,v_run.matched_business_id,v_run.matched_account_id,v_target.id,'denied',
      v_mode,v_run.match_score,v_run.match_strategy,v_reasons,v_policy_snapshot,v_gate
    )
    on conflict(shadow_run_id) do update set
      business_id=excluded.business_id,financial_account_id=excluded.financial_account_id,target_id=excluded.target_id,
      decision_status='denied',rollout_mode=excluded.rollout_mode,match_score=excluded.match_score,
      match_strategy=excluded.match_strategy,gate_reasons=excluded.gate_reasons,
      policy_snapshot=excluded.policy_snapshot,benchmark_snapshot=excluded.benchmark_snapshot,
      evaluation_count=public.financial_routing_rollout_decisions.evaluation_count+1,
      last_error=null,last_evaluated_at=now(),updated_at=now();
    return jsonb_build_object('ok',true,'decision_status','denied','gate_reasons',v_reasons,'benchmark_gate',v_gate);
  end if;

  select * into v_link from public.business_operation_links
  where business_id=v_run.matched_business_id and operation_id=v_run.operation_id;

  if not found then
    insert into public.business_operation_links(
      business_id,operation_id,linked_by_user_id,link_type,status,metadata,verification_status,verified_by_user_id
    ) values(
      v_run.matched_business_id,v_run.operation_id,null,'auto_financial_account_match','linked',
      jsonb_build_object('source','financial_routing_rollout','shadow_run_id',v_run.id,'target_id',v_target.id,'policy_version',v_policy.policy_version),
      'not_applicable',null
    ) returning * into v_link;
  end if;

  v_inbox_id:=private.enqueue_business_payment_inbox_system(
    v_run.matched_business_id,v_run.operation_id,v_run.id,v_run.matched_account_id,
    v_policy.rollout_mode,v_run.match_score,v_run.match_strategy,
    jsonb_build_object('shadow_run_id',v_run.id,'target_id',v_target.id,'policy_version',v_policy.policy_version,'benchmark_gate',v_gate)
  );

  insert into public.financial_routing_rollout_decisions(
    shadow_run_id,operation_id,business_id,financial_account_id,target_id,decision_status,
    rollout_mode,match_score,match_strategy,gate_reasons,policy_snapshot,benchmark_snapshot,
    business_operation_link_id,payment_inbox_id,enqueued_at
  ) values(
    v_run.id,v_run.operation_id,v_run.matched_business_id,v_run.matched_account_id,v_target.id,'enqueued',
    v_policy.rollout_mode,v_run.match_score,v_run.match_strategy,'[]'::jsonb,v_policy_snapshot,v_gate,
    v_link.id,v_inbox_id,now()
  )
  on conflict(shadow_run_id) do update set
    business_id=excluded.business_id,financial_account_id=excluded.financial_account_id,target_id=excluded.target_id,
    decision_status='enqueued',rollout_mode=excluded.rollout_mode,match_score=excluded.match_score,
    match_strategy=excluded.match_strategy,gate_reasons='[]'::jsonb,policy_snapshot=excluded.policy_snapshot,
    benchmark_snapshot=excluded.benchmark_snapshot,business_operation_link_id=excluded.business_operation_link_id,
    payment_inbox_id=excluded.payment_inbox_id,evaluation_count=public.financial_routing_rollout_decisions.evaluation_count+1,
    last_error=null,last_evaluated_at=now(),enqueued_at=coalesce(public.financial_routing_rollout_decisions.enqueued_at,now()),updated_at=now();

  return jsonb_build_object('ok',true,'decision_status','enqueued','link_id',v_link.id,'payment_inbox_id',v_inbox_id,'rollout_mode',v_policy.rollout_mode);
exception when others then
  insert into public.financial_routing_rollout_decisions(
    shadow_run_id,operation_id,business_id,financial_account_id,decision_status,rollout_mode,
    match_score,match_strategy,gate_reasons,policy_snapshot,benchmark_snapshot,last_error
  ) values(
    p_shadow_run_id,coalesce(v_run.operation_id,'00000000-0000-0000-0000-000000000000'::uuid),
    v_run.matched_business_id,v_run.matched_account_id,'error',coalesce(v_mode,'shadow'),
    v_run.match_score,v_run.match_strategy,jsonb_build_array('evaluation_error'),
    coalesce(v_policy_snapshot,'{}'::jsonb),coalesce(v_gate,'{}'::jsonb),left(sqlerrm,1500)
  )
  on conflict(shadow_run_id) do update set
    decision_status='error',gate_reasons=jsonb_build_array('evaluation_error'),last_error=left(sqlerrm,1500),
    evaluation_count=public.financial_routing_rollout_decisions.evaluation_count+1,last_evaluated_at=now(),updated_at=now();
  return jsonb_build_object('ok',false,'decision_status','error','error',sqlerrm);
end;
$$;
revoke all on function private.evaluate_financial_routing_rollout(uuid) from public;

create or replace function private.trigger_financial_routing_rollout()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.evaluate_financial_routing_rollout(new.id);
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function private.trigger_financial_routing_rollout() from public;

drop trigger if exists trg_evaluate_financial_routing_rollout on public.operation_routing_shadow_runs;
create trigger trg_evaluate_financial_routing_rollout
after insert on public.operation_routing_shadow_runs
for each row execute function private.trigger_financial_routing_rollout();

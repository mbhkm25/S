-- Payment inbox activation should be operational, not blocked by rollout governance.
-- A unique exact financial identifier match may enter the inbox for human handling.
-- Automatic bank certainty is not asserted by this change.

create or replace function private.evaluate_financial_routing_rollout(p_shadow_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.operation_routing_shadow_runs%rowtype;
  v_operation public.operations%rowtype;
  v_account public.business_financial_accounts%rowtype;
  v_existing public.financial_routing_rollout_decisions%rowtype;
  v_reasons jsonb := '[]'::jsonb;
  v_link public.business_operation_links%rowtype;
  v_inbox_id uuid;
  v_snapshot jsonb;
begin
  select * into v_run
  from public.operation_routing_shadow_runs
  where id = p_shadow_run_id
  for update;

  if not found then
    raise exception 'routing_shadow_run_not_found';
  end if;

  select * into v_operation
  from public.operations
  where id = v_run.operation_id;

  if not found then
    raise exception 'routing_operation_not_found';
  end if;

  select * into v_existing
  from public.financial_routing_rollout_decisions
  where shadow_run_id = p_shadow_run_id
  for update;

  if found and v_existing.decision_status in ('enqueued', 'already_processed') then
    return jsonb_build_object(
      'ok', true,
      'decision_status', v_existing.decision_status,
      'decision_id', v_existing.id,
      'payment_inbox_id', v_existing.payment_inbox_id,
      'idempotent', true
    );
  end if;

  -- Keep only hard operational blockers.
  if v_operation.ai_status <> 'completed' then
    v_reasons := v_reasons || jsonb_build_array('analysis_not_completed');
  end if;

  if coalesce(v_operation.possible_fraud, false) then
    v_reasons := v_reasons || jsonb_build_array('possible_fraud');
  end if;

  if v_run.matched_business_id is null or v_run.matched_account_id is null then
    v_reasons := v_reasons || jsonb_build_array('missing_matched_business_or_account');
  end if;

  if coalesce(v_run.candidate_count, 0) <> 1 then
    v_reasons := v_reasons || jsonb_build_array('candidate_count_not_one');
  end if;

  if v_run.status <> 'high_confidence_match' then
    v_reasons := v_reasons || jsonb_build_array('match_not_high_confidence');
  end if;

  if v_run.matched_account_id is not null then
    select * into v_account
    from public.business_financial_accounts
    where id = v_run.matched_account_id;

    if not found then
      v_reasons := v_reasons || jsonb_build_array('financial_account_not_found');
    else
      if v_account.business_id is distinct from v_run.matched_business_id then
        v_reasons := v_reasons || jsonb_build_array('financial_account_business_conflict');
      end if;
      if v_account.status <> 'active' then
        v_reasons := v_reasons || jsonb_build_array('financial_account_inactive');
      end if;
      if not v_account.routing_enabled then
        v_reasons := v_reasons || jsonb_build_array('financial_account_routing_disabled');
      end if;
    end if;
  end if;

  if exists (
    select 1
    from public.business_operation_links l
    where l.operation_id = v_run.operation_id
      and l.status = 'linked'
      and l.business_id is distinct from v_run.matched_business_id
  ) then
    v_reasons := v_reasons || jsonb_build_array('operation_linked_to_different_business');
  end if;

  if jsonb_array_length(v_reasons) > 0 then
    insert into public.financial_routing_rollout_decisions(
      shadow_run_id, operation_id, business_id, financial_account_id,
      decision_status, rollout_mode, match_score, match_strategy,
      gate_reasons, policy_snapshot, benchmark_snapshot
    ) values (
      v_run.id, v_run.operation_id, v_run.matched_business_id, v_run.matched_account_id,
      'denied', 'operational_inbox', v_run.match_score, v_run.match_strategy,
      v_reasons,
      jsonb_build_object('policy', 'operational_inbox_v1', 'strict_rollout_gates_removed', true),
      '{}'::jsonb
    )
    on conflict (shadow_run_id) do update set
      business_id = excluded.business_id,
      financial_account_id = excluded.financial_account_id,
      decision_status = 'denied',
      rollout_mode = excluded.rollout_mode,
      match_score = excluded.match_score,
      match_strategy = excluded.match_strategy,
      gate_reasons = excluded.gate_reasons,
      policy_snapshot = excluded.policy_snapshot,
      benchmark_snapshot = excluded.benchmark_snapshot,
      evaluation_count = public.financial_routing_rollout_decisions.evaluation_count + 1,
      last_error = null,
      last_evaluated_at = now(),
      updated_at = now();

    return jsonb_build_object('ok', true, 'decision_status', 'denied', 'gate_reasons', v_reasons);
  end if;

  select * into v_link
  from public.business_operation_links
  where business_id = v_run.matched_business_id
    and operation_id = v_run.operation_id;

  if found and v_link.status = 'unlinked' then
    update public.business_operation_links
    set status = 'linked',
        link_type = 'auto_financial_account_match',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'operational_payment_inbox',
          'shadow_run_id', v_run.id,
          'reactivated', true
        ),
        updated_at = now()
    where id = v_link.id
    returning * into v_link;
  elsif not found then
    insert into public.business_operation_links(
      business_id, operation_id, linked_by_user_id, link_type, status,
      metadata, verification_status, verified_by_user_id
    ) values (
      v_run.matched_business_id, v_run.operation_id, null,
      'auto_financial_account_match', 'linked',
      jsonb_build_object(
        'source', 'operational_payment_inbox',
        'shadow_run_id', v_run.id,
        'human_verification_required', true
      ),
      'not_applicable', null
    ) returning * into v_link;
  end if;

  v_snapshot := jsonb_build_object(
    'policy', 'operational_inbox_v1',
    'shadow_run_id', v_run.id,
    'candidate_count', v_run.candidate_count,
    'match_status', v_run.status,
    'match_strategy', v_run.match_strategy,
    'human_verification_required', true,
    'strict_rollout_gates_removed', true
  );

  v_inbox_id := private.enqueue_business_payment_inbox_system(
    v_run.matched_business_id,
    v_run.operation_id,
    v_run.id,
    v_run.matched_account_id,
    'operational_match',
    v_run.match_score,
    v_run.match_strategy,
    v_snapshot
  );

  insert into public.financial_routing_rollout_decisions(
    shadow_run_id, operation_id, business_id, financial_account_id,
    decision_status, rollout_mode, match_score, match_strategy,
    gate_reasons, policy_snapshot, benchmark_snapshot,
    business_operation_link_id, payment_inbox_id, enqueued_at
  ) values (
    v_run.id, v_run.operation_id, v_run.matched_business_id, v_run.matched_account_id,
    'enqueued', 'operational_inbox', v_run.match_score, v_run.match_strategy,
    '[]'::jsonb, v_snapshot, '{}'::jsonb,
    v_link.id, v_inbox_id, now()
  )
  on conflict (shadow_run_id) do update set
    business_id = excluded.business_id,
    financial_account_id = excluded.financial_account_id,
    target_id = null,
    decision_status = 'enqueued',
    rollout_mode = excluded.rollout_mode,
    match_score = excluded.match_score,
    match_strategy = excluded.match_strategy,
    gate_reasons = '[]'::jsonb,
    policy_snapshot = excluded.policy_snapshot,
    benchmark_snapshot = excluded.benchmark_snapshot,
    business_operation_link_id = excluded.business_operation_link_id,
    payment_inbox_id = excluded.payment_inbox_id,
    evaluation_count = public.financial_routing_rollout_decisions.evaluation_count + 1,
    last_error = null,
    last_evaluated_at = now(),
    enqueued_at = coalesce(public.financial_routing_rollout_decisions.enqueued_at, now()),
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'decision_status', 'enqueued',
    'business_operation_link_id', v_link.id,
    'payment_inbox_id', v_inbox_id,
    'rollout_mode', 'operational_inbox'
  );
exception when others then
  insert into public.financial_routing_rollout_decisions(
    shadow_run_id, operation_id, business_id, financial_account_id,
    decision_status, rollout_mode, match_score, match_strategy,
    gate_reasons, policy_snapshot, benchmark_snapshot, last_error
  ) values (
    p_shadow_run_id,
    coalesce(v_run.operation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    v_run.matched_business_id, v_run.matched_account_id,
    'error', 'operational_inbox', v_run.match_score, v_run.match_strategy,
    jsonb_build_array('evaluation_error'),
    jsonb_build_object('policy', 'operational_inbox_v1'),
    '{}'::jsonb,
    left(sqlerrm, 1500)
  )
  on conflict (shadow_run_id) do update set
    decision_status = 'error',
    rollout_mode = 'operational_inbox',
    gate_reasons = jsonb_build_array('evaluation_error'),
    last_error = left(sqlerrm, 1500),
    evaluation_count = public.financial_routing_rollout_decisions.evaluation_count + 1,
    last_evaluated_at = now(),
    updated_at = now();

  return jsonb_build_object('ok', false, 'decision_status', 'error', 'error', sqlerrm);
end;
$function$;

comment on function private.evaluate_financial_routing_rollout(uuid) is
'Operational payment inbox activation: unique high-confidence account matches enter the inbox without benchmark, verification, rollout-target, cap, or emergency-stop gates; human verification remains required.';

begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where global_role = 'platform_admin' and status = 'active' order by created_at limit 1),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'app.routing_benchmark_test_case',
  (
    select c.id::text
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id = c.shadow_run_id
    where c.status = 'pending'
      and r.status in ('probable_match', 'high_confidence_match')
      and r.matched_account_id is not null
    order by c.priority desc, c.created_at desc
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_case_id uuid := current_setting('app.routing_benchmark_test_case')::uuid;
  v_overview jsonb;
  v_claim jsonb;
  v_detail jsonb;
  v_rejected boolean := false;
  v_matched_account_id uuid;
begin
  v_overview := public.platform_admin_get_routing_benchmark_overview(null, null, null, null, 20, 0);
  if coalesce((v_overview->'stats'->>'total_cases')::integer, 0) < 1 then
    raise exception 'benchmark_overview_empty';
  end if;
  if coalesce((v_overview->'gate'->>'activation_allowed')::boolean, true) <> false then
    raise exception 'activation_gate_must_be_blocked';
  end if;
  if coalesce((v_overview->'gate'->>'activation_hard_block')::boolean, false) <> true then
    raise exception 'activation_hard_block_missing';
  end if;

  v_claim := public.platform_admin_claim_routing_benchmark_case(v_case_id);
  if v_claim->>'status' <> 'in_review' then
    raise exception 'benchmark_claim_failed';
  end if;

  v_detail := public.platform_admin_get_routing_benchmark_case(v_case_id);
  if v_detail->'operation'->>'public_token' is null then
    raise exception 'benchmark_detail_missing_operation';
  end if;
  if jsonb_typeof(v_detail->'candidates') <> 'array'
     or jsonb_typeof(v_detail->'account_options') <> 'array' then
    raise exception 'benchmark_detail_arrays_invalid';
  end if;

  v_matched_account_id := nullif(v_detail->'shadow_run'->>'matched_account_id', '')::uuid;

  begin
    perform public.platform_admin_review_routing_benchmark_case(
      v_case_id,
      'correct', 'correct', 'unreviewable', 'unreviewable', 'correct', 'unreviewable',
      'wrong_match',
      null, null, null, null,
      v_matched_account_id,
      jsonb_build_array('wrong_account_match'),
      'يجب رفض التصحيح إلى الحساب نفسه.',
      'اختبار حارس دلالات Benchmark'
    );
  exception when others then
    if sqlerrm = 'wrong_match_cannot_correct_to_same_account' then
      v_rejected := true;
    else
      raise;
    end if;
  end;

  if not v_rejected then
    raise exception 'semantic_guard_did_not_reject_same_account';
  end if;

  perform public.platform_admin_review_routing_benchmark_case(
    v_case_id,
    'correct', 'correct', 'unreviewable', 'unreviewable', 'correct', 'unreviewable',
    'correct_match',
    null, null, null, null, null,
    jsonb_build_array('legacy_contract_limited'),
    'اختبار عقد المراجعة داخل معاملة متراجعة بالكامل.',
    'اختبار تكامل لعقد Benchmark'
  );
end $$;

reset role;

do $$
declare
  v_case_id uuid := current_setting('app.routing_benchmark_test_case')::uuid;
begin
  if (
    select count(*)
    from public.operation_routing_benchmark_reviews
    where case_id = v_case_id
      and superseded_at is null
      and revision = 1
      and routing_verdict = 'correct_match'
  ) <> 1 then
    raise exception 'current_review_not_persisted';
  end if;

  if not exists (
    select 1
    from public.operation_routing_benchmark_cases
    where id = v_case_id
      and status = 'reviewed'
      and claimed_by_user_id is null
  ) then
    raise exception 'benchmark_case_not_closed';
  end if;

  if not exists (
    select 1
    from public.platform_admin_audit_log
    where action = 'routing_benchmark_reviewed'
      and target_id = v_case_id::text
  ) then
    raise exception 'benchmark_audit_missing';
  end if;

  if has_table_privilege('anon', 'public.operation_routing_benchmark_cases', 'SELECT')
     or has_table_privilege('authenticated', 'public.operation_routing_benchmark_cases', 'SELECT')
     or has_table_privilege('anon', 'public.operation_routing_benchmark_reviews', 'SELECT')
     or has_table_privilege('authenticated', 'public.operation_routing_benchmark_reviews', 'SELECT') then
    raise exception 'benchmark_tables_must_not_be_client_readable';
  end if;

  if exists (
    select 1
    from public.business_operation_links bol
    join public.operation_routing_benchmark_cases c on c.operation_id = bol.operation_id
    where c.id = v_case_id
      and (bol.link_type ilike '%benchmark%' or bol.metadata ? 'routing_benchmark')
  ) then
    raise exception 'benchmark_must_not_create_operation_link';
  end if;
end $$;

rollback;

select 'routing_shadow_benchmark_review_passed_rolled_back' as result;

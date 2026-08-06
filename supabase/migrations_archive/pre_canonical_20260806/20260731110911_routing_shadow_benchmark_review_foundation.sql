create table if not exists public.operation_routing_benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  shadow_run_id uuid not null unique references public.operation_routing_shadow_runs(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  cohort text not null check (cohort in ('legacy_baseline','contract_v2_live')),
  status text not null default 'pending' check (status in ('pending','in_review','reviewed','excluded')),
  priority smallint not null default 50 check (priority between 0 and 200),
  claimed_by_user_id uuid references public.profiles(id),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  reviewed_at timestamptz,
  excluded_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'in_review' and claimed_by_user_id is not null and claim_expires_at is not null)
    or status <> 'in_review'
  )
);

create table if not exists public.operation_routing_benchmark_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.operation_routing_benchmark_cases(id) on delete cascade,
  shadow_run_id uuid not null references public.operation_routing_shadow_runs(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id),
  revision integer not null check (revision > 0),
  document_verdict text not null check (document_verdict in ('correct','incorrect','unreviewable')),
  entity_verdict text not null check (entity_verdict in ('correct','incorrect','unreviewable')),
  template_verdict text not null check (template_verdict in ('correct','incorrect','unreviewable')),
  direction_verdict text not null check (direction_verdict in ('correct','incorrect','unreviewable')),
  selected_operation_verdict text not null check (selected_operation_verdict in ('correct','incorrect','unreviewable')),
  identifier_roles_verdict text not null check (identifier_roles_verdict in ('correct','incorrect','unreviewable')),
  routing_verdict text not null check (routing_verdict in (
    'correct_match','wrong_match','correct_abstention','missed_match','ambiguous_case','unreviewable'
  )),
  corrected_financial_entity_code text references public.financial_entities(code),
  corrected_document_template text check (corrected_document_template is null or corrected_document_template in (
    'single_receipt','transaction_list','account_history','wallet_receipt','transfer_receipt','statement','unknown'
  )),
  corrected_transaction_direction text check (corrected_transaction_direction is null or corrected_transaction_direction in (
    'incoming','outgoing','internal','unknown'
  )),
  corrected_selected_operation_position smallint check (
    corrected_selected_operation_position is null or corrected_selected_operation_position between 1 and 100
  ),
  corrected_business_id uuid references public.business_profiles(id),
  corrected_account_id uuid references public.business_financial_accounts(id),
  error_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(error_codes) = 'array'),
  reviewer_notes text,
  analysis_snapshot jsonb not null check (jsonb_typeof(analysis_snapshot) = 'object'),
  routing_snapshot jsonb not null check (jsonb_typeof(routing_snapshot) = 'object'),
  superseded_at timestamptz,
  superseded_by_review_id uuid references public.operation_routing_benchmark_reviews(id),
  created_at timestamptz not null default now(),
  unique (case_id, revision),
  check (
    (corrected_account_id is null and corrected_business_id is null)
    or (corrected_account_id is not null and corrected_business_id is not null)
  )
);

create unique index if not exists operation_routing_benchmark_reviews_current_idx
  on public.operation_routing_benchmark_reviews(case_id)
  where superseded_at is null;

create table if not exists public.routing_benchmark_policy (
  singleton boolean primary key default true check (singleton),
  minimum_contract_v2_reviews integer not null default 100 check (minimum_contract_v2_reviews >= 20),
  minimum_reviews_per_entity_template integer not null default 20 check (minimum_reviews_per_entity_template >= 5),
  minimum_routing_precision numeric not null default 0.995 check (minimum_routing_precision between 0 and 1),
  minimum_routing_recall numeric not null default 0.90 check (minimum_routing_recall between 0 and 1),
  maximum_false_positive_rate numeric not null default 0.005 check (maximum_false_positive_rate between 0 and 1),
  maximum_unreviewable_rate numeric not null default 0.05 check (maximum_unreviewable_rate between 0 and 1),
  activation_hard_block boolean not null default true,
  policy_version text not null default 'benchmark-gate-v1',
  updated_at timestamptz not null default now()
);

insert into public.routing_benchmark_policy(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.operation_routing_benchmark_cases enable row level security;
alter table public.operation_routing_benchmark_reviews enable row level security;
alter table public.routing_benchmark_policy enable row level security;

revoke all on table public.operation_routing_benchmark_cases from public, anon, authenticated;
revoke all on table public.operation_routing_benchmark_reviews from public, anon, authenticated;
revoke all on table public.routing_benchmark_policy from public, anon, authenticated;
grant select, insert, update on table public.operation_routing_benchmark_cases to service_role;
grant select, insert, update on table public.operation_routing_benchmark_reviews to service_role;
grant select on table public.routing_benchmark_policy to service_role;

create index if not exists operation_routing_benchmark_cases_queue_idx
  on public.operation_routing_benchmark_cases(status, priority desc, created_at desc);
create index if not exists operation_routing_benchmark_cases_operation_idx
  on public.operation_routing_benchmark_cases(operation_id, created_at desc);
create index if not exists operation_routing_benchmark_cases_claim_idx
  on public.operation_routing_benchmark_cases(claim_expires_at)
  where status = 'in_review';
create index if not exists operation_routing_benchmark_cases_claimed_by_idx
  on public.operation_routing_benchmark_cases(claimed_by_user_id, claim_expires_at)
  where claimed_by_user_id is not null;
create index if not exists operation_routing_benchmark_reviews_shadow_idx
  on public.operation_routing_benchmark_reviews(shadow_run_id, created_at desc);
create index if not exists operation_routing_benchmark_reviews_operation_idx
  on public.operation_routing_benchmark_reviews(operation_id, created_at desc);
create index if not exists operation_routing_benchmark_reviews_reviewer_idx
  on public.operation_routing_benchmark_reviews(reviewer_user_id, created_at desc);
create index if not exists operation_routing_benchmark_reviews_account_idx
  on public.operation_routing_benchmark_reviews(corrected_account_id, created_at desc)
  where corrected_account_id is not null;
create index if not exists operation_routing_benchmark_reviews_business_idx
  on public.operation_routing_benchmark_reviews(corrected_business_id, created_at desc)
  where corrected_business_id is not null;

create or replace function private.routing_benchmark_priority(
  p_contract_version smallint,
  p_shadow_status text
)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select least(200, greatest(0,
    case p_shadow_status
      when 'error' then 120
      when 'high_confidence_match' then 115
      when 'probable_match' then 110
      when 'ambiguous' then 105
      when 'low_confidence_match' then 100
      when 'no_match' then 80
      when 'insufficient_data' then 60
      when 'skipped' then 30
      else 50
    end
    + case when p_contract_version >= 2 then 30 else 0 end
  ))::smallint;
$$;

create or replace function private.enqueue_routing_benchmark_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.operation_routing_benchmark_cases(
    shadow_run_id,
    operation_id,
    cohort,
    priority
  ) values (
    new.id,
    new.operation_id,
    case when new.analysis_contract_version >= 2 then 'contract_v2_live' else 'legacy_baseline' end,
    private.routing_benchmark_priority(new.analysis_contract_version, new.status)
  ) on conflict (shadow_run_id) do nothing;
  return null;
end;
$$;

drop trigger if exists trg_enqueue_routing_benchmark_case on public.operation_routing_shadow_runs;
create trigger trg_enqueue_routing_benchmark_case
after insert on public.operation_routing_shadow_runs
for each row execute function private.enqueue_routing_benchmark_case();

insert into public.operation_routing_benchmark_cases(
  shadow_run_id,
  operation_id,
  cohort,
  priority,
  created_at,
  updated_at
)
select
  r.id,
  r.operation_id,
  case when r.analysis_contract_version >= 2 then 'contract_v2_live' else 'legacy_baseline' end,
  private.routing_benchmark_priority(r.analysis_contract_version, r.status),
  r.created_at,
  now()
from public.operation_routing_shadow_runs r
on conflict (shadow_run_id) do nothing;

create or replace function public.platform_admin_get_routing_benchmark_overview(
  p_status text default null,
  p_cohort text default null,
  p_entity_code text default null,
  p_template text default null,
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_policy public.routing_benchmark_policy%rowtype;
  v_stats jsonb;
  v_gate jsonb;
  v_breakdown jsonb;
  v_queue jsonb;
  v_contract_reviewed integer;
  v_reviewed_predictions integer;
  v_correct_matches integer;
  v_wrong_matches integer;
  v_missed_matches integer;
  v_unreviewable integer;
  v_precision numeric;
  v_recall numeric;
  v_false_positive numeric;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select * into v_policy from public.routing_benchmark_policy where singleton = true;

  with current_reviews as (
    select * from public.operation_routing_benchmark_reviews where superseded_at is null
  ), counts as (
    select
      count(*)::integer as total_cases,
      count(*) filter (where c.cohort = 'contract_v2_live')::integer as contract_v2_cases,
      count(*) filter (where c.status = 'pending')::integer as pending_cases,
      count(*) filter (where c.status = 'in_review' and c.claim_expires_at > now())::integer as in_review_cases,
      count(*) filter (where c.status = 'reviewed')::integer as reviewed_cases,
      count(*) filter (where c.status = 'excluded')::integer as excluded_cases,
      count(*) filter (where c.cohort = 'contract_v2_live' and cr.id is not null)::integer as contract_reviewed,
      count(*) filter (where cr.routing_verdict = 'correct_match')::integer as correct_matches,
      count(*) filter (where cr.routing_verdict = 'wrong_match')::integer as wrong_matches,
      count(*) filter (where cr.routing_verdict = 'missed_match')::integer as missed_matches,
      count(*) filter (where cr.routing_verdict = 'correct_abstention')::integer as correct_abstentions,
      count(*) filter (where cr.routing_verdict = 'ambiguous_case')::integer as ambiguous_cases,
      count(*) filter (where cr.routing_verdict = 'unreviewable')::integer as unreviewable_cases,
      count(*) filter (where cr.routing_verdict in ('correct_match','wrong_match'))::integer as reviewed_predictions
    from public.operation_routing_benchmark_cases c
    left join current_reviews cr on cr.case_id = c.id
  )
  select
    jsonb_build_object(
      'total_cases', total_cases,
      'contract_v2_cases', contract_v2_cases,
      'pending_cases', pending_cases,
      'in_review_cases', in_review_cases,
      'reviewed_cases', reviewed_cases,
      'excluded_cases', excluded_cases,
      'contract_v2_reviewed', contract_reviewed,
      'correct_matches', correct_matches,
      'wrong_matches', wrong_matches,
      'missed_matches', missed_matches,
      'correct_abstentions', correct_abstentions,
      'ambiguous_cases', ambiguous_cases,
      'unreviewable_cases', unreviewable_cases,
      'reviewed_predictions', reviewed_predictions,
      'routing_precision', case when correct_matches + wrong_matches > 0
        then round(correct_matches::numeric / (correct_matches + wrong_matches), 4) else null end,
      'routing_recall', case when correct_matches + missed_matches > 0
        then round(correct_matches::numeric / (correct_matches + missed_matches), 4) else null end,
      'false_positive_rate', case when correct_matches + wrong_matches > 0
        then round(wrong_matches::numeric / (correct_matches + wrong_matches), 4) else null end,
      'unreviewable_rate', case when reviewed_cases > 0
        then round(unreviewable_cases::numeric / reviewed_cases, 4) else null end
    ),
    contract_reviewed,
    reviewed_predictions,
    correct_matches,
    wrong_matches,
    missed_matches,
    unreviewable_cases,
    case when correct_matches + wrong_matches > 0
      then correct_matches::numeric / (correct_matches + wrong_matches) else null end,
    case when correct_matches + missed_matches > 0
      then correct_matches::numeric / (correct_matches + missed_matches) else null end,
    case when correct_matches + wrong_matches > 0
      then wrong_matches::numeric / (correct_matches + wrong_matches) else null end
  into
    v_stats,
    v_contract_reviewed,
    v_reviewed_predictions,
    v_correct_matches,
    v_wrong_matches,
    v_missed_matches,
    v_unreviewable,
    v_precision,
    v_recall,
    v_false_positive
  from counts;

  v_gate := jsonb_build_object(
    'policy_version', v_policy.policy_version,
    'activation_hard_block', true,
    'activation_allowed', false,
    'minimum_contract_v2_reviews', v_policy.minimum_contract_v2_reviews,
    'minimum_reviews_per_entity_template', v_policy.minimum_reviews_per_entity_template,
    'minimum_routing_precision', v_policy.minimum_routing_precision,
    'minimum_routing_recall', v_policy.minimum_routing_recall,
    'maximum_false_positive_rate', v_policy.maximum_false_positive_rate,
    'maximum_unreviewable_rate', v_policy.maximum_unreviewable_rate,
    'sample_requirement_met', v_contract_reviewed >= v_policy.minimum_contract_v2_reviews,
    'precision_requirement_met', coalesce(v_precision >= v_policy.minimum_routing_precision, false),
    'recall_requirement_met', coalesce(v_recall >= v_policy.minimum_routing_recall, false),
    'false_positive_requirement_met', coalesce(v_false_positive <= v_policy.maximum_false_positive_rate, false),
    'block_reasons', jsonb_strip_nulls(jsonb_build_object(
      'hard_block', 'التوجيه الحقيقي محظور في هذه المرحلة مهما كانت النتائج.',
      'sample', case when v_contract_reviewed < v_policy.minimum_contract_v2_reviews
        then format('العينة المراجعة لعقد v2 هي %s من %s.', v_contract_reviewed, v_policy.minimum_contract_v2_reviews) end,
      'precision', case when v_precision is null or v_precision < v_policy.minimum_routing_precision
        then 'دقة التوجيه لم تبلغ الحد المطلوب.' end,
      'recall', case when v_recall is null or v_recall < v_policy.minimum_routing_recall
        then 'استدعاء المطابقات الصحيحة لم يبلغ الحد المطلوب.' end,
      'false_positive', case when v_false_positive is null or v_false_positive > v_policy.maximum_false_positive_rate
        then 'معدل التوجيه الخاطئ أعلى من الحد المطلوب أو لم يُقَس بعد.' end
    ))
  );

  with current_reviews as (
    select * from public.operation_routing_benchmark_reviews where superseded_at is null
  ), grouped as (
    select
      coalesce(r.financial_entity_code, 'unknown') as financial_entity_code,
      coalesce(o.document_template, 'unknown') as document_template,
      count(*)::integer as total_cases,
      count(*) filter (where cr.id is not null)::integer as reviewed_cases,
      count(*) filter (where cr.routing_verdict = 'correct_match')::integer as correct_matches,
      count(*) filter (where cr.routing_verdict = 'wrong_match')::integer as wrong_matches,
      count(*) filter (where cr.routing_verdict = 'missed_match')::integer as missed_matches,
      count(*) filter (where cr.routing_verdict = 'correct_abstention')::integer as correct_abstentions
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id = c.shadow_run_id
    join public.operations o on o.id = c.operation_id
    left join current_reviews cr on cr.case_id = c.id
    group by coalesce(r.financial_entity_code, 'unknown'), coalesce(o.document_template, 'unknown')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'financial_entity_code', financial_entity_code,
    'document_template', document_template,
    'total_cases', total_cases,
    'reviewed_cases', reviewed_cases,
    'correct_matches', correct_matches,
    'wrong_matches', wrong_matches,
    'missed_matches', missed_matches,
    'correct_abstentions', correct_abstentions,
    'precision', case when correct_matches + wrong_matches > 0
      then round(correct_matches::numeric / (correct_matches + wrong_matches), 4) else null end
  ) order by reviewed_cases desc, total_cases desc), '[]'::jsonb)
  into v_breakdown
  from grouped;

  with current_reviews as (
    select * from public.operation_routing_benchmark_reviews where superseded_at is null
  ), filtered as (
    select
      c.*,
      r.status as shadow_status,
      r.algorithm_version,
      r.analysis_contract_version,
      r.financial_entity_code,
      r.match_score,
      r.match_strategy,
      r.candidate_count,
      o.public_token,
      o.financial_entity,
      o.document_template,
      o.transaction_direction,
      o.transaction_type,
      o.amount,
      o.currency,
      o.receiver_name,
      o.receiver_account,
      o.document_account,
      o.credited_account,
      o.debited_account,
      o.merchant_point,
      o.file_original_name,
      o.file_mime_type,
      o.created_at as operation_created_at,
      bp.name as matched_business_name,
      bfa.account_holder_name as matched_account_holder,
      bfa.account_label as matched_account_label,
      cr.id as review_id,
      cr.routing_verdict,
      cr.created_at as review_created_at,
      reviewer.full_name as reviewer_name
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id = c.shadow_run_id
    join public.operations o on o.id = c.operation_id
    left join public.business_profiles bp on bp.id = r.matched_business_id
    left join public.business_financial_accounts bfa on bfa.id = r.matched_account_id
    left join current_reviews cr on cr.case_id = c.id
    left join public.profiles reviewer on reviewer.id = cr.reviewer_user_id
    where (p_status is null or p_status = '' or c.status = p_status)
      and (p_cohort is null or p_cohort = '' or c.cohort = p_cohort)
      and (p_entity_code is null or p_entity_code = '' or r.financial_entity_code = p_entity_code)
      and (p_template is null or p_template = '' or o.document_template = p_template)
    order by
      case when c.status = 'in_review' and c.claimed_by_user_id = auth.uid() and c.claim_expires_at > now() then 0
           when c.status = 'pending' then 1
           when c.status = 'in_review' then 2
           when c.status = 'reviewed' then 3
           else 4 end,
      c.priority desc,
      c.created_at desc
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(filtered)), '[]'::jsonb)
  into v_queue
  from filtered;

  return jsonb_build_object(
    'generated_at', now(),
    'stats', v_stats,
    'gate', v_gate,
    'breakdown', v_breakdown,
    'queue', v_queue,
    'filters', jsonb_build_object(
      'status', p_status,
      'cohort', p_cohort,
      'entity_code', p_entity_code,
      'template', p_template,
      'limit', v_limit,
      'offset', v_offset
    )
  );
end;
$$;

create or replace function public.platform_admin_claim_routing_benchmark_case(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  select * into v_case from public.operation_routing_benchmark_cases where id = p_case_id for update;
  if not found then raise exception 'benchmark_case_not_found'; end if;
  if v_case.status in ('reviewed','excluded') then raise exception 'benchmark_case_closed'; end if;
  if v_case.status = 'in_review'
     and v_case.claimed_by_user_id is distinct from auth.uid()
     and v_case.claim_expires_at > now() then
    raise exception 'benchmark_case_claimed_by_another_admin';
  end if;
  update public.operation_routing_benchmark_cases
  set status = 'in_review', claimed_by_user_id = auth.uid(), claimed_at = now(),
      claim_expires_at = now() + interval '30 minutes', updated_at = now()
  where id = p_case_id returning * into v_case;
  return jsonb_build_object('ok', true, 'case_id', v_case.id, 'status', v_case.status, 'claim_expires_at', v_case.claim_expires_at);
end;
$$;

create or replace function public.platform_admin_get_routing_benchmark_case(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_case jsonb;
  v_candidates jsonb;
  v_options jsonb;
  v_review jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'case', to_jsonb(c),
    'shadow_run', jsonb_build_object(
      'id', r.id, 'algorithm_version', r.algorithm_version,
      'analysis_contract_version', r.analysis_contract_version,
      'financial_entity_code', r.financial_entity_code, 'status', r.status,
      'matched_business_id', r.matched_business_id, 'matched_account_id', r.matched_account_id,
      'match_score', r.match_score, 'match_strategy', r.match_strategy,
      'candidate_count', r.candidate_count, 'evidence', r.evidence,
      'reason_codes', r.reason_codes, 'created_at', r.created_at
    ),
    'operation', jsonb_build_object(
      'id', o.id, 'public_token', o.public_token,
      'analysis_contract_version', o.analysis_contract_version,
      'analysis_prompt_version', o.analysis_prompt_version,
      'financial_entity', o.financial_entity, 'financial_entity_code', o.financial_entity_code,
      'document_template', o.document_template,
      'document_template_confidence', o.document_template_confidence,
      'transaction_type', o.transaction_type, 'transaction_direction', o.transaction_direction,
      'transaction_direction_confidence', o.transaction_direction_confidence,
      'amount', o.amount, 'currency', o.currency,
      'sender_name', o.sender_name, 'sender_account', o.sender_account,
      'sender_identifier_type', o.sender_identifier_type,
      'receiver_name', o.receiver_name, 'receiver_account', o.receiver_account,
      'receiver_identifier_type', o.receiver_identifier_type,
      'document_account', o.document_account, 'credited_account', o.credited_account,
      'debited_account', o.debited_account, 'merchant_point', o.merchant_point,
      'reference_number', o.reference_number, 'transaction_datetime', o.transaction_datetime,
      'multiple_operations_present', o.multiple_operations_present,
      'selected_operation_position', o.selected_operation_position,
      'field_confidences', o.field_confidences, 'field_evidence', o.field_evidence,
      'summary', o.summary, 'possible_fraud', o.possible_fraud,
      'file_original_name', o.file_original_name, 'file_mime_type', o.file_mime_type,
      'created_at', o.created_at
    ),
    'matched_business', case when bp.id is null then null else jsonb_build_object('id', bp.id, 'name', bp.name, 'slug', bp.slug) end,
    'matched_account', case when bfa.id is null then null else jsonb_build_object(
      'id', bfa.id, 'account_holder_name', bfa.account_holder_name,
      'account_label', bfa.account_label, 'financial_entity_code', bfa.financial_entity_code,
      'verification_status', bfa.verification_status
    ) end
  ) into v_case
  from public.operation_routing_benchmark_cases c
  join public.operation_routing_shadow_runs r on r.id = c.shadow_run_id
  join public.operations o on o.id = c.operation_id
  left join public.business_profiles bp on bp.id = r.matched_business_id
  left join public.business_financial_accounts bfa on bfa.id = r.matched_account_id
  where c.id = p_case_id;

  if v_case is null then raise exception 'benchmark_case_not_found'; end if;

  with target as (
    select r.candidates
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id = c.shadow_run_id
    where c.id = p_case_id
  ), expanded as (
    select item.value as candidate from target, lateral jsonb_array_elements(target.candidates) item
  )
  select coalesce(jsonb_agg(
    candidate || jsonb_build_object(
      'business_name', bp.name, 'account_holder_name', bfa.account_holder_name,
      'account_label', bfa.account_label, 'verification_status', bfa.verification_status
    ) order by coalesce((candidate->>'score')::numeric, 0) desc
  ), '[]'::jsonb)
  into v_candidates
  from expanded
  left join public.business_profiles bp on bp.id = nullif(candidate->>'business_id','')::uuid
  left join public.business_financial_accounts bfa on bfa.id = nullif(candidate->>'account_id','')::uuid;

  with entity as (
    select r.financial_entity_code
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id = c.shadow_run_id
    where c.id = p_case_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id', a.id, 'business_id', a.business_id, 'business_name', bp.name,
    'account_holder_name', a.account_holder_name, 'account_label', a.account_label,
    'financial_entity_code', a.financial_entity_code, 'verification_status', a.verification_status,
    'identifiers', coalesce((
      select jsonb_agg(jsonb_build_object('type', i.identifier_type, 'value', i.identifier_value, 'currency', i.currency)
        order by i.is_primary desc, i.created_at)
      from public.business_financial_identifiers i
      where i.financial_account_id = a.id and i.status = 'active'
    ), '[]'::jsonb)
  ) order by bp.name, a.account_label nulls last, a.account_holder_name nulls last), '[]'::jsonb)
  into v_options
  from entity e
  join public.business_financial_accounts a on a.financial_entity_code = e.financial_entity_code and a.status = 'active'
  join public.business_profiles bp on bp.id = a.business_id;

  select to_jsonb(r) || jsonb_build_object('reviewer_name', p.full_name)
  into v_review
  from public.operation_routing_benchmark_reviews r
  left join public.profiles p on p.id = r.reviewer_user_id
  where r.case_id = p_case_id and r.superseded_at is null;

  return v_case || jsonb_build_object(
    'candidates', coalesce(v_candidates, '[]'::jsonb),
    'account_options', coalesce(v_options, '[]'::jsonb),
    'current_review', v_review
  );
end;
$$;

create or replace function public.platform_admin_review_routing_benchmark_case(
  p_case_id uuid,
  p_document_verdict text,
  p_entity_verdict text,
  p_template_verdict text,
  p_direction_verdict text,
  p_selected_operation_verdict text,
  p_identifier_roles_verdict text,
  p_routing_verdict text,
  p_corrected_financial_entity_code text default null,
  p_corrected_document_template text default null,
  p_corrected_transaction_direction text default null,
  p_corrected_selected_operation_position smallint default null,
  p_corrected_account_id uuid default null,
  p_error_codes jsonb default '[]'::jsonb,
  p_reviewer_notes text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_run public.operation_routing_shadow_runs%rowtype;
  v_operation public.operations%rowtype;
  v_old_review public.operation_routing_benchmark_reviews%rowtype;
  v_new_review public.operation_routing_benchmark_reviews%rowtype;
  v_revision integer;
  v_corrected_business_id uuid;
  v_errors jsonb;
  v_analysis_snapshot jsonb;
  v_routing_snapshot jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_notes text := nullif(trim(coalesce(p_reviewer_notes, '')), '');
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if length(coalesce(v_reason, '')) < 5 then raise exception 'admin_reason_required'; end if;
  if p_document_verdict not in ('correct','incorrect','unreviewable')
     or p_entity_verdict not in ('correct','incorrect','unreviewable')
     or p_template_verdict not in ('correct','incorrect','unreviewable')
     or p_direction_verdict not in ('correct','incorrect','unreviewable')
     or p_selected_operation_verdict not in ('correct','incorrect','unreviewable')
     or p_identifier_roles_verdict not in ('correct','incorrect','unreviewable') then
    raise exception 'invalid_analysis_verdict';
  end if;
  if p_routing_verdict not in ('correct_match','wrong_match','correct_abstention','missed_match','ambiguous_case','unreviewable') then
    raise exception 'invalid_routing_verdict';
  end if;
  if jsonb_typeof(coalesce(p_error_codes, '[]'::jsonb)) <> 'array' then raise exception 'error_codes_must_be_array'; end if;

  select * into v_case from public.operation_routing_benchmark_cases where id = p_case_id for update;
  if not found then raise exception 'benchmark_case_not_found'; end if;
  if v_case.status = 'excluded' then raise exception 'benchmark_case_excluded'; end if;
  if v_case.status = 'in_review' and v_case.claimed_by_user_id is distinct from auth.uid() and v_case.claim_expires_at > now() then
    raise exception 'benchmark_case_claimed_by_another_admin';
  end if;

  select * into v_run from public.operation_routing_shadow_runs where id = v_case.shadow_run_id;
  select * into v_operation from public.operations where id = v_case.operation_id;

  if p_corrected_account_id is not null then
    select business_id into v_corrected_business_id from public.business_financial_accounts where id = p_corrected_account_id;
    if not found then raise exception 'corrected_account_not_found'; end if;
  end if;
  if p_routing_verdict in ('wrong_match','missed_match') and p_corrected_account_id is null then
    raise exception 'corrected_account_required_for_wrong_or_missed_match';
  end if;
  if p_entity_verdict = 'incorrect' and p_corrected_financial_entity_code is null then raise exception 'corrected_entity_required'; end if;
  if p_template_verdict = 'incorrect' and p_corrected_document_template is null then raise exception 'corrected_template_required'; end if;
  if p_direction_verdict = 'incorrect' and p_corrected_transaction_direction is null then raise exception 'corrected_direction_required'; end if;

  select * into v_old_review
  from public.operation_routing_benchmark_reviews
  where case_id = p_case_id and superseded_at is null for update;
  select coalesce(max(revision), 0) + 1 into v_revision
  from public.operation_routing_benchmark_reviews where case_id = p_case_id;

  v_errors := (
    select coalesce(jsonb_agg(to_jsonb(left(trim(value), 80))), '[]'::jsonb)
    from jsonb_array_elements_text(coalesce(p_error_codes, '[]'::jsonb)) value
    where nullif(trim(value), '') is not null
  );

  v_analysis_snapshot := jsonb_build_object(
    'analysis_contract_version', v_operation.analysis_contract_version,
    'analysis_prompt_version', v_operation.analysis_prompt_version,
    'financial_entity', v_operation.financial_entity,
    'financial_entity_code', v_operation.financial_entity_code,
    'document_template', v_operation.document_template,
    'document_template_confidence', v_operation.document_template_confidence,
    'transaction_type', v_operation.transaction_type,
    'transaction_direction', v_operation.transaction_direction,
    'transaction_direction_confidence', v_operation.transaction_direction_confidence,
    'amount', v_operation.amount, 'currency', v_operation.currency,
    'sender_name', v_operation.sender_name, 'sender_account', v_operation.sender_account,
    'receiver_name', v_operation.receiver_name, 'receiver_account', v_operation.receiver_account,
    'document_account', v_operation.document_account, 'credited_account', v_operation.credited_account,
    'debited_account', v_operation.debited_account, 'merchant_point', v_operation.merchant_point,
    'reference_number', v_operation.reference_number,
    'multiple_operations_present', v_operation.multiple_operations_present,
    'selected_operation_position', v_operation.selected_operation_position,
    'field_confidences', v_operation.field_confidences, 'field_evidence', v_operation.field_evidence
  );

  v_routing_snapshot := jsonb_build_object(
    'shadow_run_id', v_run.id, 'algorithm_version', v_run.algorithm_version,
    'status', v_run.status, 'matched_business_id', v_run.matched_business_id,
    'matched_account_id', v_run.matched_account_id, 'match_score', v_run.match_score,
    'match_strategy', v_run.match_strategy, 'candidate_count', v_run.candidate_count,
    'candidates', v_run.candidates, 'evidence', v_run.evidence, 'reason_codes', v_run.reason_codes
  );

  insert into public.operation_routing_benchmark_reviews(
    case_id, shadow_run_id, operation_id, reviewer_user_id, revision,
    document_verdict, entity_verdict, template_verdict, direction_verdict,
    selected_operation_verdict, identifier_roles_verdict, routing_verdict,
    corrected_financial_entity_code, corrected_document_template,
    corrected_transaction_direction, corrected_selected_operation_position,
    corrected_business_id, corrected_account_id, error_codes, reviewer_notes,
    analysis_snapshot, routing_snapshot
  ) values (
    v_case.id, v_case.shadow_run_id, v_case.operation_id, auth.uid(), v_revision,
    p_document_verdict, p_entity_verdict, p_template_verdict, p_direction_verdict,
    p_selected_operation_verdict, p_identifier_roles_verdict, p_routing_verdict,
    p_corrected_financial_entity_code, p_corrected_document_template,
    p_corrected_transaction_direction, p_corrected_selected_operation_position,
    v_corrected_business_id, p_corrected_account_id, v_errors, left(v_notes, 2000),
    v_analysis_snapshot, v_routing_snapshot
  ) returning * into v_new_review;

  if v_old_review.id is not null then
    update public.operation_routing_benchmark_reviews
    set superseded_at = now(), superseded_by_review_id = v_new_review.id
    where id = v_old_review.id;
  end if;

  update public.operation_routing_benchmark_cases
  set status = 'reviewed', reviewed_at = now(), claimed_by_user_id = null,
      claimed_at = null, claim_expires_at = null, updated_at = now()
  where id = v_case.id;

  insert into public.platform_admin_audit_log(
    actor_user_id, action, target_type, target_id, reason, before_data, after_data
  ) values (
    auth.uid(), 'routing_benchmark_reviewed', 'operation_routing_benchmark_case',
    v_case.id::text, v_reason,
    case when v_old_review.id is null then null else jsonb_build_object(
      'review_id', v_old_review.id, 'revision', v_old_review.revision,
      'routing_verdict', v_old_review.routing_verdict
    ) end,
    jsonb_build_object(
      'review_id', v_new_review.id, 'revision', v_new_review.revision,
      'routing_verdict', v_new_review.routing_verdict,
      'shadow_run_id', v_new_review.shadow_run_id,
      'corrected_account_id', v_new_review.corrected_account_id
    )
  );

  return jsonb_build_object(
    'ok', true, 'case_id', v_case.id, 'review_id', v_new_review.id,
    'revision', v_new_review.revision, 'routing_verdict', v_new_review.routing_verdict,
    'activation_allowed', false
  );
end;
$$;

revoke all on function private.routing_benchmark_priority(smallint,text) from public, anon, authenticated;
revoke all on function private.enqueue_routing_benchmark_case() from public, anon, authenticated;
revoke all on function public.platform_admin_get_routing_benchmark_overview(text,text,text,text,integer,integer) from public, anon;
revoke all on function public.platform_admin_claim_routing_benchmark_case(uuid) from public, anon;
revoke all on function public.platform_admin_get_routing_benchmark_case(uuid) from public, anon;
revoke all on function public.platform_admin_review_routing_benchmark_case(uuid,text,text,text,text,text,text,text,text,text,text,smallint,uuid,jsonb,text,text) from public, anon;

grant execute on function public.platform_admin_get_routing_benchmark_overview(text,text,text,text,integer,integer) to authenticated;
grant execute on function public.platform_admin_claim_routing_benchmark_case(uuid) to authenticated;
grant execute on function public.platform_admin_get_routing_benchmark_case(uuid) to authenticated;
grant execute on function public.platform_admin_review_routing_benchmark_case(uuid,text,text,text,text,text,text,text,text,text,text,smallint,uuid,jsonb,text,text) to authenticated;

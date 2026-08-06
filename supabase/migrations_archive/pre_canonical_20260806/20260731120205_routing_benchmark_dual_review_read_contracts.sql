-- Stage-aware, reviewer-safe read contracts for the routing Benchmark.
-- Secondary reviews are blind. Adjudicators see both votes only after disagreement.

create or replace function public.platform_admin_get_routing_benchmark_case(
  p_case_id uuid
)
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
  v_votes jsonb;
  v_primary_reviewer uuid;
  v_secondary_reviewer uuid;
  v_can_submit boolean := false;
  v_blocked_reason text;
  v_stage text;
begin
  if not (
    private.is_routing_benchmark_reviewer(auth.uid(),false)
    or private.is_routing_benchmark_reviewer(auth.uid(),true)
  ) then
    raise exception 'routing_benchmark_reviewer_required' using errcode='42501';
  end if;

  select
    c.review_stage,
    pv.reviewer_user_id,
    sv.reviewer_user_id,
    jsonb_build_object(
      'case',to_jsonb(c),
      'shadow_run',jsonb_build_object(
        'id',r.id,
        'algorithm_version',r.algorithm_version,
        'analysis_contract_version',r.analysis_contract_version,
        'financial_entity_code',r.financial_entity_code,
        'status',r.status,
        'matched_business_id',r.matched_business_id,
        'matched_account_id',r.matched_account_id,
        'match_score',r.match_score,
        'match_strategy',r.match_strategy,
        'candidate_count',r.candidate_count,
        'evidence',r.evidence,
        'reason_codes',r.reason_codes,
        'created_at',r.created_at
      ),
      'operation',jsonb_build_object(
        'id',o.id,
        'public_token',o.public_token,
        'analysis_contract_version',o.analysis_contract_version,
        'analysis_prompt_version',o.analysis_prompt_version,
        'financial_entity',o.financial_entity,
        'financial_entity_code',o.financial_entity_code,
        'document_template',o.document_template,
        'document_template_confidence',o.document_template_confidence,
        'transaction_type',o.transaction_type,
        'transaction_direction',o.transaction_direction,
        'transaction_direction_confidence',o.transaction_direction_confidence,
        'amount',o.amount,
        'currency',o.currency,
        'sender_name',o.sender_name,
        'sender_account',o.sender_account,
        'sender_identifier_type',o.sender_identifier_type,
        'receiver_name',o.receiver_name,
        'receiver_account',o.receiver_account,
        'receiver_identifier_type',o.receiver_identifier_type,
        'document_account',o.document_account,
        'credited_account',o.credited_account,
        'debited_account',o.debited_account,
        'merchant_point',o.merchant_point,
        'reference_number',o.reference_number,
        'transaction_datetime',o.transaction_datetime,
        'multiple_operations_present',o.multiple_operations_present,
        'selected_operation_position',o.selected_operation_position,
        'field_confidences',o.field_confidences,
        'field_evidence',o.field_evidence,
        'summary',o.summary,
        'possible_fraud',o.possible_fraud,
        'file_original_name',o.file_original_name,
        'file_mime_type',o.file_mime_type,
        'created_at',o.created_at
      ),
      'matched_business',case when bp.id is null then null else jsonb_build_object(
        'id',bp.id,'name',bp.name,'slug',bp.slug
      ) end,
      'matched_account',case when bfa.id is null then null else jsonb_build_object(
        'id',bfa.id,
        'account_holder_name',bfa.account_holder_name,
        'account_label',bfa.account_label,
        'financial_entity_code',bfa.financial_entity_code,
        'verification_status',bfa.verification_status
      ) end
    )
  into v_stage,v_primary_reviewer,v_secondary_reviewer,v_case
  from public.operation_routing_benchmark_cases c
  join public.operation_routing_shadow_runs r on r.id=c.shadow_run_id
  join public.operations o on o.id=c.operation_id
  left join public.business_profiles bp on bp.id=r.matched_business_id
  left join public.business_financial_accounts bfa on bfa.id=r.matched_account_id
  left join public.operation_routing_benchmark_votes pv on pv.id=c.primary_vote_id
  left join public.operation_routing_benchmark_votes sv on sv.id=c.secondary_vote_id
  where c.id=p_case_id;

  if v_case is null then raise exception 'benchmark_case_not_found'; end if;

  if v_stage='awaiting_primary' then
    v_can_submit:=private.is_routing_benchmark_reviewer(auth.uid(),false);
    if not v_can_submit then v_blocked_reason:='primary_reviewer_permission_required'; end if;
  elsif v_stage='awaiting_secondary' then
    v_can_submit:=private.is_routing_benchmark_reviewer(auth.uid(),false)
      and auth.uid() is distinct from v_primary_reviewer;
    if auth.uid()=v_primary_reviewer then
      v_blocked_reason:='independent_secondary_reviewer_required';
    elsif not private.is_routing_benchmark_reviewer(auth.uid(),false) then
      v_blocked_reason:='secondary_reviewer_permission_required';
    end if;
  elsif v_stage='awaiting_adjudication' then
    v_can_submit:=private.is_routing_benchmark_reviewer(auth.uid(),true)
      and auth.uid() is distinct from v_primary_reviewer
      and auth.uid() is distinct from v_secondary_reviewer;
    if auth.uid() in (v_primary_reviewer,v_secondary_reviewer) then
      v_blocked_reason:='independent_adjudicator_required';
    elsif not private.is_routing_benchmark_reviewer(auth.uid(),true) then
      v_blocked_reason:='adjudicator_permission_required';
    end if;
  else
    v_blocked_reason:='benchmark_case_finalized';
  end if;

  with target as (
    select r.candidates
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id=c.shadow_run_id
    where c.id=p_case_id
  ), expanded as (
    select item.value candidate
    from target,lateral jsonb_array_elements(target.candidates) item
  )
  select coalesce(jsonb_agg(
    candidate||jsonb_build_object(
      'business_name',bp.name,
      'account_holder_name',bfa.account_holder_name,
      'account_label',bfa.account_label,
      'verification_status',bfa.verification_status
    ) order by coalesce((candidate->>'score')::numeric,0) desc
  ),'[]'::jsonb)
  into v_candidates
  from expanded
  left join public.business_profiles bp
    on bp.id=nullif(candidate->>'business_id','')::uuid
  left join public.business_financial_accounts bfa
    on bfa.id=nullif(candidate->>'account_id','')::uuid;

  with entity as (
    select r.financial_entity_code
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id=c.shadow_run_id
    where c.id=p_case_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',a.id,
    'business_id',a.business_id,
    'business_name',bp.name,
    'account_holder_name',a.account_holder_name,
    'account_label',a.account_label,
    'financial_entity_code',a.financial_entity_code,
    'verification_status',a.verification_status,
    'identifiers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'type',i.identifier_type,
        'value',i.identifier_value,
        'currency',i.currency
      ) order by i.is_primary desc,i.created_at)
      from public.business_financial_identifiers i
      where i.financial_account_id=a.id and i.status='active'
    ),'[]'::jsonb)
  ) order by bp.name,a.account_label nulls last,a.account_holder_name nulls last),'[]'::jsonb)
  into v_options
  from entity e
  join public.business_financial_accounts a
    on a.financial_entity_code=e.financial_entity_code and a.status='active'
  join public.business_profiles bp on bp.id=a.business_id;

  select to_jsonb(r)||jsonb_build_object(
    'reviewer_name',p.full_name,
    'adjudicator_name',ap.full_name
  )
  into v_review
  from public.operation_routing_benchmark_reviews r
  left join public.profiles p on p.id=r.reviewer_user_id
  left join public.profiles ap on ap.id=r.adjudicator_user_id
  where r.case_id=p_case_id and r.superseded_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,
    'vote_order',v.vote_order,
    'reviewer_user_id',v.reviewer_user_id,
    'reviewer_name',p.full_name,
    'document_verdict',v.document_verdict,
    'entity_verdict',v.entity_verdict,
    'template_verdict',v.template_verdict,
    'direction_verdict',v.direction_verdict,
    'selected_operation_verdict',v.selected_operation_verdict,
    'identifier_roles_verdict',v.identifier_roles_verdict,
    'routing_verdict',v.routing_verdict,
    'corrected_financial_entity_code',v.corrected_financial_entity_code,
    'corrected_document_template',v.corrected_document_template,
    'corrected_transaction_direction',v.corrected_transaction_direction,
    'corrected_selected_operation_position',v.corrected_selected_operation_position,
    'corrected_business_id',v.corrected_business_id,
    'corrected_account_id',v.corrected_account_id,
    'error_codes',v.error_codes,
    'reviewer_notes',v.reviewer_notes,
    'created_at',v.created_at
  ) order by v.vote_order),'[]'::jsonb)
  into v_votes
  from public.operation_routing_benchmark_votes v
  left join public.profiles p on p.id=v.reviewer_user_id
  where v.case_id=p_case_id
    and (
      v_stage in ('awaiting_adjudication','finalized')
      or v.reviewer_user_id=auth.uid()
    );

  return v_case||jsonb_build_object(
    'candidates',coalesce(v_candidates,'[]'::jsonb),
    'account_options',coalesce(v_options,'[]'::jsonb),
    'current_review',v_review,
    'visible_votes',coalesce(v_votes,'[]'::jsonb),
    'review_progress',jsonb_build_object(
      'stage',v_stage,
      'primary_submitted',v_primary_reviewer is not null,
      'secondary_submitted',v_secondary_reviewer is not null,
      'can_submit',v_can_submit,
      'blocked_reason',v_blocked_reason,
      'blind_secondary_review',v_stage='awaiting_secondary',
      'disagreement_fields',coalesce(
        (v_case->'case'->'disagreement_fields'),'[]'::jsonb
      )
    ),
    'access',public.get_my_routing_benchmark_access()
  );
end;
$$;

revoke all on function public.platform_admin_get_routing_benchmark_case(uuid) from public;
grant execute on function public.platform_admin_get_routing_benchmark_case(uuid) to authenticated;

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
set search_path=''
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,40),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_policy public.routing_benchmark_policy%rowtype;
  v_stats jsonb;
  v_gate jsonb;
  v_breakdown jsonb;
  v_queue jsonb;
  v_access jsonb;
  v_contract_reviewed integer;
  v_correct_matches integer;
  v_wrong_matches integer;
  v_missed_matches integer;
  v_precision numeric;
  v_recall numeric;
  v_false_positive numeric;
begin
  if not(
    private.is_routing_benchmark_reviewer(auth.uid(),false)
    or private.is_routing_benchmark_reviewer(auth.uid(),true)
  ) then
    raise exception 'routing_benchmark_reviewer_required' using errcode='42501';
  end if;

  select * into v_policy
  from public.routing_benchmark_policy
  where singleton=true;

  v_access:=public.get_my_routing_benchmark_access();

  with current_reviews as (
    select *
    from public.operation_routing_benchmark_reviews
    where superseded_at is null
  ), counts as (
    select
      count(*)::integer total_cases,
      count(*) filter(where c.cohort='contract_v2_live')::integer contract_v2_cases,
      count(*) filter(where c.status='pending')::integer pending_cases,
      count(*) filter(where c.status='in_review' and c.claim_expires_at>now())::integer in_review_cases,
      count(*) filter(where c.status='reviewed')::integer reviewed_cases,
      count(*) filter(where c.status='excluded')::integer excluded_cases,
      count(*) filter(where c.review_stage='awaiting_primary')::integer awaiting_primary,
      count(*) filter(where c.review_stage='awaiting_secondary')::integer awaiting_secondary,
      count(*) filter(where c.review_stage='awaiting_adjudication')::integer awaiting_adjudication,
      count(*) filter(where c.review_stage='finalized')::integer finalized_cases,
      count(*) filter(where c.cohort='contract_v2_live' and cr.id is not null)::integer contract_reviewed,
      count(*) filter(where cr.routing_verdict='correct_match')::integer correct_matches,
      count(*) filter(where cr.routing_verdict='wrong_match')::integer wrong_matches,
      count(*) filter(where cr.routing_verdict='missed_match')::integer missed_matches,
      count(*) filter(where cr.routing_verdict='correct_abstention')::integer correct_abstentions,
      count(*) filter(where cr.routing_verdict='ambiguous_case')::integer ambiguous_cases,
      count(*) filter(where cr.routing_verdict='unreviewable')::integer unreviewable_cases,
      count(*) filter(where cr.resolution_method='consensus')::integer consensus_cases,
      count(*) filter(where cr.resolution_method='adjudicated')::integer adjudicated_cases
    from public.operation_routing_benchmark_cases c
    left join current_reviews cr on cr.case_id=c.id
  )
  select
    jsonb_build_object(
      'total_cases',total_cases,
      'contract_v2_cases',contract_v2_cases,
      'pending_cases',pending_cases,
      'in_review_cases',in_review_cases,
      'reviewed_cases',reviewed_cases,
      'excluded_cases',excluded_cases,
      'awaiting_primary',awaiting_primary,
      'awaiting_secondary',awaiting_secondary,
      'awaiting_adjudication',awaiting_adjudication,
      'finalized_cases',finalized_cases,
      'contract_v2_reviewed',contract_reviewed,
      'correct_matches',correct_matches,
      'wrong_matches',wrong_matches,
      'missed_matches',missed_matches,
      'correct_abstentions',correct_abstentions,
      'ambiguous_cases',ambiguous_cases,
      'unreviewable_cases',unreviewable_cases,
      'consensus_cases',consensus_cases,
      'adjudicated_cases',adjudicated_cases,
      'routing_precision',case when correct_matches+wrong_matches>0
        then round(correct_matches::numeric/(correct_matches+wrong_matches),4) end,
      'routing_recall',case when correct_matches+missed_matches>0
        then round(correct_matches::numeric/(correct_matches+missed_matches),4) end,
      'false_positive_rate',case when correct_matches+wrong_matches>0
        then round(wrong_matches::numeric/(correct_matches+wrong_matches),4) end,
      'unreviewable_rate',case when reviewed_cases>0
        then round(unreviewable_cases::numeric/reviewed_cases,4) end
    ),
    contract_reviewed,
    correct_matches,
    wrong_matches,
    missed_matches,
    case when correct_matches+wrong_matches>0
      then correct_matches::numeric/(correct_matches+wrong_matches) end,
    case when correct_matches+missed_matches>0
      then correct_matches::numeric/(correct_matches+missed_matches) end,
    case when correct_matches+wrong_matches>0
      then wrong_matches::numeric/(correct_matches+wrong_matches) end
  into
    v_stats,v_contract_reviewed,v_correct_matches,v_wrong_matches,
    v_missed_matches,v_precision,v_recall,v_false_positive
  from counts;

  v_gate:=jsonb_build_object(
    'policy_version',v_policy.policy_version,
    'activation_hard_block',true,
    'activation_allowed',false,
    'dual_review_required',true,
    'minimum_contract_v2_reviews',v_policy.minimum_contract_v2_reviews,
    'minimum_reviews_per_entity_template',v_policy.minimum_reviews_per_entity_template,
    'minimum_routing_precision',v_policy.minimum_routing_precision,
    'minimum_routing_recall',v_policy.minimum_routing_recall,
    'maximum_false_positive_rate',v_policy.maximum_false_positive_rate,
    'maximum_unreviewable_rate',v_policy.maximum_unreviewable_rate,
    'sample_requirement_met',v_contract_reviewed>=v_policy.minimum_contract_v2_reviews,
    'precision_requirement_met',coalesce(v_precision>=v_policy.minimum_routing_precision,false),
    'recall_requirement_met',coalesce(v_recall>=v_policy.minimum_routing_recall,false),
    'false_positive_requirement_met',coalesce(v_false_positive<=v_policy.maximum_false_positive_rate,false),
    'reviewer_capacity_met',coalesce((v_access->>'active_reviewer_count')::integer,0)>=2,
    'adjudicator_capacity_met',coalesce((v_access->>'active_adjudicator_count')::integer,0)>=1,
    'block_reasons',jsonb_strip_nulls(jsonb_build_object(
      'hard_block','التوجيه الحقيقي محظور في هذه المرحلة مهما كانت النتائج.',
      'dual_review','لا تُحتسب أي حالة إلا بعد مراجعتين مستقلتين أو حسم مستقل.',
      'reviewers',case when coalesce((v_access->>'active_reviewer_count')::integer,0)<2
        then 'يلزم تعيين مراجعين مستقلين اثنين على الأقل.' end,
      'adjudicator',case when coalesce((v_access->>'active_adjudicator_count')::integer,0)<1
        then 'يلزم تعيين محكّم واحد على الأقل لحالات التعارض.' end,
      'sample',case when v_contract_reviewed<v_policy.minimum_contract_v2_reviews
        then format('العينة النهائية لعقد v2 هي %s من %s.',v_contract_reviewed,v_policy.minimum_contract_v2_reviews) end,
      'precision',case when v_precision is null or v_precision<v_policy.minimum_routing_precision
        then 'دقة التوجيه لم تبلغ الحد المطلوب.' end,
      'recall',case when v_recall is null or v_recall<v_policy.minimum_routing_recall
        then 'استدعاء المطابقات الصحيحة لم يبلغ الحد المطلوب.' end,
      'false_positive',case when v_false_positive is null or v_false_positive>v_policy.maximum_false_positive_rate
        then 'معدل التوجيه الخاطئ أعلى من الحد المطلوب أو لم يُقَس بعد.' end
    ))
  );

  with current_reviews as (
    select *
    from public.operation_routing_benchmark_reviews
    where superseded_at is null
  ), grouped as (
    select
      coalesce(r.financial_entity_code,'unknown') financial_entity_code,
      coalesce(o.document_template,'unknown') document_template,
      count(*)::integer total_cases,
      count(*) filter(where cr.id is not null)::integer reviewed_cases,
      count(*) filter(where cr.routing_verdict='correct_match')::integer correct_matches,
      count(*) filter(where cr.routing_verdict='wrong_match')::integer wrong_matches,
      count(*) filter(where cr.routing_verdict='missed_match')::integer missed_matches,
      count(*) filter(where cr.routing_verdict='correct_abstention')::integer correct_abstentions
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id=c.shadow_run_id
    join public.operations o on o.id=c.operation_id
    left join current_reviews cr on cr.case_id=c.id
    group by
      coalesce(r.financial_entity_code,'unknown'),
      coalesce(o.document_template,'unknown')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'financial_entity_code',financial_entity_code,
    'document_template',document_template,
    'total_cases',total_cases,
    'reviewed_cases',reviewed_cases,
    'correct_matches',correct_matches,
    'wrong_matches',wrong_matches,
    'missed_matches',missed_matches,
    'correct_abstentions',correct_abstentions,
    'precision',case when correct_matches+wrong_matches>0
      then round(correct_matches::numeric/(correct_matches+wrong_matches),4) end
  ) order by reviewed_cases desc,total_cases desc),'[]'::jsonb)
  into v_breakdown
  from grouped;

  with current_reviews as (
    select *
    from public.operation_routing_benchmark_reviews
    where superseded_at is null
  ), filtered as (
    select
      c.*,
      r.status shadow_status,
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
      o.created_at operation_created_at,
      bp.name matched_business_name,
      bfa.account_holder_name matched_account_holder,
      bfa.account_label matched_account_label,
      cr.id review_id,
      cr.routing_verdict,
      cr.resolution_method,
      cr.created_at review_created_at,
      case
        when c.review_stage='awaiting_primary'
          then private.is_routing_benchmark_reviewer(auth.uid(),false)
        when c.review_stage='awaiting_secondary'
          then private.is_routing_benchmark_reviewer(auth.uid(),false)
            and auth.uid() is distinct from pv.reviewer_user_id
        when c.review_stage='awaiting_adjudication'
          then private.is_routing_benchmark_reviewer(auth.uid(),true)
            and auth.uid() is distinct from pv.reviewer_user_id
            and auth.uid() is distinct from sv.reviewer_user_id
        else false
      end can_claim,
      case
        when c.review_stage='awaiting_secondary' and auth.uid()=pv.reviewer_user_id
          then 'independent_secondary_reviewer_required'
        when c.review_stage='awaiting_adjudication'
          and auth.uid() in (pv.reviewer_user_id,sv.reviewer_user_id)
          then 'independent_adjudicator_required'
        else null
      end eligibility_reason
    from public.operation_routing_benchmark_cases c
    join public.operation_routing_shadow_runs r on r.id=c.shadow_run_id
    join public.operations o on o.id=c.operation_id
    left join public.business_profiles bp on bp.id=r.matched_business_id
    left join public.business_financial_accounts bfa on bfa.id=r.matched_account_id
    left join public.operation_routing_benchmark_votes pv on pv.id=c.primary_vote_id
    left join public.operation_routing_benchmark_votes sv on sv.id=c.secondary_vote_id
    left join current_reviews cr on cr.case_id=c.id
    where (p_status is null or p_status='' or c.status=p_status)
      and (p_cohort is null or p_cohort='' or c.cohort=p_cohort)
      and (p_entity_code is null or p_entity_code='' or r.financial_entity_code=p_entity_code)
      and (p_template is null or p_template='' or o.document_template=p_template)
    order by
      case
        when c.status='in_review'
          and c.claimed_by_user_id=auth.uid()
          and c.claim_expires_at>now() then 0
        when c.review_stage='awaiting_adjudication' then 1
        when c.review_stage='awaiting_secondary' then 2
        when c.review_stage='awaiting_primary' then 3
        when c.review_stage='finalized' then 4
        else 5
      end,
      c.priority desc,
      c.created_at desc
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(filtered)),'[]'::jsonb)
  into v_queue
  from filtered;

  return jsonb_build_object(
    'generated_at',now(),
    'stats',v_stats,
    'gate',v_gate,
    'breakdown',v_breakdown,
    'queue',v_queue,
    'access',v_access,
    'filters',jsonb_build_object(
      'status',p_status,
      'cohort',p_cohort,
      'entity_code',p_entity_code,
      'template',p_template,
      'limit',v_limit,
      'offset',v_offset
    )
  );
end;
$$;

revoke all on function public.platform_admin_get_routing_benchmark_overview(
  text,text,text,text,integer,integer
) from public;
grant execute on function public.platform_admin_get_routing_benchmark_overview(
  text,text,text,text,integer,integer
) to authenticated;

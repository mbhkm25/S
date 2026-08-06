-- Final transition-safe write contract for dual review.
-- The second vote releases the claim by setting status=pending before consensus
-- finalization or disagreement escalation.

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
set search_path=''
as $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_run public.operation_routing_shadow_runs%rowtype;
  v_operation public.operations%rowtype;
  v_primary public.operation_routing_benchmark_votes%rowtype;
  v_secondary public.operation_routing_benchmark_votes%rowtype;
  v_vote public.operation_routing_benchmark_votes%rowtype;
  v_final public.operation_routing_benchmark_reviews%rowtype;
  v_corrected_business_id uuid;
  v_errors jsonb;
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_notes text:=nullif(trim(coalesce(p_reviewer_notes,'')),'');
  v_analysis_snapshot jsonb;
  v_routing_snapshot jsonb;
  v_decision jsonb;
  v_hash text;
  v_disagreements jsonb;
begin
  if not(
    private.is_routing_benchmark_reviewer(auth.uid(),false)
    or private.is_routing_benchmark_reviewer(auth.uid(),true)
  ) then
    raise exception 'routing_benchmark_reviewer_required' using errcode='42501';
  end if;

  if length(coalesce(v_reason,''))<5 then
    raise exception 'review_reason_required';
  end if;

  if p_document_verdict not in ('correct','incorrect','unreviewable')
     or p_entity_verdict not in ('correct','incorrect','unreviewable')
     or p_template_verdict not in ('correct','incorrect','unreviewable')
     or p_direction_verdict not in ('correct','incorrect','unreviewable')
     or p_selected_operation_verdict not in ('correct','incorrect','unreviewable')
     or p_identifier_roles_verdict not in ('correct','incorrect','unreviewable') then
    raise exception 'invalid_analysis_verdict';
  end if;

  if p_routing_verdict not in (
    'correct_match','wrong_match','correct_abstention','missed_match',
    'ambiguous_case','unreviewable'
  ) then
    raise exception 'invalid_routing_verdict';
  end if;

  if jsonb_typeof(coalesce(p_error_codes,'[]'::jsonb))<>'array' then
    raise exception 'error_codes_must_be_array';
  end if;

  if p_entity_verdict='incorrect' and p_corrected_financial_entity_code is null then
    raise exception 'corrected_entity_required';
  end if;
  if p_template_verdict='incorrect' and p_corrected_document_template is null then
    raise exception 'corrected_template_required';
  end if;
  if p_direction_verdict='incorrect' and p_corrected_transaction_direction is null then
    raise exception 'corrected_direction_required';
  end if;
  if p_routing_verdict in ('wrong_match','missed_match')
     and p_corrected_account_id is null then
    raise exception 'corrected_account_required_for_wrong_or_missed_match';
  end if;

  select * into v_case
  from public.operation_routing_benchmark_cases
  where id=p_case_id
  for update;
  if not found then raise exception 'benchmark_case_not_found'; end if;

  if v_case.status='excluded' then raise exception 'benchmark_case_excluded'; end if;
  if v_case.review_stage='finalized' or v_case.status='reviewed' then
    raise exception 'benchmark_case_already_finalized';
  end if;
  if v_case.status='in_review'
     and v_case.claimed_by_user_id is distinct from auth.uid()
     and v_case.claim_expires_at>now() then
    raise exception 'benchmark_case_claimed_by_another_reviewer';
  end if;

  select * into v_run
  from public.operation_routing_shadow_runs
  where id=v_case.shadow_run_id;

  select * into v_operation
  from public.operations
  where id=v_case.operation_id;

  if p_corrected_account_id is not null then
    select business_id into v_corrected_business_id
    from public.business_financial_accounts
    where id=p_corrected_account_id;
    if not found then raise exception 'corrected_account_not_found'; end if;
  end if;

  v_errors:=(
    select coalesce(jsonb_agg(to_jsonb(left(trim(value),80))),'[]'::jsonb)
    from jsonb_array_elements_text(coalesce(p_error_codes,'[]'::jsonb)) value
    where nullif(trim(value),'') is not null
  );

  v_analysis_snapshot:=jsonb_build_object(
    'analysis_contract_version',v_operation.analysis_contract_version,
    'analysis_prompt_version',v_operation.analysis_prompt_version,
    'financial_entity',v_operation.financial_entity,
    'financial_entity_code',v_operation.financial_entity_code,
    'document_template',v_operation.document_template,
    'document_template_confidence',v_operation.document_template_confidence,
    'transaction_type',v_operation.transaction_type,
    'transaction_direction',v_operation.transaction_direction,
    'transaction_direction_confidence',v_operation.transaction_direction_confidence,
    'amount',v_operation.amount,
    'currency',v_operation.currency,
    'sender_name',v_operation.sender_name,
    'sender_account',v_operation.sender_account,
    'receiver_name',v_operation.receiver_name,
    'receiver_account',v_operation.receiver_account,
    'document_account',v_operation.document_account,
    'credited_account',v_operation.credited_account,
    'debited_account',v_operation.debited_account,
    'merchant_point',v_operation.merchant_point,
    'reference_number',v_operation.reference_number,
    'multiple_operations_present',v_operation.multiple_operations_present,
    'selected_operation_position',v_operation.selected_operation_position,
    'field_confidences',v_operation.field_confidences,
    'field_evidence',v_operation.field_evidence
  );

  v_routing_snapshot:=jsonb_build_object(
    'shadow_run_id',v_run.id,
    'algorithm_version',v_run.algorithm_version,
    'status',v_run.status,
    'matched_business_id',v_run.matched_business_id,
    'matched_account_id',v_run.matched_account_id,
    'match_score',v_run.match_score,
    'match_strategy',v_run.match_strategy,
    'candidate_count',v_run.candidate_count,
    'candidates',v_run.candidates,
    'evidence',v_run.evidence,
    'reason_codes',v_run.reason_codes
  );

  v_decision:=private.routing_benchmark_decision_payload(
    p_document_verdict,
    p_entity_verdict,
    p_template_verdict,
    p_direction_verdict,
    p_selected_operation_verdict,
    p_identifier_roles_verdict,
    p_routing_verdict,
    p_corrected_financial_entity_code,
    p_corrected_document_template,
    p_corrected_transaction_direction,
    p_corrected_selected_operation_position,
    p_corrected_account_id
  );
  v_hash:=md5(v_decision::text);

  if v_case.review_stage='awaiting_primary' then
    if not private.is_routing_benchmark_reviewer(auth.uid(),false) then
      raise exception 'primary_reviewer_permission_required' using errcode='42501';
    end if;

    insert into public.operation_routing_benchmark_votes(
      case_id,shadow_run_id,operation_id,reviewer_user_id,vote_order,
      document_verdict,entity_verdict,template_verdict,direction_verdict,
      selected_operation_verdict,identifier_roles_verdict,routing_verdict,
      corrected_financial_entity_code,corrected_document_template,
      corrected_transaction_direction,corrected_selected_operation_position,
      corrected_business_id,corrected_account_id,error_codes,reviewer_notes,
      analysis_snapshot,routing_snapshot,decision_payload,decision_hash
    ) values (
      v_case.id,v_case.shadow_run_id,v_case.operation_id,auth.uid(),1,
      p_document_verdict,p_entity_verdict,p_template_verdict,p_direction_verdict,
      p_selected_operation_verdict,p_identifier_roles_verdict,p_routing_verdict,
      p_corrected_financial_entity_code,p_corrected_document_template,
      p_corrected_transaction_direction,p_corrected_selected_operation_position,
      v_corrected_business_id,p_corrected_account_id,v_errors,left(v_notes,2000),
      v_analysis_snapshot,v_routing_snapshot,v_decision,v_hash
    ) returning * into v_vote;

    update public.operation_routing_benchmark_cases
    set primary_vote_id=v_vote.id,
        review_stage='awaiting_secondary',
        status='pending',
        claimed_by_user_id=null,
        claimed_at=null,
        claim_expires_at=null,
        updated_at=now()
    where id=v_case.id;

    insert into public.platform_admin_audit_log(
      actor_user_id,action,target_type,target_id,reason,after_data
    ) values (
      auth.uid(),'routing_benchmark_primary_vote_submitted',
      'operation_routing_benchmark_case',v_case.id::text,v_reason,
      jsonb_build_object('vote_id',v_vote.id,'decision_hash',v_vote.decision_hash)
    );

    return jsonb_build_object(
      'ok',true,
      'case_id',v_case.id,
      'vote_id',v_vote.id,
      'review_stage','awaiting_secondary',
      'finalized',false,
      'activation_allowed',false
    );
  end if;

  if v_case.review_stage='awaiting_secondary' then
    if not private.is_routing_benchmark_reviewer(auth.uid(),false) then
      raise exception 'secondary_reviewer_permission_required' using errcode='42501';
    end if;

    select * into v_primary
    from public.operation_routing_benchmark_votes
    where id=v_case.primary_vote_id
    for update;
    if not found then raise exception 'primary_vote_not_found'; end if;

    if auth.uid()=v_primary.reviewer_user_id then
      raise exception 'independent_secondary_reviewer_required' using errcode='42501';
    end if;

    insert into public.operation_routing_benchmark_votes(
      case_id,shadow_run_id,operation_id,reviewer_user_id,vote_order,
      document_verdict,entity_verdict,template_verdict,direction_verdict,
      selected_operation_verdict,identifier_roles_verdict,routing_verdict,
      corrected_financial_entity_code,corrected_document_template,
      corrected_transaction_direction,corrected_selected_operation_position,
      corrected_business_id,corrected_account_id,error_codes,reviewer_notes,
      analysis_snapshot,routing_snapshot,decision_payload,decision_hash
    ) values (
      v_case.id,v_case.shadow_run_id,v_case.operation_id,auth.uid(),2,
      p_document_verdict,p_entity_verdict,p_template_verdict,p_direction_verdict,
      p_selected_operation_verdict,p_identifier_roles_verdict,p_routing_verdict,
      p_corrected_financial_entity_code,p_corrected_document_template,
      p_corrected_transaction_direction,p_corrected_selected_operation_position,
      v_corrected_business_id,p_corrected_account_id,v_errors,left(v_notes,2000),
      v_analysis_snapshot,v_routing_snapshot,v_decision,v_hash
    ) returning * into v_secondary;

    -- Critical transition ordering: release the in-review claim under a pending status
    -- before the consensus finalizer or disagreement escalation runs.
    update public.operation_routing_benchmark_cases
    set secondary_vote_id=v_secondary.id,
        status='pending',
        claimed_by_user_id=null,
        claimed_at=null,
        claim_expires_at=null,
        updated_at=now()
    where id=v_case.id;

    if v_primary.decision_hash=v_secondary.decision_hash then
      v_final:=private.finalize_routing_benchmark_case(
        v_case.id,
        v_secondary.decision_payload,
        'consensus',
        jsonb_build_array(v_primary.id,v_secondary.id),
        null,
        auth.uid(),
        v_reason,
        'اتفاق مستقل بين مراجعين'
      );

      return jsonb_build_object(
        'ok',true,
        'case_id',v_case.id,
        'vote_id',v_secondary.id,
        'review_id',v_final.id,
        'review_stage','finalized',
        'resolution_method','consensus',
        'finalized',true,
        'activation_allowed',false
      );
    end if;

    v_disagreements:=private.routing_benchmark_disagreement_fields(
      v_primary.decision_payload,
      v_secondary.decision_payload
    );

    update public.operation_routing_benchmark_cases
    set review_stage='awaiting_adjudication',
        status='pending',
        disagreement_fields=v_disagreements,
        claimed_by_user_id=null,
        claimed_at=null,
        claim_expires_at=null,
        updated_at=now()
    where id=v_case.id;

    insert into public.platform_admin_audit_log(
      actor_user_id,action,target_type,target_id,reason,after_data
    ) values (
      auth.uid(),'routing_benchmark_secondary_vote_disagreed',
      'operation_routing_benchmark_case',v_case.id::text,v_reason,
      jsonb_build_object(
        'primary_vote_id',v_primary.id,
        'secondary_vote_id',v_secondary.id,
        'disagreement_fields',v_disagreements
      )
    );

    return jsonb_build_object(
      'ok',true,
      'case_id',v_case.id,
      'vote_id',v_secondary.id,
      'review_stage','awaiting_adjudication',
      'disagreement_fields',v_disagreements,
      'finalized',false,
      'activation_allowed',false
    );
  end if;

  if v_case.review_stage='awaiting_adjudication' then
    if not private.is_routing_benchmark_reviewer(auth.uid(),true) then
      raise exception 'adjudicator_permission_required' using errcode='42501';
    end if;

    select * into v_primary
    from public.operation_routing_benchmark_votes
    where id=v_case.primary_vote_id;

    select * into v_secondary
    from public.operation_routing_benchmark_votes
    where id=v_case.secondary_vote_id;

    if v_primary.id is null or v_secondary.id is null then
      raise exception 'benchmark_votes_incomplete';
    end if;

    if auth.uid() in (v_primary.reviewer_user_id,v_secondary.reviewer_user_id) then
      raise exception 'independent_adjudicator_required' using errcode='42501';
    end if;

    v_final:=private.finalize_routing_benchmark_case(
      v_case.id,
      v_decision,
      'adjudicated',
      jsonb_build_array(v_primary.id,v_secondary.id),
      auth.uid(),
      auth.uid(),
      v_reason,
      v_notes
    );

    return jsonb_build_object(
      'ok',true,
      'case_id',v_case.id,
      'review_id',v_final.id,
      'review_stage','finalized',
      'resolution_method','adjudicated',
      'finalized',true,
      'activation_allowed',false
    );
  end if;

  raise exception 'invalid_benchmark_review_stage';
end;
$$;

revoke all on function public.platform_admin_review_routing_benchmark_case(
  uuid,text,text,text,text,text,text,text,text,text,text,smallint,uuid,jsonb,text,text
) from public;
grant execute on function public.platform_admin_review_routing_benchmark_case(
  uuid,text,text,text,text,text,text,text,text,text,text,smallint,uuid,jsonb,text,text
) to authenticated;

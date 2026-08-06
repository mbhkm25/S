do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.evaluate_operation_financial_routing_shadow(uuid)'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    '  update public.operations
  set financial_entity_code = coalesce(financial_entity_code, v_entity_code),
      routing_shadow_status = v_status,
      routing_shadow_score = v_top_score,
      routing_shadow_business_id = v_top_business_id,
      routing_shadow_account_id = v_top_account_id,
      routing_shadow_strategy = v_top_strategy,
      routing_shadow_evaluated_at = now(),
      updated_at = now()
  where id = v_operation.id;',
    '  update public.operations
  set financial_entity_code = coalesce(financial_entity_code, v_entity_code),
      updated_at = now()
  where id = v_operation.id;'
  );

  execute v_definition;
end $$;

create or replace function private.apply_operation_analysis_contract_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_extracted jsonb;
  v_prompt_version integer;
  v_entity text;
  v_template text;
  v_direction text;
  v_sender_type text;
  v_receiver_type text;
  v_overall_confidence numeric;
  v_template_confidence numeric;
  v_direction_confidence numeric;
  v_multiple_operations boolean;
  v_selected_position integer;
  v_confidences jsonb;
  v_evidence jsonb;
begin
  v_extracted := case
    when jsonb_typeof(new.raw_ai_json->'extracted') = 'object'
      then new.raw_ai_json->'extracted'
    when jsonb_typeof(new.structured_data) = 'object'
      then new.structured_data
    else '{}'::jsonb
  end;

  v_prompt_version := case
    when coalesce(new.raw_ai_json->>'prompt_version', '') ~ '^[0-9]+$'
      then (new.raw_ai_json->>'prompt_version')::integer
    else null
  end;

  if coalesce(v_prompt_version, 0) < 5
     and not (v_extracted ? 'document_template')
     and not (v_extracted ? 'field_confidences') then
    return new;
  end if;

  v_entity := case
    when nullif(trim(v_extracted->>'financial_entity'), '') in (
      'العمقي موبايل','البسيري موبايل','محفظة بي كاش','الكريمي سعودي',
      'الكريمي يمني','الكريمي حاسب','بن دول صرافة','بن دول باي','أم فلوس',
      'عدن كاش','القطيبي','المحضار','جهة أخرى','unknown'
    ) then nullif(trim(v_extracted->>'financial_entity'), '')
    else coalesce(new.financial_entity, 'unknown')
  end;

  v_template := case lower(coalesce(v_extracted->>'document_template', 'unknown'))
    when 'single_receipt' then 'single_receipt'
    when 'transaction_list' then 'transaction_list'
    when 'account_history' then 'account_history'
    when 'wallet_receipt' then 'wallet_receipt'
    when 'transfer_receipt' then 'transfer_receipt'
    when 'statement' then 'statement'
    else 'unknown'
  end;

  v_direction := case lower(coalesce(v_extracted->>'transaction_direction', 'unknown'))
    when 'incoming' then 'incoming'
    when 'outgoing' then 'outgoing'
    when 'internal' then 'internal'
    else 'unknown'
  end;

  v_sender_type := case lower(coalesce(v_extracted->>'sender_identifier_type', 'unknown'))
    when 'account_number' then 'account_number'
    when 'wallet_number' then 'wallet_number'
    when 'financial_line' then 'financial_line'
    when 'merchant_point' then 'merchant_point'
    when 'terminal_number' then 'terminal_number'
    when 'phone_number' then 'phone_number'
    when 'iban' then 'iban'
    when 'other' then 'other'
    else 'unknown'
  end;

  v_receiver_type := case lower(coalesce(v_extracted->>'receiver_identifier_type', 'unknown'))
    when 'account_number' then 'account_number'
    when 'wallet_number' then 'wallet_number'
    when 'financial_line' then 'financial_line'
    when 'merchant_point' then 'merchant_point'
    when 'terminal_number' then 'terminal_number'
    when 'phone_number' then 'phone_number'
    when 'iban' then 'iban'
    when 'other' then 'other'
    else 'unknown'
  end;

  v_overall_confidence := private.safe_operation_analysis_confidence(
    v_extracted->>'confidence_score',
    coalesce(new.ai_confidence_score, new.confidence_score, 0)
  );
  v_template_confidence := private.safe_operation_analysis_confidence(
    v_extracted->>'document_template_confidence',
    v_overall_confidence
  );
  v_direction_confidence := private.safe_operation_analysis_confidence(
    v_extracted->>'transaction_direction_confidence',
    v_overall_confidence
  );

  v_multiple_operations := lower(coalesce(v_extracted->>'multiple_operations_present', 'false')) in ('true','1','yes');
  v_selected_position := case
    when coalesce(v_extracted->>'selected_operation_position', '') ~ '^[0-9]+$'
      then greatest(1, least(100, (v_extracted->>'selected_operation_position')::integer))
    when v_multiple_operations then 1
    else null
  end;

  v_confidences := private.sanitize_operation_field_confidences(
    coalesce(v_extracted->'field_confidences', v_extracted->'field_confidence', '{}'::jsonb)
  );
  v_evidence := private.sanitize_operation_field_evidence(
    coalesce(v_extracted->'field_evidence', '{}'::jsonb)
  );

  new.analysis_contract_version := 2;
  new.analysis_prompt_version := v_prompt_version;
  new.analysis_completed_at := coalesce(new.analysis_completed_at, now());
  new.financial_entity := v_entity;
  new.financial_entity_code := public.resolve_financial_entity_code(v_entity);
  new.document_template := v_template;
  new.document_template_confidence := v_template_confidence;
  new.transaction_direction := v_direction;
  new.transaction_direction_confidence := v_direction_confidence;
  new.sender_name := nullif(trim(v_extracted->>'sender_name'), '');
  new.receiver_name := nullif(trim(v_extracted->>'receiver_name'), '');
  new.sender_account := private.clean_operation_analysis_identifier(v_extracted->>'sender_account');
  new.receiver_account := private.clean_operation_analysis_identifier(v_extracted->>'receiver_account');
  new.sender_identifier_type := v_sender_type;
  new.receiver_identifier_type := v_receiver_type;
  new.document_account := private.clean_operation_analysis_identifier(v_extracted->>'document_account');
  new.credited_account := private.clean_operation_analysis_identifier(v_extracted->>'credited_account');
  new.debited_account := private.clean_operation_analysis_identifier(v_extracted->>'debited_account');
  new.merchant_point := private.clean_operation_analysis_identifier(v_extracted->>'merchant_point');
  new.multiple_operations_present := v_multiple_operations;
  new.selected_operation_position := v_selected_position;
  new.field_confidences := v_confidences;
  new.field_evidence := v_evidence;

  new.structured_data := coalesce(new.structured_data, '{}'::jsonb) || jsonb_build_object(
    'analysis_contract_version', 2,
    'financial_entity_code', new.financial_entity_code,
    'document_template', new.document_template,
    'document_template_confidence', new.document_template_confidence,
    'transaction_direction', new.transaction_direction,
    'transaction_direction_confidence', new.transaction_direction_confidence,
    'sender_name', new.sender_name,
    'sender_account', new.sender_account,
    'sender_identifier_type', new.sender_identifier_type,
    'receiver_name', new.receiver_name,
    'receiver_account', new.receiver_account,
    'receiver_identifier_type', new.receiver_identifier_type,
    'document_account', new.document_account,
    'credited_account', new.credited_account,
    'debited_account', new.debited_account,
    'merchant_point', new.merchant_point,
    'multiple_operations_present', new.multiple_operations_present,
    'selected_operation_position', new.selected_operation_position,
    'field_confidences', new.field_confidences,
    'field_evidence', new.field_evidence,
    'transaction_time_present', coalesce(
      case when lower(coalesce(v_extracted->>'transaction_time_present', '')) in ('true','1','yes') then true
           when lower(coalesce(v_extracted->>'transaction_time_present', '')) in ('false','0','no') then false end,
      new.transaction_time_present
    ),
    'transaction_date_source', coalesce(nullif(trim(v_extracted->>'transaction_date_source'), ''), new.transaction_date_source)
  );

  return new;
end;
$$;

create or replace function private.run_operation_routing_shadow_after_analysis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_code text;
begin
  if new.ai_status = 'completed' and new.analysis_contract_version >= 2 then
    begin
      perform public.evaluate_operation_financial_routing_shadow(new.id);
    exception when others then
      v_entity_code := coalesce(
        new.financial_entity_code,
        public.resolve_financial_entity_code(new.financial_entity)
      );

      insert into public.operation_routing_shadow_runs (
        operation_id,
        algorithm_version,
        analysis_contract_version,
        financial_entity_code,
        status,
        candidate_count,
        candidates,
        evidence,
        reason_codes
      ) values (
        new.id,
        'routing-shadow-v2.0',
        new.analysis_contract_version,
        v_entity_code,
        'error',
        0,
        '[]'::jsonb,
        jsonb_build_object('sqlstate', sqlstate),
        jsonb_build_array('shadow_evaluation_exception','shadow_only')
      );
    end;
  end if;
  return null;
end;
$$;

revoke all on function public.evaluate_operation_financial_routing_shadow(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_operation_financial_routing_shadow(uuid) to service_role;
revoke all on function private.apply_operation_analysis_contract_v2() from public, anon, authenticated;
revoke all on function private.run_operation_routing_shadow_after_analysis() from public, anon, authenticated;

update public.operations
set routing_shadow_business_id = null,
    routing_shadow_account_id = null,
    routing_shadow_score = null,
    routing_shadow_strategy = null,
    routing_shadow_status = 'not_evaluated',
    routing_shadow_evaluated_at = null
where routing_shadow_business_id is not null
   or routing_shadow_account_id is not null
   or routing_shadow_score is not null
   or routing_shadow_strategy is not null
   or routing_shadow_status <> 'not_evaluated'
   or routing_shadow_evaluated_at is not null;

drop index if exists public.operations_routing_shadow_status_idx;

alter table public.operations
  drop column if exists routing_shadow_business_id,
  drop column if exists routing_shadow_account_id,
  drop column if exists routing_shadow_score,
  drop column if exists routing_shadow_strategy,
  drop column if exists routing_shadow_status,
  drop column if exists routing_shadow_evaluated_at;

create index if not exists operation_routing_shadow_runs_entity_idx
  on public.operation_routing_shadow_runs (financial_entity_code, created_at desc);

create index if not exists operation_routing_shadow_runs_business_idx
  on public.operation_routing_shadow_runs (matched_business_id, created_at desc)
  where matched_business_id is not null;

create index if not exists operation_routing_shadow_runs_account_idx
  on public.operation_routing_shadow_runs (matched_account_id, created_at desc)
  where matched_account_id is not null;

begin;

do $$
declare
  v_operation_id uuid;
  v_identifier text;
  v_account_id uuid;
  v_entity_name text;
  v_run_status text;
  v_run_account_id uuid;
begin
  select o.id into v_operation_id
  from public.operations o
  where o.ai_status = 'completed'
  order by o.created_at desc
  limit 1;

  select i.identifier_value, a.id, e.display_name_ar
  into v_identifier, v_account_id, v_entity_name
  from public.business_financial_identifiers i
  join public.business_financial_accounts a
    on a.id = i.financial_account_id
  join public.financial_entities e
    on e.code = a.financial_entity_code
  where i.status = 'active'
    and i.routing_enabled = true
    and a.status = 'active'
    and a.routing_enabled = true
  order by i.is_primary desc, i.created_at
  limit 1;

  if v_operation_id is null or v_identifier is null then
    raise exception 'test_fixture_not_available';
  end if;

  update public.operations
  set ai_status = 'completed',
      raw_ai_json = jsonb_build_object(
        'prompt_version', 5,
        'extracted', jsonb_build_object(
          'is_financial_document', true,
          'financial_entity', v_entity_name,
          'document_template', 'transaction_list',
          'document_template_confidence', 0.97,
          'transaction_direction', 'incoming',
          'transaction_direction_confidence', 0.95,
          'sender_name', 'عميل اختبار',
          'sender_account', '777000111',
          'sender_identifier_type', 'phone_number',
          'receiver_name', 'نشاط اختبار',
          'receiver_account', v_identifier,
          'receiver_identifier_type', 'account_number',
          'document_account', v_identifier,
          'credited_account', v_identifier,
          'merchant_point', null,
          'multiple_operations_present', true,
          'selected_operation_position', 1,
          'confidence_score', 0.96,
          'field_confidences', jsonb_build_object(
            'financial_entity', 0.99,
            'receiver_account', 0.98,
            'document_account', 0.97,
            'credited_account', 0.98,
            'transaction_direction', 0.95
          ),
          'field_evidence', jsonb_build_object(
            'financial_entity', 'اسم الجهة في الترويسة',
            'receiver_account', 'الحساب بجانب المستلم',
            'document_account', 'بطاقة الحساب أعلى الشاشة',
            'credited_account', 'الحساب الدائن في تفاصيل العملية'
          )
        )
      )
  where id = v_operation_id;

  if not exists (
    select 1
    from public.operations
    where id = v_operation_id
      and analysis_contract_version = 2
      and analysis_prompt_version = 5
      and document_template = 'transaction_list'
      and transaction_direction = 'incoming'
      and receiver_account_normalized = public.normalize_financial_identifier(v_identifier)
      and credited_account_normalized = public.normalize_financial_identifier(v_identifier)
      and multiple_operations_present = true
      and selected_operation_position = 1
      and jsonb_typeof(field_confidences) = 'object'
      and jsonb_typeof(field_evidence) = 'object'
  ) then
    raise exception 'analysis_contract_v2_projection_failed';
  end if;

  select r.status, r.matched_account_id
  into v_run_status, v_run_account_id
  from public.operation_routing_shadow_runs r
  where r.operation_id = v_operation_id
    and r.algorithm_version = 'routing-shadow-v2.0'
  order by r.created_at desc, r.id desc
  limit 1;

  if v_run_status not in ('probable_match', 'high_confidence_match') then
    raise exception 'routing_shadow_expected_match_but_got_%', v_run_status;
  end if;

  if v_run_account_id is distinct from v_account_id then
    raise exception 'routing_shadow_matched_wrong_account';
  end if;

  if exists (
    select 1
    from public.business_operation_links
    where operation_id = v_operation_id
      and (link_type ilike '%shadow%' or metadata ? 'routing_shadow')
  ) then
    raise exception 'shadow_must_not_create_business_link';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operations'
      and column_name like 'routing_shadow_%'
  ) then
    raise exception 'shadow_results_must_not_be_exposed_on_operations';
  end if;
end $$;

rollback;

select 'operation_analysis_contract_v2_shadow_passed_rolled_back' as result;

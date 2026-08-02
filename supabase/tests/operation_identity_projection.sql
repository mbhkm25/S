begin;

-- Regression target: raw OCR may read "حاكم للعسل", while an exact unique
-- merchant-point match resolves the trusted account and business to "باحكم للعسل".
-- This test intentionally preserves the raw value and verifies display precedence.

do $test$
declare
  v_user_id uuid;
  v_business_id uuid;
  v_account_id uuid;
  v_operation_id uuid;
  v_projection jsonb;
  v_item jsonb;
begin
  select id into v_user_id from auth.users order by created_at limit 1;
  if v_user_id is null then
    raise notice 'operation_identity_projection test skipped: no auth user fixture';
    return;
  end if;

  v_business_id:=gen_random_uuid();
  v_account_id:=gen_random_uuid();
  v_operation_id:=gen_random_uuid();

  insert into public.business_profiles(id,owner_user_id,name,slug,status)
  values(v_business_id,v_user_id,'باحكم للعسل','identity-test-'||replace(v_business_id::text,'-',''),'active');

  insert into public.business_financial_accounts(
    id,business_id,financial_entity_code,account_holder_name,
    account_holder_name_normalized,routing_enabled,verification_status,status,
    created_by_user_id
  ) values(
    v_account_id,v_business_id,'kuraimi_haseb','باحكم للعسل',
    public.normalize_financial_name('باحكم للعسل'),true,'verified','active',v_user_id
  );

  insert into public.business_financial_identifiers(
    financial_account_id,identifier_type,identifier_value,
    identifier_value_normalized,status
  ) values(v_account_id,'merchant_point','825121','825121','active');

  insert into public.operations(
    id,public_token,uploader_user_id,status,ai_status,summary,
    financial_entity,financial_entity_code,amount,currency,
    receiver_name,receiver_name_normalized,merchant_point,
    reference_number,field_confidences,field_evidence
  ) values(
    v_operation_id,gen_random_uuid(),v_user_id,'completed','completed',
    'إشعار دفع بقيمة 851 ريال يمني لمشتريات من حاكم للعسل.',
    'الكريمي حاسب','kuraimi_haseb',851,'YER',
    'حاكم للعسل',public.normalize_financial_name('حاكم للعسل'),'825121',
    'IDENTITY-TEST-851',jsonb_build_object('receiver_name',0.9),
    jsonb_build_object('receiver_name','حاكم للعسل','merchant_point','نقطة حاسب رقم 825121')
  );

  insert into public.operation_user_links(operation_id,user_id,relation_type)
  values(v_operation_id,v_user_id,'uploader');

  insert into public.operation_routing_shadow_runs(
    operation_id,algorithm_version,analysis_contract_version,
    financial_entity_code,status,matched_business_id,matched_account_id,
    match_score,match_strategy,candidate_count,candidates,evidence,reason_codes
  ) values(
    v_operation_id,'identity-test-v1',2,'kuraimi_haseb','high_confidence_match',
    v_business_id,v_account_id,100,'merchant_point',1,'[]'::jsonb,
    jsonb_build_object('merchant_point','825121'),
    jsonb_build_array('unique_exact_identifier_match','shadow_only')
  );

  perform set_config('request.jwt.claim.sub',v_user_id::text,true);
  v_projection:=public.get_operation_identity_projection(array[v_operation_id]);
  v_item:=(v_projection->'items')->0;

  if v_item->>'raw_receiver_name'<>'حاكم للعسل' then
    raise exception 'raw_receiver_name_was_silently_changed';
  end if;
  if v_item->>'resolved_business_name'<>'باحكم للعسل' then
    raise exception 'resolved_business_identity_not_preferred';
  end if;
  if v_item->>'identity_source'<>'exact_identifier_match' then
    raise exception 'exact_identifier_match_not_selected';
  end if;
  if coalesce((v_item->>'has_name_conflict')::boolean,false) is not true then
    raise exception 'name_conflict_not_recorded';
  end if;

  insert into public.business_operation_links(
    business_id,operation_id,status,link_type,linked_by_user_id
  ) values(v_business_id,v_operation_id,'linked','manual',v_user_id);

  v_projection:=public.get_operation_identity_projection(array[v_operation_id]);
  v_item:=(v_projection->'items')->0;
  if v_item->>'identity_source'<>'linked_business' then
    raise exception 'linked_business_did_not_override_shadow_match';
  end if;
end;
$test$;

rollback;

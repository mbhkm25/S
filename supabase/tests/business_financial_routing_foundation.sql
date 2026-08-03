-- SANAD business financial routing foundation tests.
-- Safe to run against a review database: all write assertions are rolled back.

begin;

do $$
declare
  v_business_id uuid;
  v_owner_id uuid;
  v_account_id uuid;
  v_legacy_id text;
  v_entity_name text;
  v_identifier text;
  v_result jsonb;
  v_new_account_id uuid;
  v_before integer;
  v_after integer;
begin
  if to_regclass('public.financial_entities') is null
     or to_regclass('public.business_financial_accounts') is null
     or to_regclass('public.business_financial_identifiers') is null
     or to_regclass('public.business_financial_account_events') is null then
    raise exception 'financial_routing_schema_missing';
  end if;

  if public.normalize_financial_identifier(' ٢٥٤-٠٧٣-٨٦٧ ') <> '254073867' then
    raise exception 'financial_identifier_normalization_failed';
  end if;

  if public.normalize_financial_name('مُحَمَّد عُمَر') <> 'محمد عمر' then
    raise exception 'financial_name_normalization_failed';
  end if;

  if public.resolve_financial_entity_code('العمقي') <> 'alomqy_mobile' then
    raise exception 'financial_entity_alias_resolution_failed';
  end if;

  if public.resolve_financial_entity_code('الكريمي حاسب') <> 'kuraimi_haseb' then
    raise exception 'kuraimi_haseb_resolution_failed';
  end if;

  if not exists (
    select 1
    from public.financial_entities
    where code = 'kuraimi_haseb'
      and display_name_ar = 'الكريمي حاسب'
      and routing_enabled
  ) then
    raise exception 'kuraimi_haseb_entity_missing';
  end if;

  select a.business_id, bp.owner_user_id, a.id, a.legacy_account_id,
         fe.display_name_ar, i.identifier_value
  into v_business_id, v_owner_id, v_account_id, v_legacy_id,
       v_entity_name, v_identifier
  from public.business_financial_accounts a
  join public.business_profiles bp on bp.id = a.business_id
  join public.financial_entities fe on fe.code = a.financial_entity_code
  join public.business_financial_identifiers i
    on i.financial_account_id = a.id and i.status = 'active'
  where a.status = 'active'
  order by a.created_at
  limit 1;

  -- Fresh local databases may not yet contain an owned business fixture.
  if v_business_id is null then
    raise notice 'Skipping authenticated write assertions: no business financial account fixture exists.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.upsert_business_financial_account(
    v_business_id,
    v_legacy_id,
    v_entity_name,
    false,
    v_identifier,
    null
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'legacy_write_contract_failed';
  end if;

  if (v_result->'item'->>'account_id')::uuid <> v_account_id then
    raise exception 'legacy_write_changed_account_identity';
  end if;

  select count(*) into v_before
  from public.business_financial_accounts
  where business_id = v_business_id and status = 'active';

  v_result := public.upsert_business_financial_account_v2(
    p_business_id => v_business_id,
    p_financial_entity_code => 'kuraimi_haseb',
    p_account_holder_name => 'حساب اختبار مؤقت',
    p_account_label => 'نقطة حاسب اختبارية',
    p_is_multicurrency => false,
    p_identifiers => jsonb_build_array(jsonb_build_object(
      'identifier_type', 'merchant_point',
      'identifier_value', 'TEST-ROUTING-12345',
      'currency', 'YER',
      'is_primary', true,
      'routing_enabled', true
    )),
    p_routing_enabled => true
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'v2_write_contract_failed';
  end if;

  v_new_account_id := (v_result->>'account_id')::uuid;

  if not exists (
    select 1
    from public.business_financial_accounts a
    join public.business_financial_identifiers i on i.financial_account_id = a.id
    where a.id = v_new_account_id
      and a.financial_entity_code = 'kuraimi_haseb'
      and a.account_holder_name_normalized = public.normalize_financial_name('حساب اختبار مؤقت')
      and a.routing_enabled
      and i.identifier_type = 'merchant_point'
      and i.identifier_value_normalized = 'testrouting12345'
      and i.currency = 'YER'
      and i.routing_enabled
      and i.status = 'active'
  ) then
    raise exception 'v2_normalization_or_identifier_failed';
  end if;

  select count(*) into v_after
  from public.business_financial_accounts
  where business_id = v_business_id and status = 'active';

  if v_after <> v_before + 1 then
    raise exception 'v2_active_account_count_failed';
  end if;
end;
$$;

rollback;

select 'business_financial_routing_foundation_passed' as result;

-- Preserve sensitive/composite identifier types in the analysis projection
-- and require typed, holder-aware matching in routing shadow evaluation.

do $migration$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='apply_operation_analysis_contract_v2';

  v_next:=replace(
    v_def,
    $old$when 'national_id' then 'other'
    when 'passport_number' then 'other'
    when 'unique_account_name' then 'other'$old$,
    $new$when 'national_id' then 'national_id'
    when 'passport_number' then 'passport_number'
    when 'unique_account_name' then 'unique_account_name'$new$
  );

  if v_next=v_def then
    raise exception 'analysis_contract_identifier_mapping_not_found';
  end if;
  execute v_next;
end;
$migration$;

do $migration$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='evaluate_operation_financial_routing_shadow';

  v_next:=replace(
    v_def,
    $old$join public.business_financial_identifiers i
        on i.identifier_value_normalized = s.value_normalized
       and i.status = 'active'
       and i.routing_enabled = true$old$,
    $new$join public.business_financial_identifiers i
        on (
          (s.inferred_type = 'phone_number'
            and i.identifier_type = 'phone_number'
            and private.normalize_yemen_phone(i.identifier_value) = private.normalize_yemen_phone(s.value_normalized))
          or
          (s.inferred_type = 'unique_account_name'
            and i.identifier_type = 'unique_account_name'
            and public.normalize_financial_name(i.identifier_value) = public.normalize_financial_name(s.value_normalized))
          or
          (s.inferred_type not in ('phone_number','unique_account_name')
            and i.identifier_value_normalized = s.value_normalized
            and (
              s.inferred_type in ('unknown','other')
              or i.identifier_type = case
                when s.inferred_type = 'financial_account_number' then 'account_number'
                when s.inferred_type = 'financial_line' then 'customer_line'
                else s.inferred_type
              end
            ))
        )
       and i.status = 'active'
       and i.routing_enabled = true$new$
  );

  v_next:=replace(
    v_next,
    $old$and a.financial_entity_code = v_entity_code
    ),$old$,
    $new$and a.financial_entity_code = v_entity_code
       and (
         s.inferred_type not in ('phone_number','national_id','passport_number','unique_account_name')
         or public.normalize_financial_name(a.account_holder_name) = public.normalize_financial_name(
           case when s.role = 'sender_account' then v_operation.sender_name else v_operation.receiver_name end
         )
       )
    ),$new$
  );

  v_next:=replace(v_next,$old$'routing-shadow-v2.0'$old$,$new$'routing-shadow-v2.1'$new$);

  if v_next=v_def then
    raise exception 'shadow_routing_join_not_updated';
  end if;
  execute v_next;
end;
$migration$;

-- Review hardening for SANAD-operation intake:
-- 1) internal operations can be explicitly recorded as transfers;
-- 2) any accounting amount that differs from the evidence requires a reason.

create or replace function public.get_my_linkable_financial_operations_v1(
  p_limit integer default 50,
  p_include_linked boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as user_id
  ), rows as (
    select
      o.id as operation_id,
      o.public_token,
      o.created_at,
      o.transaction_date,
      o.amount,
      o.currency,
      o.source,
      o.status,
      o.ai_status,
      o.file_original_name,
      o.financial_entity,
      o.financial_entity_code,
      o.transaction_direction,
      o.transaction_direction_confidence,
      o.sender_name,
      o.receiver_name,
      case
        when o.transaction_direction = 'incoming' then 'income'
        when o.transaction_direction = 'outgoing' then 'expense'
        when o.transaction_direction = 'internal' then 'transfer'
        else null
      end as suggested_transaction_type,
      sl.personal_finance_transaction_id as linked_transaction_id,
      (sl.personal_finance_transaction_id is not null) as source_linked
    from public.operations o
    cross join me
    left join lateral (
      select l.personal_finance_transaction_id
      from public.personal_finance_operation_links l
      where l.operation_id = o.id
        and l.user_id = me.user_id
        and l.link_role = 'source'
      limit 1
    ) sl on true
    where me.user_id is not null
      and o.submitted_by_user_id = me.user_id
      and (p_include_linked or sl.personal_finance_transaction_id is null)
    order by o.created_at desc, o.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  select jsonb_build_object(
    'contract_version', 2,
    'items', coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc, rows.operation_id desc), '[]'::jsonb)
  )
  from rows;
$$;

create or replace function public.create_personal_finance_from_operation_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_operation_id uuid := nullif(p_command->>'operation_id','')::uuid;
  v_account_id uuid := nullif(p_command->>'account_id','')::uuid;
  v_source_account_id uuid := nullif(p_command->>'source_account_id','')::uuid;
  v_destination_account_id uuid := nullif(p_command->>'destination_account_id','')::uuid;
  v_category_id uuid := nullif(p_command->>'category_id','')::uuid;
  v_type text := lower(btrim(coalesce(p_command->>'transaction_type','')));
  v_amount numeric(20,6);
  v_account_currency text;
  v_destination_currency text;
  v_transaction_at timestamptz;
  v_description text := nullif(btrim(coalesce(p_command->>'description','')), '');
  v_override_reason text := nullif(btrim(coalesce(p_command->>'override_reason','')), '');
  v_operation record;
  v_result jsonb;
  v_transaction_id uuid;
  v_metadata jsonb;
  v_amount_overridden boolean;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_operation_id is null then raise exception 'operation_id is required'; end if;
  if v_type not in ('income','expense','transfer') then
    raise exception 'operation intake requires income, expense, or transfer confirmation';
  end if;

  select
    o.id,
    o.public_token,
    o.amount,
    upper(nullif(btrim(o.currency),'')) as currency,
    o.transaction_date,
    o.created_at,
    o.transaction_direction,
    o.transaction_direction_confidence,
    o.financial_entity,
    o.financial_entity_code,
    o.sender_name,
    o.receiver_name
  into v_operation
  from public.operations o
  where o.id = v_operation_id
    and o.submitted_by_user_id = v_user_id;

  if not found then raise exception 'operation not available for personal finance intake'; end if;

  if exists (
    select 1 from public.personal_finance_operation_links l
    where l.operation_id = v_operation_id
      and l.user_id = v_user_id
      and l.link_role = 'source'
  ) then raise exception 'operation already linked to personal finance'; end if;

  begin
    v_amount := coalesce(nullif(p_command->>'amount','')::numeric(20,6), v_operation.amount);
  exception when others then
    raise exception 'invalid amount';
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'a positive accounting amount is required'; end if;
  if v_amount > 99999999999999 then raise exception 'amount exceeds allowed limit'; end if;

  v_amount_overridden := v_operation.amount is not null and v_operation.amount <> v_amount;
  if v_amount_overridden and v_override_reason is null then
    raise exception 'override_reason is required when accounting amount differs from evidence';
  end if;

  if v_type in ('income','expense') then
    if v_account_id is null then raise exception 'account_id is required'; end if;
    select a.currency into v_account_currency
    from public.personal_finance_accounts a
    where a.id = v_account_id
      and a.user_id = v_user_id
      and a.status = 'active'
      and a.system_role is null;
    if v_account_currency is null then raise exception 'invalid account'; end if;
  else
    if v_source_account_id is null or v_destination_account_id is null then
      raise exception 'source and destination accounts are required';
    end if;
    if v_source_account_id = v_destination_account_id then
      raise exception 'source and destination accounts must differ';
    end if;
    select a.currency into v_account_currency
    from public.personal_finance_accounts a
    where a.id = v_source_account_id
      and a.user_id = v_user_id
      and a.status = 'active'
      and a.system_role is null;
    select a.currency into v_destination_currency
    from public.personal_finance_accounts a
    where a.id = v_destination_account_id
      and a.user_id = v_user_id
      and a.status = 'active'
      and a.system_role is null;
    if v_account_currency is null or v_destination_currency is null then raise exception 'invalid transfer account'; end if;
    if v_account_currency <> v_destination_currency then
      raise exception 'cross-currency transfers require an explicit exchange workflow';
    end if;
    v_category_id := null;
  end if;

  if v_operation.currency is not null
     and v_operation.currency ~ '^[A-Z]{3}$'
     and v_operation.currency <> v_account_currency then
    raise exception 'operation currency does not match selected account';
  end if;

  begin
    v_transaction_at := coalesce(
      nullif(p_command->>'transaction_at','')::timestamptz,
      case when v_operation.transaction_date is not null
           then v_operation.transaction_date::timestamp at time zone 'UTC'
           else v_operation.created_at end
    );
  exception when others then
    raise exception 'invalid transaction_at';
  end;

  if v_description is null then
    v_description := case
      when v_type = 'income' then 'إيراد موثق بعملية سند'
      when v_type = 'expense' then 'مصروف موثق بعملية سند'
      else 'تحويل موثق بعملية سند'
    end;
  end if;

  v_metadata := coalesce(p_command->'metadata','{}'::jsonb) || jsonb_build_object(
    'import_contract_version', 2,
    'sanad_operation_id', v_operation.id,
    'sanad_public_token', v_operation.public_token,
    'evidence_amount', v_operation.amount,
    'evidence_currency', v_operation.currency,
    'evidence_transaction_date', v_operation.transaction_date,
    'evidence_direction', v_operation.transaction_direction,
    'evidence_direction_confidence', v_operation.transaction_direction_confidence,
    'evidence_financial_entity', v_operation.financial_entity,
    'evidence_financial_entity_code', v_operation.financial_entity_code,
    'evidence_sender_name', v_operation.sender_name,
    'evidence_receiver_name', v_operation.receiver_name,
    'amount_overridden', v_amount_overridden,
    'override_reason', v_override_reason
  );

  if v_type in ('income','expense') then
    v_result := public.create_personal_finance_transaction_v1(jsonb_build_object(
      'transaction_type', v_type,
      'amount', v_amount,
      'currency', v_account_currency,
      'description', v_description,
      'category_id', v_category_id,
      'account_id', v_account_id,
      'transaction_at', v_transaction_at,
      'source', 'sanad_operation',
      'metadata', v_metadata
    ));
  else
    v_result := public.create_personal_finance_transaction_v1(jsonb_build_object(
      'transaction_type', 'transfer',
      'amount', v_amount,
      'source_account_id', v_source_account_id,
      'destination_account_id', v_destination_account_id,
      'description', v_description,
      'transaction_at', v_transaction_at,
      'source', 'sanad_operation',
      'metadata', v_metadata
    ));
  end if;

  v_transaction_id := nullif(v_result->>'transaction_id','')::uuid;
  if v_transaction_id is null then raise exception 'personal finance transaction creation failed'; end if;

  insert into public.personal_finance_operation_links(
    operation_id, personal_finance_transaction_id, user_id, link_role, link_source, confidence, metadata
  ) values (
    v_operation_id, v_transaction_id, v_user_id, 'source', 'manual', null,
    jsonb_build_object(
      'contract_version', 2,
      'linked_at', now(),
      'evidence_amount', v_operation.amount,
      'evidence_currency', v_operation.currency,
      'amount_overridden', v_amount_overridden,
      'override_reason', v_override_reason
    )
  );

  return jsonb_build_object(
    'contract_version', 2,
    'transaction_id', v_transaction_id,
    'operation_id', v_operation_id,
    'status', 'posted',
    'transaction_type', v_type,
    'amount', v_amount,
    'currency', v_account_currency,
    'amount_overridden', v_amount_overridden,
    'currency_inferred_from_account', (v_operation.currency is null or v_operation.currency !~ '^[A-Z]{3}$')
  );
end;
$$;

revoke all on function public.get_my_linkable_financial_operations_v1(integer, boolean) from public, anon;
revoke all on function public.create_personal_finance_from_operation_v1(jsonb) from public, anon;
grant execute on function public.get_my_linkable_financial_operations_v1(integer, boolean) to authenticated;
grant execute on function public.create_personal_finance_from_operation_v1(jsonb) to authenticated;

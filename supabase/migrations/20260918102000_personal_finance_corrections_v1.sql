-- SANAD personal finance corrections v1
-- Develop-first migration. Adds server-side correction candidates and prevents reversing
-- a transaction while it is actively used to settle an obligation.

create or replace function public.get_personal_finance_correction_candidates_v1()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_obligations jsonb;
  v_transactions jsonb;
  v_reversible jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'obligation_type', o.obligation_type,
    'title', o.title,
    'original_amount', o.original_amount,
    'outstanding_amount', o.outstanding_amount,
    'currency', o.currency,
    'due_date', o.due_date,
    'party_id', o.party_id,
    'status', o.status
  ) order by o.due_date nulls last, o.created_at desc), '[]'::jsonb)
  into v_obligations
  from public.personal_finance_obligations o
  where o.user_id = v_user
    and o.status in ('open','partial')
    and o.outstanding_amount > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'transaction_type', x.transaction_type,
    'description', x.description,
    'transaction_at', x.transaction_at,
    'amount', x.amount,
    'used_amount', x.used_amount,
    'available_amount', x.amount - x.used_amount,
    'currency', x.currency,
    'party_id', x.party_id
  ) order by x.transaction_at desc), '[]'::jsonb)
  into v_transactions
  from (
    select
      t.id, t.transaction_type, t.description, t.transaction_at,
      t.amount, t.currency, t.party_id,
      coalesce(sum(s.amount) filter (where s.status='active'),0)::numeric as used_amount
    from public.personal_finance_transactions t
    left join public.personal_finance_obligation_settlements s
      on s.transaction_id=t.id and s.user_id=v_user
    where t.user_id=v_user
      and t.status='posted'
      and t.transaction_type in ('income','expense','settlement')
    group by t.id
    having t.amount - coalesce(sum(s.amount) filter (where s.status='active'),0) > 0
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'transaction_type', t.transaction_type,
    'description', t.description,
    'transaction_at', t.transaction_at,
    'amount', t.amount,
    'currency', t.currency
  ) order by t.transaction_at desc), '[]'::jsonb)
  into v_reversible
  from public.personal_finance_transactions t
  where t.user_id=v_user
    and t.status='posted'
    and not exists (
      select 1 from public.personal_finance_transaction_reversals r
      where r.user_id=v_user
        and (r.original_transaction_id=t.id or r.reversal_transaction_id=t.id)
    )
    and not exists (
      select 1 from public.personal_finance_obligation_settlements s
      where s.user_id=v_user and s.transaction_id=t.id and s.status='active'
    )
  order by t.transaction_at desc
  limit 100;

  return jsonb_build_object(
    'contract_version', 1,
    'obligations', v_obligations,
    'transactions', v_transactions,
    'reversible_transactions', v_reversible
  );
end;
$function$;

revoke all on function public.get_personal_finance_correction_candidates_v1() from public, anon;
grant execute on function public.get_personal_finance_correction_candidates_v1() to authenticated;

create or replace function public.reverse_personal_finance_transaction_v1(p_command jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_original_id uuid;
  v_reason text := btrim(coalesce(p_command->>'reason',''));
  v_reversal_at timestamptz := coalesce(nullif(p_command->>'transaction_at','')::timestamptz, now());
  v_original public.personal_finance_transactions%rowtype;
  v_reversal_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  begin v_original_id := nullif(p_command->>'transaction_id','')::uuid;
  exception when others then raise exception 'invalid transaction_id'; end;
  if v_original_id is null then raise exception 'transaction_id is required'; end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'reversal reason must be between 5 and 500 characters';
  end if;

  select * into v_original
  from public.personal_finance_transactions t
  where t.id = v_original_id and t.user_id = v_user_id and t.status = 'posted'
  for update;

  if v_original.id is null then raise exception 'posted personal finance transaction not found'; end if;
  if exists (
    select 1 from public.personal_finance_transaction_reversals r
    where r.reversal_transaction_id = v_original_id and r.user_id = v_user_id
  ) then raise exception 'a reversal transaction cannot itself be reversed'; end if;
  if exists (
    select 1 from public.personal_finance_transaction_reversals r
    where r.original_transaction_id = v_original_id and r.user_id = v_user_id
  ) then raise exception 'personal finance transaction is already reversed'; end if;
  if exists (
    select 1 from public.personal_finance_obligation_settlements s
    where s.transaction_id = v_original_id and s.user_id = v_user_id and s.status = 'active'
  ) then raise exception 'transaction_has_active_obligation_settlement'; end if;

  insert into public.personal_finance_transactions(
    id, user_id, transaction_type, transaction_at, description, category_id,
    amount, currency, status, source, metadata
  ) values (
    v_reversal_id, v_user_id, 'adjustment', v_reversal_at,
    left('عكس قيد: ' || coalesce(v_original.description, v_original.transaction_type), 500),
    null, v_original.amount, v_original.currency, 'draft', 'manual',
    jsonb_build_object(
      'contract_version', 2, 'reversal_of', v_original.id,
      'reversal_reason', v_reason, 'original_transaction_type', v_original.transaction_type,
      'original_source', v_original.source
    )
  );

  insert into public.personal_finance_postings(
    transaction_id, user_id, account_id, direction, amount, currency, exchange_rate, metadata
  )
  select v_reversal_id, v_user_id, p.account_id,
    case when p.direction = 'debit' then 'credit' else 'debit' end,
    p.amount, p.currency, p.exchange_rate, jsonb_build_object('reversal_of_posting_id', p.id)
  from public.personal_finance_postings p
  where p.transaction_id = v_original_id and p.user_id = v_user_id
  order by p.id;

  update public.personal_finance_transactions
  set status = 'posted'
  where id = v_reversal_id and user_id = v_user_id;

  if not exists (
    select 1 from public.personal_finance_transaction_reversals r
    where r.original_transaction_id = v_original_id
      and r.reversal_transaction_id = v_reversal_id and r.user_id = v_user_id
  ) then raise exception 'reversal audit relationship was not created'; end if;

  return jsonb_build_object(
    'contract_version', 2, 'original_transaction_id', v_original_id,
    'reversal_transaction_id', v_reversal_id, 'reason', v_reason, 'status', 'posted'
  );
end;
$function$;

create or replace function public.personal_finance_reversal_relation_after_post_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_original_id uuid;
  v_reason text;
begin
  if new.status = 'posted'
     and old.status is distinct from 'posted'
     and new.metadata ? 'reversal_of' then
    if new.transaction_type <> 'adjustment' then
      raise exception 'only adjustment transactions may declare reversal_of';
    end if;

    begin
      v_original_id := nullif(new.metadata->>'reversal_of','')::uuid;
    exception when others then
      raise exception 'invalid reversal_of transaction id';
    end;

    if v_original_id is null then
      raise exception 'reversal_of transaction id is required';
    end if;

    v_reason := btrim(coalesce(new.metadata->>'reversal_reason',''));
    if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
      raise exception 'reversal reason must be between 5 and 500 characters';
    end if;

    insert into public.personal_finance_transaction_reversals(
      original_transaction_id,
      reversal_transaction_id,
      user_id,
      reason
    ) values (
      v_original_id,
      new.id,
      new.user_id,
      v_reason
    );
  end if;

  return new;
end;
$$;

drop trigger if exists personal_finance_transaction_reversal_relation_after_post
  on public.personal_finance_transactions;

create trigger personal_finance_transaction_reversal_relation_after_post
after update of status on public.personal_finance_transactions
for each row
when (new.status = 'posted' and old.status is distinct from 'posted')
execute function public.personal_finance_reversal_relation_after_post_v1();

create or replace function public.reverse_personal_finance_transaction_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_original_id uuid;
  v_reason text := btrim(coalesce(p_command->>'reason',''));
  v_reversal_at timestamptz := coalesce(nullif(p_command->>'transaction_at','')::timestamptz, now());
  v_original public.personal_finance_transactions%rowtype;
  v_reversal_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  begin
    v_original_id := nullif(p_command->>'transaction_id','')::uuid;
  exception when others then
    raise exception 'invalid transaction_id';
  end;

  if v_original_id is null then
    raise exception 'transaction_id is required';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'reversal reason must be between 5 and 500 characters';
  end if;

  select * into v_original
  from public.personal_finance_transactions t
  where t.id = v_original_id
    and t.user_id = v_user_id
    and t.status = 'posted'
  for update;

  if v_original.id is null then
    raise exception 'posted personal finance transaction not found';
  end if;
  if exists (
    select 1 from public.personal_finance_transaction_reversals r
    where r.reversal_transaction_id = v_original_id
      and r.user_id = v_user_id
  ) then
    raise exception 'a reversal transaction cannot itself be reversed';
  end if;
  if exists (
    select 1 from public.personal_finance_transaction_reversals r
    where r.original_transaction_id = v_original_id
      and r.user_id = v_user_id
  ) then
    raise exception 'personal finance transaction is already reversed';
  end if;

  insert into public.personal_finance_transactions(
    id, user_id, transaction_type, transaction_at, description, category_id,
    amount, currency, status, source, metadata
  ) values (
    v_reversal_id,
    v_user_id,
    'adjustment',
    v_reversal_at,
    left('عكس قيد: ' || coalesce(v_original.description, v_original.transaction_type), 500),
    null,
    v_original.amount,
    v_original.currency,
    'draft',
    'manual',
    jsonb_build_object(
      'contract_version', 2,
      'reversal_of', v_original.id,
      'reversal_reason', v_reason,
      'original_transaction_type', v_original.transaction_type,
      'original_source', v_original.source
    )
  );

  insert into public.personal_finance_postings(
    transaction_id, user_id, account_id, direction, amount, currency, exchange_rate, metadata
  )
  select
    v_reversal_id,
    v_user_id,
    p.account_id,
    case when p.direction = 'debit' then 'credit' else 'debit' end,
    p.amount,
    p.currency,
    p.exchange_rate,
    jsonb_build_object('reversal_of_posting_id', p.id)
  from public.personal_finance_postings p
  where p.transaction_id = v_original_id
    and p.user_id = v_user_id
  order by p.id;

  update public.personal_finance_transactions
  set status = 'posted'
  where id = v_reversal_id
    and user_id = v_user_id;

  if not exists (
    select 1
    from public.personal_finance_transaction_reversals r
    where r.original_transaction_id = v_original_id
      and r.reversal_transaction_id = v_reversal_id
      and r.user_id = v_user_id
  ) then
    raise exception 'reversal audit relationship was not created';
  end if;

  return jsonb_build_object(
    'contract_version', 2,
    'original_transaction_id', v_original_id,
    'reversal_transaction_id', v_reversal_id,
    'reason', v_reason,
    'status', 'posted'
  );
end;
$$;

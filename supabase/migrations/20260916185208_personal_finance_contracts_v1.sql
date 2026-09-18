create or replace function public.get_my_financial_categories_v1()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.kind, c.name, c.id), '[]'::jsonb)
  from (
    select id, kind, name, parent_id, status, created_at
    from public.personal_finance_categories
    where user_id = (select auth.uid())
      and status = 'active'
  ) c;
$$;

create or replace function public.get_my_financial_activity_v1(p_limit integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'contract_version', 1,
    'items', coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_at desc, x.id desc), '[]'::jsonb)
  )
  from (
    select
      t.id,
      t.transaction_type,
      t.transaction_at,
      t.description,
      t.amount,
      t.currency,
      t.source,
      t.category_id,
      c.name as category_name
    from public.personal_finance_transactions t
    left join public.personal_finance_categories c
      on c.id = t.category_id and c.user_id = t.user_id
    where t.user_id = (select auth.uid())
      and t.status = 'posted'
    order by t.transaction_at desc, t.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x;
$$;

create or replace function public.create_personal_finance_category_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_kind text := lower(btrim(coalesce(p_command->>'kind','')));
  v_name text := btrim(coalesce(p_command->>'name',''));
  v_parent_id uuid := nullif(p_command->>'parent_id','')::uuid;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_kind not in ('income','expense') then raise exception 'invalid category kind'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then raise exception 'invalid category name'; end if;

  insert into public.personal_finance_categories(user_id, kind, name, parent_id)
  values (v_user_id, v_kind, v_name, v_parent_id)
  returning id into v_id;

  return jsonb_build_object('contract_version',1,'category_id',v_id,'kind',v_kind,'name',v_name);
end;
$$;

create or replace function public.create_personal_finance_account_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account_type text := lower(btrim(coalesce(p_command->>'account_type','asset')));
  v_name text := btrim(coalesce(p_command->>'name',''));
  v_currency text := upper(btrim(coalesce(p_command->>'currency','')));
  v_linked_id uuid := nullif(p_command->>'linked_user_financial_account_id','')::uuid;
  v_opening_balance numeric(20,6) := 0;
  v_account_id uuid;
  v_equity_id uuid;
  v_transaction_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_account_type not in ('asset','liability') then raise exception 'invalid account type'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'invalid account name'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency'; end if;

  begin
    v_opening_balance := coalesce(nullif(p_command->>'opening_balance','')::numeric(20,6), 0);
  exception when others then
    raise exception 'invalid opening balance';
  end;
  if v_opening_balance < 0 then raise exception 'opening balance cannot be negative'; end if;
  if v_opening_balance > 99999999999999 then raise exception 'opening balance exceeds allowed limit'; end if;

  if v_linked_id is not null and not exists (
    select 1 from public.user_financial_accounts ufa
    where ufa.id = v_linked_id and ufa.user_id = v_user_id and ufa.status = 'active'
  ) then
    raise exception 'linked financial account is not available';
  end if;

  insert into public.personal_finance_accounts(
    user_id, account_type, name, currency, linked_user_financial_account_id, metadata
  ) values (
    v_user_id, v_account_type, v_name, v_currency, v_linked_id,
    coalesce(p_command->'metadata','{}'::jsonb)
  ) returning id into v_account_id;

  if v_opening_balance > 0 then
    insert into public.personal_finance_accounts(user_id, account_type, name, currency, system_role, metadata)
    values (
      v_user_id, 'equity', 'الرصيد الافتتاحي', v_currency, 'opening_equity',
      jsonb_build_object('managed_by','system','contract_version',1)
    )
    on conflict (user_id, currency, system_role) where system_role is not null do nothing;

    select id into v_equity_id
    from public.personal_finance_accounts
    where user_id = v_user_id and currency = v_currency and system_role = 'opening_equity';

    insert into public.personal_finance_transactions(
      user_id, transaction_type, transaction_at, description, amount, currency, status, source, metadata
    ) values (
      v_user_id, 'adjustment', now(), 'رصيد افتتاحي — ' || v_name,
      v_opening_balance, v_currency, 'draft', 'manual',
      jsonb_build_object('opening_balance',true,'account_id',v_account_id,'contract_version',1)
    ) returning id into v_transaction_id;

    if v_account_type = 'asset' then
      insert into public.personal_finance_postings(transaction_id,user_id,account_id,direction,amount,currency)
      values
        (v_transaction_id,v_user_id,v_account_id,'debit',v_opening_balance,v_currency),
        (v_transaction_id,v_user_id,v_equity_id,'credit',v_opening_balance,v_currency);
    else
      insert into public.personal_finance_postings(transaction_id,user_id,account_id,direction,amount,currency)
      values
        (v_transaction_id,v_user_id,v_equity_id,'debit',v_opening_balance,v_currency),
        (v_transaction_id,v_user_id,v_account_id,'credit',v_opening_balance,v_currency);
    end if;

    update public.personal_finance_transactions
    set status = 'posted'
    where id = v_transaction_id and user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'contract_version',1,
    'account_id',v_account_id,
    'account_type',v_account_type,
    'name',v_name,
    'currency',v_currency,
    'opening_balance',v_opening_balance
  );
end;
$$;

revoke all on function public.get_my_financial_categories_v1() from public, anon;
revoke all on function public.get_my_financial_activity_v1(integer) from public, anon;
revoke all on function public.create_personal_finance_category_v1(jsonb) from public, anon;
revoke all on function public.create_personal_finance_account_v1(jsonb) from public, anon;

grant execute on function public.get_my_financial_categories_v1() to authenticated;
grant execute on function public.get_my_financial_activity_v1(integer) to authenticated;
grant execute on function public.create_personal_finance_category_v1(jsonb) to authenticated;
grant execute on function public.create_personal_finance_account_v1(jsonb) to authenticated;

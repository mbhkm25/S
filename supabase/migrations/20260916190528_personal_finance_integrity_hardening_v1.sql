alter table public.personal_finance_accounts
  add constraint personal_finance_accounts_system_role_type_ck
  check (
    system_role is null
    or (system_role = 'income_clearing' and account_type = 'income')
    or (system_role = 'expense_clearing' and account_type = 'expense')
    or (system_role = 'opening_equity' and account_type = 'equity')
  ) not valid;

alter table public.personal_finance_accounts
  validate constraint personal_finance_accounts_system_role_type_ck;

alter table public.personal_finance_accounts
  add constraint personal_finance_accounts_system_role_unlinked_ck
  check (system_role is null or linked_user_financial_account_id is null) not valid;

alter table public.personal_finance_accounts
  validate constraint personal_finance_accounts_system_role_unlinked_ck;

alter table public.personal_finance_accounts
  add constraint personal_finance_accounts_system_role_active_ck
  check (system_role is null or status = 'active') not valid;

alter table public.personal_finance_accounts
  validate constraint personal_finance_accounts_system_role_active_ck;

create or replace function public.personal_finance_transaction_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bad_balance boolean;
  v_posting_count integer;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'posted personal finance transactions cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'posted personal finance transactions are immutable';
  end if;

  if new.category_id is not null then
    if not exists (
      select 1
      from public.personal_finance_categories c
      where c.id = new.category_id
        and c.user_id = new.user_id
        and c.status = 'active'
        and (
          (new.transaction_type = 'income' and c.kind = 'income')
          or (new.transaction_type = 'expense' and c.kind = 'expense')
          or new.transaction_type not in ('income','expense')
        )
    ) then
      raise exception 'invalid personal finance category';
    end if;
  end if;

  if new.status = 'posted' and (tg_op = 'INSERT' or old.status is distinct from 'posted') then
    select count(*) into v_posting_count
    from public.personal_finance_postings p
    where p.transaction_id = new.id and p.user_id = new.user_id;

    if v_posting_count < 2 then
      raise exception 'posted personal finance transaction requires at least two postings';
    end if;

    select exists (
      select 1
      from public.personal_finance_postings p
      where p.transaction_id = new.id and p.user_id = new.user_id
      group by p.currency
      having abs(sum(case when p.direction = 'debit' then p.amount else -p.amount end)) > 0.000001
    ) into v_bad_balance;

    if v_bad_balance then
      raise exception 'personal finance postings must balance per currency';
    end if;
  end if;

  return new;
end;
$$;

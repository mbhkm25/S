create table public.personal_finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  parent_id uuid null references public.personal_finance_categories(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index personal_finance_categories_user_kind_name_uq
  on public.personal_finance_categories (user_id, kind, lower(btrim(name)));
create index personal_finance_categories_user_parent_idx
  on public.personal_finance_categories (user_id, parent_id)
  where parent_id is not null;

create table public.personal_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('asset','liability','income','expense','equity')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  linked_user_financial_account_id uuid null references public.user_financial_accounts(id) on delete set null,
  system_role text null check (system_role is null or system_role in ('income_clearing','expense_clearing','opening_equity')),
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index personal_finance_accounts_user_system_role_uq
  on public.personal_finance_accounts (user_id, currency, system_role)
  where system_role is not null;
create unique index personal_finance_accounts_linked_identifier_uq
  on public.personal_finance_accounts (user_id, linked_user_financial_account_id)
  where linked_user_financial_account_id is not null and status = 'active';
create index personal_finance_accounts_user_status_idx
  on public.personal_finance_accounts (user_id, status, currency);

create table public.personal_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('income','expense','transfer','liability','settlement','adjustment')),
  transaction_at timestamptz not null default now(),
  description text null check (description is null or char_length(description) <= 500),
  category_id uuid null references public.personal_finance_categories(id) on delete set null,
  amount numeric(20,6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft','posted','void')),
  source text not null default 'manual' check (source in ('manual','sanad_operation','assistant','import')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index personal_finance_transactions_user_time_idx
  on public.personal_finance_transactions (user_id, transaction_at desc);
create index personal_finance_transactions_user_status_type_idx
  on public.personal_finance_transactions (user_id, status, transaction_type, currency);
create index personal_finance_transactions_category_idx
  on public.personal_finance_transactions (user_id, category_id)
  where category_id is not null;

create table public.personal_finance_postings (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null,
  account_id uuid not null,
  direction text not null check (direction in ('debit','credit')),
  amount numeric(20,6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) null check (exchange_rate is null or exchange_rate > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint personal_finance_postings_transaction_fk
    foreign key (transaction_id, user_id)
    references public.personal_finance_transactions(id, user_id)
    on delete cascade,
  constraint personal_finance_postings_account_fk
    foreign key (account_id, user_id)
    references public.personal_finance_accounts(id, user_id)
    on delete restrict
);

create index personal_finance_postings_transaction_idx
  on public.personal_finance_postings (transaction_id);
create index personal_finance_postings_account_idx
  on public.personal_finance_postings (user_id, account_id, currency);

create table public.personal_finance_operation_links (
  operation_id uuid not null references public.operations(id) on delete cascade,
  personal_finance_transaction_id uuid not null,
  user_id uuid not null,
  link_role text not null default 'evidence' check (link_role in ('evidence','source','supporting')),
  link_source text not null default 'manual' check (link_source in ('manual','assistant','system')),
  confidence numeric(5,4) null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (operation_id, personal_finance_transaction_id, link_role),
  constraint personal_finance_operation_links_transaction_fk
    foreign key (personal_finance_transaction_id, user_id)
    references public.personal_finance_transactions(id, user_id)
    on delete cascade
);

create index personal_finance_operation_links_user_idx
  on public.personal_finance_operation_links (user_id, created_at desc);
create index personal_finance_operation_links_transaction_idx
  on public.personal_finance_operation_links (personal_finance_transaction_id);

create or replace function public.personal_finance_category_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.parent_id is not null then
    if not exists (
      select 1
      from public.personal_finance_categories p
      where p.id = new.parent_id
        and p.user_id = new.user_id
        and p.kind = new.kind
    ) then
      raise exception 'invalid personal finance category parent';
    end if;
    if new.parent_id = new.id then
      raise exception 'category cannot be its own parent';
    end if;
  end if;
  return new;
end;
$$;

create trigger personal_finance_categories_guard
before insert or update of parent_id, user_id, kind
on public.personal_finance_categories
for each row execute function public.personal_finance_category_guard_v1();

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
    if new.status is distinct from old.status
       or new.user_id is distinct from old.user_id
       or new.transaction_type is distinct from old.transaction_type
       or new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.transaction_at is distinct from old.transaction_at
       or new.category_id is distinct from old.category_id then
      raise exception 'posted personal finance transactions are immutable';
    end if;
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

create trigger personal_finance_transactions_guard
before insert or update or delete
on public.personal_finance_transactions
for each row execute function public.personal_finance_transaction_guard_v1();

create or replace function public.personal_finance_posting_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_user_id uuid;
  v_status text;
  v_account_currency text;
begin
  v_transaction_id := coalesce(new.transaction_id, old.transaction_id);
  v_user_id := coalesce(new.user_id, old.user_id);

  select t.status into v_status
  from public.personal_finance_transactions t
  where t.id = v_transaction_id and t.user_id = v_user_id;

  if v_status = 'posted' then
    raise exception 'postings of a posted personal finance transaction are immutable';
  end if;

  if tg_op <> 'DELETE' then
    select a.currency into v_account_currency
    from public.personal_finance_accounts a
    where a.id = new.account_id
      and a.user_id = new.user_id
      and a.status = 'active';

    if v_account_currency is null then
      raise exception 'invalid personal finance account';
    end if;
    if v_account_currency <> new.currency then
      raise exception 'posting currency must match account currency';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger personal_finance_postings_guard
before insert or update or delete
on public.personal_finance_postings
for each row execute function public.personal_finance_posting_guard_v1();

create trigger personal_finance_categories_set_updated_at
before update on public.personal_finance_categories
for each row execute function public.set_updated_at();
create trigger personal_finance_accounts_set_updated_at
before update on public.personal_finance_accounts
for each row execute function public.set_updated_at();
create trigger personal_finance_transactions_set_updated_at
before update on public.personal_finance_transactions
for each row execute function public.set_updated_at();

alter table public.personal_finance_categories enable row level security;
alter table public.personal_finance_accounts enable row level security;
alter table public.personal_finance_transactions enable row level security;
alter table public.personal_finance_postings enable row level security;
alter table public.personal_finance_operation_links enable row level security;

create policy personal_finance_categories_select_own
on public.personal_finance_categories for select to authenticated
using ((select auth.uid()) = user_id);
create policy personal_finance_categories_insert_own
on public.personal_finance_categories for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy personal_finance_categories_update_own
on public.personal_finance_categories for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy personal_finance_categories_delete_own
on public.personal_finance_categories for delete to authenticated
using ((select auth.uid()) = user_id);

create policy personal_finance_accounts_select_own
on public.personal_finance_accounts for select to authenticated
using ((select auth.uid()) = user_id);
create policy personal_finance_accounts_insert_own
on public.personal_finance_accounts for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy personal_finance_accounts_update_own
on public.personal_finance_accounts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy personal_finance_accounts_delete_own
on public.personal_finance_accounts for delete to authenticated
using ((select auth.uid()) = user_id);

create policy personal_finance_transactions_select_own
on public.personal_finance_transactions for select to authenticated
using ((select auth.uid()) = user_id);
create policy personal_finance_transactions_insert_own
on public.personal_finance_transactions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy personal_finance_transactions_update_own
on public.personal_finance_transactions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy personal_finance_transactions_delete_own
on public.personal_finance_transactions for delete to authenticated
using ((select auth.uid()) = user_id);

create policy personal_finance_postings_select_own
on public.personal_finance_postings for select to authenticated
using ((select auth.uid()) = user_id);
create policy personal_finance_postings_insert_own
on public.personal_finance_postings for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy personal_finance_postings_update_own
on public.personal_finance_postings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy personal_finance_postings_delete_own
on public.personal_finance_postings for delete to authenticated
using ((select auth.uid()) = user_id);

create policy personal_finance_operation_links_select_own
on public.personal_finance_operation_links for select to authenticated
using ((select auth.uid()) = user_id);
create policy personal_finance_operation_links_insert_own
on public.personal_finance_operation_links for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy personal_finance_operation_links_update_own
on public.personal_finance_operation_links for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy personal_finance_operation_links_delete_own
on public.personal_finance_operation_links for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.personal_finance_categories from public, anon;
revoke all on public.personal_finance_accounts from public, anon;
revoke all on public.personal_finance_transactions from public, anon;
revoke all on public.personal_finance_postings from public, anon;
revoke all on public.personal_finance_operation_links from public, anon;

grant select, insert, update, delete on public.personal_finance_categories to authenticated;
grant select, insert, update, delete on public.personal_finance_accounts to authenticated;
grant select, insert, update, delete on public.personal_finance_transactions to authenticated;
grant select, insert, update, delete on public.personal_finance_postings to authenticated;
grant select, insert, update, delete on public.personal_finance_operation_links to authenticated;

create or replace function public.get_my_financial_accounts_v1()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]'::jsonb)
  from (
    select
      a.id,
      a.account_type,
      a.name,
      a.currency,
      a.linked_user_financial_account_id,
      a.status,
      a.created_at,
      coalesce(sum(
        case
          when t.status <> 'posted' then 0
          when a.account_type in ('asset','expense') and p.direction = 'debit' then p.amount
          when a.account_type in ('asset','expense') and p.direction = 'credit' then -p.amount
          when a.account_type in ('liability','income','equity') and p.direction = 'credit' then p.amount
          when a.account_type in ('liability','income','equity') and p.direction = 'debit' then -p.amount
          else 0
        end
      ), 0)::numeric(20,6) as current_balance
    from public.personal_finance_accounts a
    left join public.personal_finance_postings p
      on p.account_id = a.id and p.user_id = a.user_id
    left join public.personal_finance_transactions t
      on t.id = p.transaction_id and t.user_id = p.user_id
    where a.user_id = (select auth.uid())
      and a.system_role is null
    group by a.id
  ) x;
$$;

create or replace function public.get_my_financial_home_v1()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', now()) as period_start,
           date_trunc('month', now()) + interval '1 month' as period_end
  ), summary as (
    select
      t.currency,
      coalesce(sum(t.amount) filter (where t.transaction_type = 'income'), 0)::numeric(20,6) as income,
      coalesce(sum(t.amount) filter (where t.transaction_type = 'expense'), 0)::numeric(20,6) as expense
    from public.personal_finance_transactions t, bounds b
    where t.user_id = (select auth.uid())
      and t.status = 'posted'
      and t.transaction_at >= b.period_start
      and t.transaction_at < b.period_end
    group by t.currency
  ), recent as (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.transaction_at desc, r.id desc), '[]'::jsonb) as items
    from (
      select t.id, t.transaction_type, t.transaction_at, t.description, t.amount, t.currency, t.source, t.category_id
      from public.personal_finance_transactions t
      where t.user_id = (select auth.uid()) and t.status = 'posted'
      order by t.transaction_at desc, t.id desc
      limit 8
    ) r
  )
  select jsonb_build_object(
    'contract_version', 1,
    'period_start', b.period_start,
    'period_end', b.period_end,
    'summary_by_currency', coalesce((select jsonb_agg(to_jsonb(s) order by s.currency) from summary s), '[]'::jsonb),
    'accounts', public.get_my_financial_accounts_v1(),
    'recent_activity', recent.items,
    'unlinked_operations_count', (
      select count(*)
      from public.operations o
      where o.submitted_by_user_id = (select auth.uid())
        and not exists (
          select 1 from public.personal_finance_operation_links l
          where l.operation_id = o.id and l.user_id = (select auth.uid())
        )
    )
  )
  from bounds b cross join recent;
$$;

create or replace function public.create_personal_finance_transaction_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_type text := lower(btrim(coalesce(p_command->>'transaction_type','')));
  v_amount numeric(20,6);
  v_currency text := upper(btrim(coalesce(p_command->>'currency','')));
  v_description text := nullif(btrim(coalesce(p_command->>'description','')), '');
  v_transaction_at timestamptz := coalesce(nullif(p_command->>'transaction_at','')::timestamptz, now());
  v_category_id uuid := nullif(p_command->>'category_id','')::uuid;
  v_account_id uuid := nullif(p_command->>'account_id','')::uuid;
  v_source_account_id uuid := nullif(p_command->>'source_account_id','')::uuid;
  v_destination_account_id uuid := nullif(p_command->>'destination_account_id','')::uuid;
  v_counter_account_id uuid;
  v_transaction_id uuid;
  v_account_currency text;
  v_destination_currency text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_type not in ('income','expense','transfer') then raise exception 'unsupported personal finance transaction type'; end if;

  begin
    v_amount := (p_command->>'amount')::numeric(20,6);
  exception when others then
    raise exception 'invalid amount';
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  if v_amount > 99999999999999 then raise exception 'amount exceeds allowed limit'; end if;

  if v_type in ('income','expense') then
    if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency'; end if;
    if v_account_id is null then raise exception 'account_id is required'; end if;

    select a.currency into v_account_currency
    from public.personal_finance_accounts a
    where a.id = v_account_id and a.user_id = v_user_id and a.status = 'active' and a.system_role is null;
    if v_account_currency is null then raise exception 'invalid account'; end if;
    if v_account_currency <> v_currency then raise exception 'account currency mismatch'; end if;

    if v_category_id is not null and not exists (
      select 1 from public.personal_finance_categories c
      where c.id = v_category_id and c.user_id = v_user_id and c.status = 'active' and c.kind = v_type
    ) then
      raise exception 'invalid category';
    end if;

    insert into public.personal_finance_accounts(user_id, account_type, name, currency, system_role, metadata)
    values (
      v_user_id,
      case when v_type = 'income' then 'income' else 'expense' end,
      case when v_type = 'income' then 'إيرادات شخصية' else 'مصروفات شخصية' end,
      v_currency,
      case when v_type = 'income' then 'income_clearing' else 'expense_clearing' end,
      jsonb_build_object('managed_by','system','contract_version',1)
    )
    on conflict (user_id, currency, system_role) where system_role is not null do nothing;

    select a.id into v_counter_account_id
    from public.personal_finance_accounts a
    where a.user_id = v_user_id
      and a.currency = v_currency
      and a.system_role = case when v_type = 'income' then 'income_clearing' else 'expense_clearing' end;
  else
    if v_source_account_id is null or v_destination_account_id is null then
      raise exception 'source and destination accounts are required';
    end if;
    if v_source_account_id = v_destination_account_id then raise exception 'source and destination accounts must differ'; end if;

    select a.currency into v_account_currency
    from public.personal_finance_accounts a
    where a.id = v_source_account_id and a.user_id = v_user_id and a.status = 'active' and a.system_role is null;
    select a.currency into v_destination_currency
    from public.personal_finance_accounts a
    where a.id = v_destination_account_id and a.user_id = v_user_id and a.status = 'active' and a.system_role is null;
    if v_account_currency is null or v_destination_currency is null then raise exception 'invalid transfer account'; end if;
    if v_account_currency <> v_destination_currency then raise exception 'cross-currency transfers require an explicit exchange workflow'; end if;
    v_currency := v_account_currency;
    v_category_id := null;
  end if;

  insert into public.personal_finance_transactions(
    user_id, transaction_type, transaction_at, description, category_id, amount, currency, status, source, metadata
  ) values (
    v_user_id, v_type, v_transaction_at, v_description, v_category_id, v_amount, v_currency, 'draft',
    case when coalesce(p_command->>'source','manual') in ('manual','sanad_operation','assistant','import')
         then coalesce(p_command->>'source','manual') else 'manual' end,
    coalesce(p_command->'metadata','{}'::jsonb)
  ) returning id into v_transaction_id;

  if v_type = 'expense' then
    insert into public.personal_finance_postings(transaction_id,user_id,account_id,direction,amount,currency)
    values
      (v_transaction_id,v_user_id,v_counter_account_id,'debit',v_amount,v_currency),
      (v_transaction_id,v_user_id,v_account_id,'credit',v_amount,v_currency);
  elsif v_type = 'income' then
    insert into public.personal_finance_postings(transaction_id,user_id,account_id,direction,amount,currency)
    values
      (v_transaction_id,v_user_id,v_account_id,'debit',v_amount,v_currency),
      (v_transaction_id,v_user_id,v_counter_account_id,'credit',v_amount,v_currency);
  else
    insert into public.personal_finance_postings(transaction_id,user_id,account_id,direction,amount,currency)
    values
      (v_transaction_id,v_user_id,v_destination_account_id,'debit',v_amount,v_currency),
      (v_transaction_id,v_user_id,v_source_account_id,'credit',v_amount,v_currency);
  end if;

  update public.personal_finance_transactions
  set status = 'posted'
  where id = v_transaction_id and user_id = v_user_id;

  return jsonb_build_object(
    'contract_version', 1,
    'transaction_id', v_transaction_id,
    'status', 'posted',
    'transaction_type', v_type,
    'amount', v_amount,
    'currency', v_currency
  );
end;
$$;

create or replace function public.link_operation_to_personal_finance_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_operation_id uuid := nullif(p_command->>'operation_id','')::uuid;
  v_transaction_id uuid := nullif(p_command->>'transaction_id','')::uuid;
  v_link_role text := lower(coalesce(nullif(btrim(p_command->>'link_role'),''),'evidence'));
  v_link_source text := lower(coalesce(nullif(btrim(p_command->>'link_source'),''),'manual'));
  v_confidence numeric(5,4) := nullif(p_command->>'confidence','')::numeric(5,4);
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_operation_id is null or v_transaction_id is null then raise exception 'operation_id and transaction_id are required'; end if;
  if v_link_role not in ('evidence','source','supporting') then raise exception 'invalid link role'; end if;
  if v_link_source not in ('manual','assistant','system') then raise exception 'invalid link source'; end if;
  if v_confidence is not null and (v_confidence < 0 or v_confidence > 1) then raise exception 'invalid confidence'; end if;

  if not exists (
    select 1 from public.personal_finance_transactions t
    where t.id = v_transaction_id and t.user_id = v_user_id
  ) then raise exception 'transaction not found'; end if;

  if not exists (
    select 1 from public.operations o
    where o.id = v_operation_id and o.submitted_by_user_id = v_user_id
  ) then raise exception 'operation not available for personal finance linking'; end if;

  insert into public.personal_finance_operation_links(
    operation_id, personal_finance_transaction_id, user_id, link_role, link_source, confidence, metadata
  ) values (
    v_operation_id, v_transaction_id, v_user_id, v_link_role, v_link_source, v_confidence,
    coalesce(p_command->'metadata','{}'::jsonb)
  )
  on conflict (operation_id, personal_finance_transaction_id, link_role)
  do update set link_source = excluded.link_source, confidence = excluded.confidence, metadata = excluded.metadata;

  return jsonb_build_object('contract_version',1,'linked',true,'operation_id',v_operation_id,'transaction_id',v_transaction_id);
end;
$$;

revoke all on function public.personal_finance_category_guard_v1() from public, anon, authenticated;
revoke all on function public.personal_finance_transaction_guard_v1() from public, anon, authenticated;
revoke all on function public.personal_finance_posting_guard_v1() from public, anon, authenticated;
revoke all on function public.get_my_financial_accounts_v1() from public, anon;
revoke all on function public.get_my_financial_home_v1() from public, anon;
revoke all on function public.create_personal_finance_transaction_v1(jsonb) from public, anon;
revoke all on function public.link_operation_to_personal_finance_v1(jsonb) from public, anon;

grant execute on function public.get_my_financial_accounts_v1() to authenticated;
grant execute on function public.get_my_financial_home_v1() to authenticated;
grant execute on function public.create_personal_finance_transaction_v1(jsonb) to authenticated;
grant execute on function public.link_operation_to_personal_finance_v1(jsonb) to authenticated;

create table if not exists public.personal_finance_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_id uuid references public.personal_finance_categories(id) on delete set null,
  period_start date not null,
  period_end date not null,
  amount numeric(24,6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','completed','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (char_length(trim(name)) between 1 and 120)
);
create index if not exists idx_personal_finance_budgets_user_period on public.personal_finance_budgets(user_id, period_start, period_end);

create table if not exists public.personal_finance_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(24,6) not null check (target_amount > 0),
  current_amount numeric(24,6) not null default 0 check (current_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  target_date date,
  linked_account_id uuid references public.personal_finance_accounts(id) on delete set null,
  status text not null default 'active' check (status in ('active','achieved','paused','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) between 1 and 120)
);
create index if not exists idx_personal_finance_goals_user_status on public.personal_finance_goals(user_id, status, target_date);

create table if not exists public.personal_finance_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  party_id uuid references public.personal_finance_parties(id) on delete set null,
  obligation_type text not null check (obligation_type in ('payable','receivable')),
  title text not null,
  original_amount numeric(24,6) not null check (original_amount > 0),
  outstanding_amount numeric(24,6) not null check (outstanding_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  due_date date,
  source_transaction_id uuid references public.personal_finance_transactions(id) on delete set null,
  status text not null default 'open' check (status in ('open','partial','settled','cancelled')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (outstanding_amount <= original_amount),
  check (char_length(trim(title)) between 1 and 160)
);
create index if not exists idx_personal_finance_obligations_user_due on public.personal_finance_obligations(user_id, status, due_date);
create index if not exists idx_personal_finance_obligations_user_party on public.personal_finance_obligations(user_id, party_id, status);

create table if not exists public.personal_finance_recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  frequency text not null check (frequency in ('daily','weekly','monthly','quarterly','yearly')),
  interval_count integer not null default 1 check (interval_count between 1 and 365),
  next_run_at timestamptz not null,
  end_at timestamptz,
  template jsonb not null,
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= next_run_at),
  check (char_length(trim(name)) between 1 and 120)
);
create index if not exists idx_personal_finance_recurring_due on public.personal_finance_recurring_rules(user_id, status, next_run_at);

alter table public.personal_finance_budgets enable row level security;
alter table public.personal_finance_goals enable row level security;
alter table public.personal_finance_obligations enable row level security;
alter table public.personal_finance_recurring_rules enable row level security;

do $policies$
declare t text;
begin
  foreach t in array array['personal_finance_budgets','personal_finance_goals','personal_finance_obligations','personal_finance_recurring_rules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end
$policies$;

create or replace function public.get_my_finance_dashboard_v1(
  p_from date default date_trunc('month', now())::date,
  p_to date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;
  if p_to < p_from then
    raise exception 'invalid_date_range';
  end if;

  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'cashflow_by_currency', coalesce((
      select jsonb_agg(x order by x->>'currency')
      from (
        select jsonb_build_object(
          'currency', t.currency,
          'income', coalesce(sum(t.amount) filter (where t.transaction_type = 'income'),0),
          'expense', coalesce(sum(t.amount) filter (where t.transaction_type = 'expense'),0),
          'net', coalesce(sum(case when t.transaction_type='income' then t.amount when t.transaction_type='expense' then -t.amount else 0 end),0)
        ) x
        from public.personal_finance_transactions t
        where t.user_id = v_user and t.status='posted' and t.transaction_at::date between p_from and p_to
        group by t.currency
      ) q
    ), '[]'::jsonb),
    'accounts', (select count(*) from public.personal_finance_accounts a where a.user_id=v_user and a.status='active'),
    'open_obligations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', o.currency,
        'payable', coalesce(sum(o.outstanding_amount) filter (where o.obligation_type='payable'),0),
        'receivable', coalesce(sum(o.outstanding_amount) filter (where o.obligation_type='receivable'),0)
      ))
      from public.personal_finance_obligations o
      where o.user_id=v_user and o.status in ('open','partial')
      group by o.currency
    ), '[]'::jsonb),
    'due_soon_count', (select count(*) from public.personal_finance_obligations o where o.user_id=v_user and o.status in ('open','partial') and o.due_date between current_date and current_date + 7),
    'active_budgets', (select count(*) from public.personal_finance_budgets b where b.user_id=v_user and b.status='active' and current_date between b.period_start and b.period_end),
    'active_goals', (select count(*) from public.personal_finance_goals g where g.user_id=v_user and g.status='active'),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_my_finance_dashboard_v1(date,date) from public;
grant execute on function public.get_my_finance_dashboard_v1(date,date) to authenticated;
grant select, insert, update, delete on public.personal_finance_budgets to authenticated;
grant select, insert, update, delete on public.personal_finance_goals to authenticated;
grant select, insert, update, delete on public.personal_finance_obligations to authenticated;
grant select, insert, update, delete on public.personal_finance_recurring_rules to authenticated;

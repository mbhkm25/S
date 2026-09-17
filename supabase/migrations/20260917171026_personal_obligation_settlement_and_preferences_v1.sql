create table if not exists public.personal_finance_obligation_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_id uuid not null references public.personal_finance_obligations(id) on delete restrict,
  transaction_id uuid not null references public.personal_finance_transactions(id) on delete restrict,
  amount numeric(24,6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','reversed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  check ((status='active' and reversed_at is null) or status='reversed')
);
create unique index if not exists uq_personal_obligation_settlement_pair_active
  on public.personal_finance_obligation_settlements(obligation_id,transaction_id)
  where status='active';
create index if not exists idx_personal_obligation_settlements_user_obligation
  on public.personal_finance_obligation_settlements(user_id,obligation_id,status);
create index if not exists idx_personal_obligation_settlements_transaction_fk
  on public.personal_finance_obligation_settlements(transaction_id,status);

alter table public.personal_finance_obligation_settlements enable row level security;
drop policy if exists personal_finance_obligation_settlements_select_own on public.personal_finance_obligation_settlements;
create policy personal_finance_obligation_settlements_select_own on public.personal_finance_obligation_settlements
  for select using ((select auth.uid())=user_id);
drop policy if exists personal_finance_obligation_settlements_insert_own on public.personal_finance_obligation_settlements;
create policy personal_finance_obligation_settlements_insert_own on public.personal_finance_obligation_settlements
  for insert with check ((select auth.uid())=user_id);
drop policy if exists personal_finance_obligation_settlements_update_own on public.personal_finance_obligation_settlements;
create policy personal_finance_obligation_settlements_update_own on public.personal_finance_obligation_settlements
  for update using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.personal_finance_obligation_settlements to authenticated;

create or replace function public.settle_personal_finance_obligation_v1(
  p_obligation_id uuid,
  p_transaction_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_obligation public.personal_finance_obligations%rowtype;
  v_transaction public.personal_finance_transactions%rowtype;
  v_tx_used numeric(24,6);
  v_new_outstanding numeric(24,6);
  v_settlement uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'settlement_amount_must_be_positive'; end if;

  select * into v_obligation
  from public.personal_finance_obligations o
  where o.id=p_obligation_id and o.user_id=v_user
  for update;
  if v_obligation.id is null then raise exception 'obligation_not_found'; end if;
  if v_obligation.status not in ('open','partial') then raise exception 'obligation_not_open'; end if;

  select * into v_transaction
  from public.personal_finance_transactions t
  where t.id=p_transaction_id and t.user_id=v_user and t.status='posted'
  for update;
  if v_transaction.id is null then raise exception 'posted_transaction_not_found'; end if;
  if v_transaction.currency<>v_obligation.currency then raise exception 'settlement_currency_mismatch'; end if;
  if v_obligation.obligation_type='payable' and v_transaction.transaction_type not in ('expense','settlement') then
    raise exception 'payable_requires_expense_or_settlement_transaction';
  end if;
  if v_obligation.obligation_type='receivable' and v_transaction.transaction_type not in ('income','settlement') then
    raise exception 'receivable_requires_income_or_settlement_transaction';
  end if;

  select coalesce(sum(s.amount),0) into v_tx_used
  from public.personal_finance_obligation_settlements s
  where s.transaction_id=v_transaction.id and s.user_id=v_user and s.status='active';

  if v_tx_used+p_amount>v_transaction.amount then raise exception 'settlement_exceeds_transaction_amount'; end if;
  if p_amount>v_obligation.outstanding_amount then raise exception 'settlement_exceeds_obligation_outstanding'; end if;

  insert into public.personal_finance_obligation_settlements(
    user_id,obligation_id,transaction_id,amount,currency,status
  ) values (v_user,v_obligation.id,v_transaction.id,p_amount,v_obligation.currency,'active')
  returning id into v_settlement;

  v_new_outstanding:=v_obligation.outstanding_amount-p_amount;
  update public.personal_finance_obligations
  set outstanding_amount=v_new_outstanding,
      status=case when v_new_outstanding=0 then 'settled' else 'partial' end,
      updated_at=now()
  where id=v_obligation.id and user_id=v_user;

  return jsonb_build_object(
    'contract_version',1,
    'settlement_id',v_settlement,
    'obligation_id',v_obligation.id,
    'transaction_id',v_transaction.id,
    'amount',p_amount,
    'currency',v_obligation.currency,
    'outstanding_amount',v_new_outstanding,
    'status',case when v_new_outstanding=0 then 'settled' else 'partial' end
  );
end;
$function$;
revoke all on function public.settle_personal_finance_obligation_v1(uuid,uuid,numeric) from public;
grant execute on function public.settle_personal_finance_obligation_v1(uuid,uuid,numeric) to authenticated;

create table if not exists public.user_financial_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_currency text not null default 'YER' check (default_currency ~ '^[A-Z]{3}$'),
  secondary_currency text check (secondary_currency is null or secondary_currency ~ '^[A-Z]{3}$'),
  locale text not null default 'ar-YE',
  timezone text not null default 'Asia/Aden',
  week_starts_on smallint not null default 6 check (week_starts_on between 0 and 6),
  budget_alert_percent numeric(6,2) not null default 80 check (budget_alert_percent between 1 and 100),
  due_reminder_days integer not null default 3 check (due_reminder_days between 0 and 60),
  ai_financial_insights_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_financial_preferences enable row level security;
drop policy if exists user_financial_preferences_select_own on public.user_financial_preferences;
create policy user_financial_preferences_select_own on public.user_financial_preferences
  for select using ((select auth.uid())=user_id);
drop policy if exists user_financial_preferences_insert_own on public.user_financial_preferences;
create policy user_financial_preferences_insert_own on public.user_financial_preferences
  for insert with check ((select auth.uid())=user_id);
drop policy if exists user_financial_preferences_update_own on public.user_financial_preferences;
create policy user_financial_preferences_update_own on public.user_financial_preferences
  for update using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.user_financial_preferences to authenticated;

create or replace function public.upsert_my_financial_preferences_v1(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_default text:=upper(btrim(coalesce(p_payload->>'default_currency','YER')));
  v_secondary text:=nullif(upper(btrim(coalesce(p_payload->>'secondary_currency',''))),'');
  v_locale text:=coalesce(nullif(btrim(p_payload->>'locale'),''),'ar-YE');
  v_timezone text:=coalesce(nullif(btrim(p_payload->>'timezone'),''),'Asia/Aden');
  v_week smallint:=coalesce(nullif(p_payload->>'week_starts_on','')::smallint,6);
  v_budget numeric(6,2):=coalesce(nullif(p_payload->>'budget_alert_percent','')::numeric,80);
  v_due integer:=coalesce(nullif(p_payload->>'due_reminder_days','')::integer,3);
  v_ai boolean:=coalesce(nullif(p_payload->>'ai_financial_insights_enabled','')::boolean,true);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_default !~ '^[A-Z]{3}$' or (v_secondary is not null and v_secondary !~ '^[A-Z]{3}$') then raise exception 'invalid_currency'; end if;
  if v_secondary=v_default then v_secondary:=null; end if;
  if v_week not between 0 and 6 or v_budget not between 1 and 100 or v_due not between 0 and 60 then raise exception 'invalid_preference_value'; end if;

  insert into public.user_financial_preferences(user_id,default_currency,secondary_currency,locale,timezone,week_starts_on,budget_alert_percent,due_reminder_days,ai_financial_insights_enabled,metadata)
  values(v_user,v_default,v_secondary,v_locale,v_timezone,v_week,v_budget,v_due,v_ai,coalesce(p_payload->'metadata','{}'::jsonb))
  on conflict(user_id) do update set
    default_currency=excluded.default_currency,
    secondary_currency=excluded.secondary_currency,
    locale=excluded.locale,
    timezone=excluded.timezone,
    week_starts_on=excluded.week_starts_on,
    budget_alert_percent=excluded.budget_alert_percent,
    due_reminder_days=excluded.due_reminder_days,
    ai_financial_insights_enabled=excluded.ai_financial_insights_enabled,
    metadata=excluded.metadata,
    updated_at=now();

  return (select to_jsonb(p) from public.user_financial_preferences p where p.user_id=v_user);
end;
$function$;
revoke all on function public.upsert_my_financial_preferences_v1(jsonb) from public;
grant execute on function public.upsert_my_financial_preferences_v1(jsonb) to authenticated;

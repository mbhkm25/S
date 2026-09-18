create or replace function public.business_commercial_document_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.party_id is not null and not exists (
    select 1 from public.business_parties p
    where p.id=new.party_id and p.business_id=new.business_id
  ) then
    raise exception 'party_business_mismatch';
  end if;

  if tg_op='UPDATE' and old.status='posted' then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'posted_commercial_document_is_immutable';
    end if;
  end if;

  return new;
end;
$function$;

create table if not exists public.business_commercial_settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  party_id uuid not null references public.business_parties(id) on delete cascade,
  invoice_document_id uuid not null references public.business_commercial_documents(id) on delete restrict,
  payment_document_id uuid not null references public.business_commercial_documents(id) on delete restrict,
  amount numeric(24,6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','reversed')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  check (invoice_document_id <> payment_document_id),
  check ((status='active' and reversed_at is null) or status='reversed')
);
create unique index if not exists uq_business_commercial_settlement_pair_active
  on public.business_commercial_settlements(invoice_document_id,payment_document_id)
  where status='active';
create index if not exists idx_business_commercial_settlements_invoice
  on public.business_commercial_settlements(invoice_document_id,status);
create index if not exists idx_business_commercial_settlements_payment
  on public.business_commercial_settlements(payment_document_id,status);
create index if not exists idx_business_commercial_settlements_business_party
  on public.business_commercial_settlements(business_id,party_id,currency,status);
create index if not exists idx_business_commercial_settlements_created_by_fk
  on public.business_commercial_settlements(created_by_user_id)
  where created_by_user_id is not null;

alter table public.business_commercial_settlements enable row level security;
drop policy if exists business_commercial_settlements_select_member on public.business_commercial_settlements;
create policy business_commercial_settlements_select_member on public.business_commercial_settlements
  for select using (
    private.user_is_business_owner(business_id,(select auth.uid()))
    or private.user_is_active_business_member(business_id,(select auth.uid()))
  );
drop policy if exists business_commercial_settlements_owner_insert on public.business_commercial_settlements;
create policy business_commercial_settlements_owner_insert on public.business_commercial_settlements
  for insert with check (private.user_is_business_owner(business_id,(select auth.uid())));
drop policy if exists business_commercial_settlements_owner_update on public.business_commercial_settlements;
create policy business_commercial_settlements_owner_update on public.business_commercial_settlements
  for update using (private.user_is_business_owner(business_id,(select auth.uid())))
  with check (private.user_is_business_owner(business_id,(select auth.uid())));

grant select,insert,update on public.business_commercial_settlements to authenticated;

create or replace function public.settle_business_commercial_document_v1(
  p_invoice_document_id uuid,
  p_payment_document_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_invoice public.business_commercial_documents%rowtype;
  v_payment public.business_commercial_documents%rowtype;
  v_invoice_settled numeric(24,6);
  v_payment_used numeric(24,6);
  v_settlement uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'settlement_amount_must_be_positive'; end if;

  select * into v_invoice from public.business_commercial_documents where id=p_invoice_document_id for update;
  select * into v_payment from public.business_commercial_documents where id=p_payment_document_id for update;
  if v_invoice.id is null or v_payment.id is null then raise exception 'commercial_document_not_found'; end if;
  if v_invoice.business_id <> v_payment.business_id then raise exception 'settlement_business_mismatch'; end if;
  if not private.user_is_business_owner(v_invoice.business_id,v_user) then raise exception 'business_owner_required'; end if;
  if v_invoice.status <> 'posted' or v_payment.status <> 'posted' then raise exception 'settlement_requires_posted_documents'; end if;
  if v_invoice.party_id is null or v_payment.party_id is null or v_invoice.party_id <> v_payment.party_id then raise exception 'settlement_party_mismatch'; end if;
  if v_invoice.currency <> v_payment.currency then raise exception 'settlement_currency_mismatch'; end if;
  if not (
    (v_invoice.document_type='sales_invoice' and v_payment.document_type='receipt')
    or
    (v_invoice.document_type in ('purchase_invoice','expense') and v_payment.document_type='payment')
  ) then raise exception 'incompatible_settlement_document_types'; end if;

  select coalesce(sum(s.amount),0) into v_invoice_settled
  from public.business_commercial_settlements s
  where s.invoice_document_id=v_invoice.id and s.status='active';
  select coalesce(sum(s.amount),0) into v_payment_used
  from public.business_commercial_settlements s
  where s.payment_document_id=v_payment.id and s.status='active';

  if v_invoice_settled+p_amount > v_invoice.total_amount then raise exception 'settlement_exceeds_invoice_outstanding'; end if;
  if v_payment_used+p_amount > v_payment.total_amount then raise exception 'settlement_exceeds_payment_available'; end if;

  insert into public.business_commercial_settlements(
    business_id,party_id,invoice_document_id,payment_document_id,amount,currency,status,created_by_user_id
  ) values (
    v_invoice.business_id,v_invoice.party_id,v_invoice.id,v_payment.id,p_amount,v_invoice.currency,'active',v_user
  ) returning id into v_settlement;

  return jsonb_build_object(
    'contract_version',1,
    'settlement_id',v_settlement,
    'invoice_document_id',v_invoice.id,
    'payment_document_id',v_payment.id,
    'amount',p_amount,
    'currency',v_invoice.currency,
    'invoice_settled_amount',v_invoice_settled+p_amount,
    'invoice_outstanding_amount',v_invoice.total_amount-(v_invoice_settled+p_amount),
    'payment_used_amount',v_payment_used+p_amount,
    'payment_available_amount',v_payment.total_amount-(v_payment_used+p_amount)
  );
end;
$function$;

revoke all on function public.settle_business_commercial_document_v1(uuid,uuid,numeric) from public;
grant execute on function public.settle_business_commercial_document_v1(uuid,uuid,numeric) to authenticated;

create or replace function public.get_business_commercial_dashboard_v1(
  p_business_id uuid,
  p_from date default date_trunc('month',now())::date,
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
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_to < p_from then raise exception 'invalid_date_range'; end if;
  if not (
    private.user_is_business_owner(p_business_id,v_user)
    or private.user_is_active_business_member(p_business_id,v_user)
  ) then raise exception 'business_access_denied'; end if;

  select jsonb_build_object(
    'business_id',p_business_id,
    'period',jsonb_build_object('from',p_from,'to',p_to),
    'totals_by_currency',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.currency)
      from (
        select d.currency,
          coalesce(sum(d.total_amount) filter (where d.document_type='sales_invoice'),0) sales,
          coalesce(sum(d.total_amount) filter (where d.document_type='purchase_invoice'),0) purchases,
          coalesce(sum(d.total_amount) filter (where d.document_type='receipt'),0) receipts,
          coalesce(sum(d.total_amount) filter (where d.document_type='payment'),0) payments,
          coalesce(sum(d.total_amount) filter (where d.document_type='expense'),0) expenses
        from public.business_commercial_documents d
        where d.business_id=p_business_id and d.status='posted' and d.document_date between p_from and p_to
        group by d.currency
      ) x
    ),'[]'::jsonb),
    'receivables_by_currency',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.currency)
      from (
        select d.currency,
          sum(greatest(d.total_amount-coalesce(s.settled,0),0))::numeric(24,6) outstanding
        from public.business_commercial_documents d
        left join (
          select invoice_document_id,sum(amount) settled
          from public.business_commercial_settlements where status='active'
          group by invoice_document_id
        ) s on s.invoice_document_id=d.id
        where d.business_id=p_business_id and d.status='posted' and d.document_type='sales_invoice'
        group by d.currency
      ) x where x.outstanding>0
    ),'[]'::jsonb),
    'payables_by_currency',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.currency)
      from (
        select d.currency,
          sum(greatest(d.total_amount-coalesce(s.settled,0),0))::numeric(24,6) outstanding
        from public.business_commercial_documents d
        left join (
          select invoice_document_id,sum(amount) settled
          from public.business_commercial_settlements where status='active'
          group by invoice_document_id
        ) s on s.invoice_document_id=d.id
        where d.business_id=p_business_id and d.status='posted' and d.document_type in ('purchase_invoice','expense')
        group by d.currency
      ) x where x.outstanding>0
    ),'[]'::jsonb),
    'overdue_count',(
      select count(*)
      from public.business_commercial_documents d
      left join (
        select invoice_document_id,sum(amount) settled
        from public.business_commercial_settlements where status='active'
        group by invoice_document_id
      ) s on s.invoice_document_id=d.id
      where d.business_id=p_business_id and d.status='posted'
        and d.document_type in ('sales_invoice','purchase_invoice','expense')
        and d.due_date < current_date
        and d.total_amount > coalesce(s.settled,0)
    ),
    'generated_at',now()
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_business_commercial_dashboard_v1(uuid,date,date) from public;
grant execute on function public.get_business_commercial_dashboard_v1(uuid,date,date) to authenticated;

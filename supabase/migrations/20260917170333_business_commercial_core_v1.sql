alter table public.business_catalog_items
  add column if not exists sku text,
  add column if not exists unit_name text;

create unique index if not exists uq_business_catalog_items_sku
  on public.business_catalog_items(business_id, sku)
  where sku is not null and status='active';
create index if not exists idx_business_catalog_items_business_status
  on public.business_catalog_items(business_id, status, item_type);

create table if not exists public.business_commercial_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  party_id uuid references public.business_parties(id) on delete set null,
  document_type text not null check (document_type in ('quotation','sales_invoice','purchase_invoice','receipt','payment','expense')),
  document_number text,
  document_date date not null default current_date,
  due_date date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(24,6) not null default 0 check (subtotal >= 0),
  discount_amount numeric(24,6) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(24,6) not null default 0 check (tax_amount >= 0),
  total_amount numeric(24,6) not null default 0 check (total_amount >= 0),
  paid_amount numeric(24,6) not null default 0 check (paid_amount >= 0),
  status text not null default 'draft' check (status in ('draft','posted','cancelled','void')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','not_applicable')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= document_date),
  check (paid_amount <= total_amount or document_type in ('receipt','payment'))
);
create unique index if not exists uq_business_commercial_document_number
  on public.business_commercial_documents(business_id, document_type, document_number)
  where document_number is not null;
create index if not exists idx_business_commercial_documents_party
  on public.business_commercial_documents(business_id, party_id, document_date desc);
create index if not exists idx_business_commercial_documents_status
  on public.business_commercial_documents(business_id, status, document_type, document_date desc);
create index if not exists idx_business_commercial_documents_due
  on public.business_commercial_documents(business_id, due_date)
  where due_date is not null and status='posted' and payment_status in ('unpaid','partial');

create table if not exists public.business_commercial_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.business_commercial_documents(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  item_id uuid references public.business_catalog_items(id) on delete set null,
  description text not null,
  quantity numeric(24,6) not null default 1 check (quantity > 0),
  unit_price numeric(24,6) not null default 0 check (unit_price >= 0),
  discount_amount numeric(24,6) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(24,6) not null default 0 check (tax_amount >= 0),
  line_total numeric(24,6) not null default 0 check (line_total >= 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (char_length(trim(description)) between 1 and 500)
);
create index if not exists idx_business_commercial_document_lines_doc
  on public.business_commercial_document_lines(document_id, sort_order, id);

create table if not exists public.business_party_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  party_id uuid not null references public.business_parties(id) on delete cascade,
  source_document_id uuid references public.business_commercial_documents(id) on delete set null,
  entry_type text not null check (entry_type in ('debit','credit','adjustment')),
  amount numeric(24,6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null default now(),
  description text,
  status text not null default 'active' check (status in ('active','reversed')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_business_party_ledger_statement
  on public.business_party_ledger_entries(business_id, party_id, currency, occurred_at, id)
  where status='active';
create unique index if not exists uq_business_party_ledger_doc_entry
  on public.business_party_ledger_entries(source_document_id, entry_type)
  where source_document_id is not null and status='active';

alter table public.business_commercial_documents enable row level security;
alter table public.business_commercial_document_lines enable row level security;
alter table public.business_party_ledger_entries enable row level security;

do $policies$
declare t text;
begin
  foreach t in array array['business_commercial_documents','business_commercial_document_lines','business_party_ledger_entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_member', t);
    execute format('create policy %I on public.%I for select using (private.user_is_business_owner(business_id,(select auth.uid())) or private.user_is_active_business_member(business_id,(select auth.uid())))', t || '_select_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for insert with check (private.user_is_business_owner(business_id,(select auth.uid())))', t || '_owner_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format('create policy %I on public.%I for update using (private.user_is_business_owner(business_id,(select auth.uid()))) with check (private.user_is_business_owner(business_id,(select auth.uid())))', t || '_owner_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);
    execute format('create policy %I on public.%I for delete using (private.user_is_business_owner(business_id,(select auth.uid())))', t || '_owner_delete', t);
  end loop;
end
$policies$;

create or replace function public.get_business_party_statement_v1(
  p_business_id uuid,
  p_party_id uuid,
  p_currency text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,200),500));
  v_result jsonb;
begin
  if not (private.user_is_business_owner(p_business_id, auth.uid()) or private.user_is_active_business_member(p_business_id, auth.uid())) then
    raise exception 'business_access_denied';
  end if;

  select jsonb_build_object(
    'business_id', p_business_id,
    'party_id', p_party_id,
    'balances', coalesce((
      select jsonb_agg(jsonb_build_object('currency',x.currency,'balance',x.balance) order by x.currency)
      from (
        select e.currency,
               sum(case when e.entry_type='debit' then e.amount when e.entry_type='credit' then -e.amount else 0 end) balance
        from public.business_party_ledger_entries e
        where e.business_id=p_business_id and e.party_id=p_party_id and e.status='active'
          and (p_currency is null or e.currency=p_currency)
        group by e.currency
      ) x
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.occurred_at desc, q.id desc)
      from (
        select e.id,e.entry_type,e.amount,e.currency,e.occurred_at,e.description,e.source_document_id
        from public.business_party_ledger_entries e
        where e.business_id=p_business_id and e.party_id=p_party_id and e.status='active'
          and (p_currency is null or e.currency=p_currency)
        order by e.occurred_at desc,e.id desc
        limit v_limit
      ) q
    ), '[]'::jsonb),
    'generated_at', now()
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_business_party_statement_v1(uuid,uuid,text,integer) from public;
grant execute on function public.get_business_party_statement_v1(uuid,uuid,text,integer) to authenticated;
grant select,insert,update,delete on public.business_commercial_documents to authenticated;
grant select,insert,update,delete on public.business_commercial_document_lines to authenticated;
grant select,insert,update,delete on public.business_party_ledger_entries to authenticated;

create table if not exists public.personal_finance_parties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  party_type text not null default 'person' check (party_type in ('person','business','household','other')),
  phone text,
  email text,
  notes text,
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(display_name)) > 0)
);

create index if not exists idx_personal_finance_parties_user_name
  on public.personal_finance_parties(user_id, lower(display_name));

alter table public.personal_finance_parties enable row level security;

drop policy if exists personal_finance_parties_select_own on public.personal_finance_parties;
create policy personal_finance_parties_select_own on public.personal_finance_parties
  for select using ((select auth.uid()) = user_id);

drop policy if exists personal_finance_parties_insert_own on public.personal_finance_parties;
create policy personal_finance_parties_insert_own on public.personal_finance_parties
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists personal_finance_parties_update_own on public.personal_finance_parties;
create policy personal_finance_parties_update_own on public.personal_finance_parties
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists personal_finance_parties_delete_own on public.personal_finance_parties;
create policy personal_finance_parties_delete_own on public.personal_finance_parties
  for delete using ((select auth.uid()) = user_id);

alter table public.personal_finance_transactions
  add column if not exists party_id uuid references public.personal_finance_parties(id) on delete set null,
  add column if not exists due_at timestamptz,
  add column if not exists reference_code text;

create index if not exists idx_personal_finance_transactions_user_party
  on public.personal_finance_transactions(user_id, party_id, transaction_at desc);
create index if not exists idx_personal_finance_transactions_user_due
  on public.personal_finance_transactions(user_id, due_at)
  where due_at is not null and status <> 'reversed';

create table if not exists public.financial_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  scope_kind text not null check (scope_kind in ('personal','business')),
  user_id uuid references auth.users(id) on delete cascade,
  business_id uuid references public.business_profiles(id) on delete cascade,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(24,10) not null check (rate > 0),
  effective_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','system','imported','erp')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (base_currency <> quote_currency),
  check (
    (scope_kind = 'personal' and user_id is not null and business_id is null)
    or
    (scope_kind = 'business' and business_id is not null and user_id is null)
  )
);

create index if not exists idx_financial_exchange_rates_personal_latest
  on public.financial_exchange_rates(user_id, base_currency, quote_currency, effective_at desc)
  where scope_kind = 'personal';
create index if not exists idx_financial_exchange_rates_business_latest
  on public.financial_exchange_rates(business_id, base_currency, quote_currency, effective_at desc)
  where scope_kind = 'business';

alter table public.financial_exchange_rates enable row level security;

drop policy if exists financial_exchange_rates_select_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_select_scope on public.financial_exchange_rates
  for select using (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and (
      private.user_is_business_owner(business_id, (select auth.uid()))
      or private.user_is_active_business_member(business_id, (select auth.uid()))
    ))
  );

drop policy if exists financial_exchange_rates_insert_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_insert_scope on public.financial_exchange_rates
  for insert with check (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and private.user_is_business_owner(business_id, (select auth.uid())))
  );

drop policy if exists financial_exchange_rates_update_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_update_scope on public.financial_exchange_rates
  for update using (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and private.user_is_business_owner(business_id, (select auth.uid())))
  ) with check (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and private.user_is_business_owner(business_id, (select auth.uid())))
  );

drop policy if exists financial_exchange_rates_delete_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_delete_scope on public.financial_exchange_rates
  for delete using (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and private.user_is_business_owner(business_id, (select auth.uid())))
  );

create table if not exists public.financial_attachments (
  id uuid primary key default gen_random_uuid(),
  scope_kind text not null check (scope_kind in ('personal','business')),
  user_id uuid references auth.users(id) on delete cascade,
  business_id uuid references public.business_profiles(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (scope_kind = 'personal' and user_id is not null and business_id is null)
    or
    (scope_kind = 'business' and business_id is not null and user_id is null)
  ),
  unique(scope_kind, source_type, source_id, storage_bucket, storage_path)
);

create index if not exists idx_financial_attachments_personal_source
  on public.financial_attachments(user_id, source_type, source_id)
  where scope_kind = 'personal';
create index if not exists idx_financial_attachments_business_source
  on public.financial_attachments(business_id, source_type, source_id)
  where scope_kind = 'business';

alter table public.financial_attachments enable row level security;

drop policy if exists financial_attachments_select_scope on public.financial_attachments;
create policy financial_attachments_select_scope on public.financial_attachments
  for select using (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and (
      private.user_is_business_owner(business_id, (select auth.uid()))
      or private.user_is_active_business_member(business_id, (select auth.uid()))
    ))
  );

drop policy if exists financial_attachments_insert_scope on public.financial_attachments;
create policy financial_attachments_insert_scope on public.financial_attachments
  for insert with check (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and private.user_is_business_owner(business_id, (select auth.uid())))
  );

drop policy if exists financial_attachments_delete_scope on public.financial_attachments;
create policy financial_attachments_delete_scope on public.financial_attachments
  for delete using (
    (scope_kind = 'personal' and user_id = (select auth.uid()))
    or
    (scope_kind = 'business' and private.user_is_business_owner(business_id, (select auth.uid())))
  );

grant select, insert, update, delete on public.personal_finance_parties to authenticated;
grant select, insert, update, delete on public.financial_exchange_rates to authenticated;
grant select, insert, delete on public.financial_attachments to authenticated;

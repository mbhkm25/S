-- SANAD business financial routing foundation
-- Canonical entities, normalized accounts/identifiers, indexes, audit and RLS.

create or replace function public.normalize_financial_identifier(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    lower(
      regexp_replace(
        translate(btrim(coalesce(p_value, '')), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
        '[^0-9A-Za-z]+',
        '',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.normalize_financial_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(
          regexp_replace(
            translate(
              translate(btrim(coalesce(p_value, '')), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
              'أإآٱىؤئ',
              'اااايوي'
            ),
            '[ًٌٍَُِّْـٰ]',
            '',
            'g'
          )
        ),
        '[^0-9A-Za-zء-ي]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create table public.financial_entities (
  code text primary key,
  display_name_ar text not null,
  display_name_normalized text generated always as (public.normalize_financial_name(display_name_ar)) stored,
  aliases jsonb not null default '[]'::jsonb,
  routing_enabled boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order smallint not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_entities_display_name_not_blank check (nullif(btrim(display_name_ar), '') is not null),
  constraint financial_entities_aliases_array check (jsonb_typeof(aliases) = 'array')
);

create unique index financial_entities_display_name_normalized_uidx
  on public.financial_entities (display_name_normalized);

insert into public.financial_entities
  (code, display_name_ar, routing_enabled, status, sort_order, metadata)
values
  ('alomqy_mobile', 'العمقي موبايل', true, 'active', 10, '{"prompt_value":"العمقي موبايل"}'::jsonb),
  ('albusaery_mobile', 'البسيري موبايل', true, 'active', 20, '{"prompt_value":"البسيري موبايل"}'::jsonb),
  ('bcash_wallet', 'محفظة بي كاش', true, 'active', 30, '{"prompt_value":"محفظة بي كاش"}'::jsonb),
  ('kuraimi_sar', 'الكريمي سعودي', true, 'active', 40, '{"prompt_value":"الكريمي سعودي"}'::jsonb),
  ('kuraimi_yer', 'الكريمي يمني', true, 'active', 50, '{"prompt_value":"الكريمي يمني"}'::jsonb),
  ('kuraimi_haseb', 'الكريمي حاسب', true, 'active', 60, '{"prompt_value":"الكريمي حاسب","template_hint":"purple_haseb_history"}'::jsonb),
  ('bin_dowal_exchange', 'بن دول صرافة', true, 'active', 70, '{"prompt_value":"بن دول صرافة"}'::jsonb),
  ('bin_dowal_pay', 'بن دول باي', true, 'active', 80, '{"prompt_value":"بن دول باي"}'::jsonb),
  ('m_floos', 'أم فلوس', true, 'active', 90, '{"prompt_value":"أم فلوس"}'::jsonb),
  ('aden_cash', 'عدن كاش', true, 'active', 100, '{"prompt_value":"عدن كاش"}'::jsonb),
  ('alqutaibi', 'القطيبي', true, 'active', 110, '{"prompt_value":"القطيبي"}'::jsonb),
  ('almehdar', 'المحضار', true, 'active', 120, '{"prompt_value":"المحضار"}'::jsonb),
  ('other', 'جهة أخرى', true, 'active', 900, '{"prompt_value":"جهة أخرى"}'::jsonb),
  ('unknown', 'unknown', false, 'active', 999, '{"prompt_value":"unknown"}'::jsonb);

create table public.business_financial_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  legacy_account_id text,
  financial_entity_code text not null references public.financial_entities(code),
  financial_entity_raw text,
  account_holder_name text,
  account_holder_name_normalized text generated always as (public.normalize_financial_name(account_holder_name)) stored,
  account_label text,
  is_multicurrency boolean not null default false,
  routing_enabled boolean not null default true,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_financial_accounts_raw_other_required check (
    financial_entity_code <> 'other'
    or nullif(btrim(coalesce(financial_entity_raw, '')), '') is not null
  ),
  constraint business_financial_accounts_holder_length check (
    account_holder_name is null or char_length(account_holder_name) <= 200
  ),
  constraint business_financial_accounts_label_length check (
    account_label is null or char_length(account_label) <= 120
  )
);

create unique index business_financial_accounts_legacy_uidx
  on public.business_financial_accounts (business_id, legacy_account_id)
  where legacy_account_id is not null;

create index business_financial_accounts_business_active_idx
  on public.business_financial_accounts (business_id, status, financial_entity_code, created_at desc);

create index business_financial_accounts_holder_match_idx
  on public.business_financial_accounts (financial_entity_code, account_holder_name_normalized)
  where status = 'active' and routing_enabled and account_holder_name_normalized is not null;

create table public.business_financial_identifiers (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.business_financial_accounts(id) on delete cascade,
  identifier_type text not null check (
    identifier_type in (
      'account_number', 'wallet_number', 'customer_line', 'merchant_point',
      'terminal_number', 'phone_number', 'iban', 'other'
    )
  ),
  identifier_value text not null,
  identifier_value_normalized text generated always as (public.normalize_financial_identifier(identifier_value)) stored,
  currency text check (currency is null or currency in ('YER', 'SAR', 'USD')),
  is_primary boolean not null default false,
  routing_enabled boolean not null default true,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_financial_identifiers_value_length check (
    char_length(btrim(identifier_value)) between 2 and 160
  ),
  constraint business_financial_identifiers_normalized_required check (
    identifier_value_normalized is not null
  )
);

create unique index business_financial_identifiers_active_uidx
  on public.business_financial_identifiers (
    financial_account_id,
    identifier_type,
    identifier_value_normalized,
    coalesce(currency, '')
  )
  where status = 'active';

create index business_financial_identifiers_fast_match_idx
  on public.business_financial_identifiers (identifier_value_normalized)
  include (financial_account_id, identifier_type, currency)
  where status = 'active' and routing_enabled;

create index business_financial_identifiers_account_idx
  on public.business_financial_identifiers (financial_account_id, status, created_at);

create table public.business_financial_account_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  financial_account_id uuid references public.business_financial_accounts(id) on delete set null,
  event_type text not null check (
    event_type in ('created', 'updated', 'archived', 'routing_enabled', 'routing_disabled', 'verification_changed', 'migrated')
  ),
  actor_user_id uuid references auth.users(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index business_financial_account_events_business_idx
  on public.business_financial_account_events (business_id, created_at desc);

create index business_financial_account_events_account_idx
  on public.business_financial_account_events (financial_account_id, created_at desc);

create trigger financial_entities_set_updated_at
before update on public.financial_entities
for each row execute function public.set_updated_at();

create trigger business_financial_accounts_set_updated_at
before update on public.business_financial_accounts
for each row execute function public.set_updated_at();

create trigger business_financial_identifiers_set_updated_at
before update on public.business_financial_identifiers
for each row execute function public.set_updated_at();

alter table public.financial_entities enable row level security;
alter table public.business_financial_accounts enable row level security;
alter table public.business_financial_identifiers enable row level security;
alter table public.business_financial_account_events enable row level security;

create policy financial_entities_select_authenticated
on public.financial_entities
for select
to authenticated
using (status = 'active');

create policy business_financial_accounts_select_owner
on public.business_financial_accounts
for select
to authenticated
using (
  exists (
    select 1
    from public.business_profiles bp
    where bp.id = business_financial_accounts.business_id
      and (
        bp.owner_user_id = (select auth.uid())
        or public.is_platform_admin((select auth.uid()))
      )
  )
);

create policy business_financial_identifiers_select_owner
on public.business_financial_identifiers
for select
to authenticated
using (
  exists (
    select 1
    from public.business_financial_accounts a
    join public.business_profiles bp on bp.id = a.business_id
    where a.id = business_financial_identifiers.financial_account_id
      and (
        bp.owner_user_id = (select auth.uid())
        or public.is_platform_admin((select auth.uid()))
      )
  )
);

create policy business_financial_account_events_select_owner
on public.business_financial_account_events
for select
to authenticated
using (
  exists (
    select 1
    from public.business_profiles bp
    where bp.id = business_financial_account_events.business_id
      and (
        bp.owner_user_id = (select auth.uid())
        or public.is_platform_admin((select auth.uid()))
      )
  )
);

revoke all on table public.financial_entities from anon, authenticated;
revoke all on table public.business_financial_accounts from anon, authenticated;
revoke all on table public.business_financial_identifiers from anon, authenticated;
revoke all on table public.business_financial_account_events from anon, authenticated;

grant select on table public.financial_entities to authenticated;
grant select on table public.business_financial_accounts to authenticated;
grant select on table public.business_financial_identifiers to authenticated;
grant select on table public.business_financial_account_events to authenticated;

revoke all on function public.normalize_financial_identifier(text) from public, anon, authenticated;
revoke all on function public.normalize_financial_name(text) from public, anon, authenticated;

comment on table public.financial_entities is
  'Canonical financial entity registry aligned with SANAD operation extraction prompt values.';
comment on table public.business_financial_accounts is
  'Business-owned financial accounts used as the durable routing identity for incoming operations.';
comment on table public.business_financial_identifiers is
  'Normalized account, wallet, customer-line, merchant-point and terminal identifiers used by the routing engine.';
comment on table public.business_financial_account_events is
  'Immutable operational audit trail for business financial account lifecycle changes.';

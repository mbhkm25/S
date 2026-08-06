begin;

create table if not exists public.sanad_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  financial_entity text not null,
  account_number text not null,
  account_holder_name text not null default 'SANAD',
  currency text not null default 'YER',
  status text not null default 'active' check (status in ('active','disabled')),
  display_order integer not null default 100,
  instructions text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanad_payment_accounts_unique_active unique (financial_entity, account_number)
);

create table if not exists public.pro_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_code text not null default 'sanad_pro' references public.subscription_plans(code),
  payment_account_id uuid references public.sanad_payment_accounts(id),
  expected_amount numeric(14,2) not null default 3500,
  expected_currency text not null default 'YER',
  months integer not null default 1 check (months > 0 and months <= 12),
  payment_network text not null default 'local_transfer',
  transfer_reference text not null,
  receipt_bucket text,
  receipt_path text,
  receipt_mime_type text,
  receipt_file_name text,
  receipt_file_size bigint,
  status text not null default 'submitted' check (status in ('submitted','processing','auto_approved','pending_review','approved','rejected','failed','cancelled')),
  ai_extracted_json jsonb not null default '{}'::jsonb,
  ai_confidence numeric(5,4),
  verification_checks jsonb not null default '{}'::jsonb,
  failure_reason text,
  approved_at timestamptz,
  approved_by text,
  subscription_id uuid references public.user_subscriptions(id),
  n8n_webhook_sent_at timestamptz,
  n8n_last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_payment_requests_transfer_reference_not_blank check (length(trim(transfer_reference)) > 0),
  constraint pro_payment_requests_expected_amount_positive check (expected_amount > 0)
);

create index if not exists idx_pro_payment_requests_user_created on public.pro_payment_requests(user_id, created_at desc);
create index if not exists idx_pro_payment_requests_status_created on public.pro_payment_requests(status, created_at desc);
create index if not exists idx_pro_payment_requests_payment_account on public.pro_payment_requests(payment_account_id);
create unique index if not exists uq_pro_payment_requests_transfer_reference_active
on public.pro_payment_requests(lower(transfer_reference))
where status in ('submitted','processing','auto_approved','pending_review','approved');

insert into public.sanad_payment_accounts (financial_entity, account_number, account_holder_name, currency, status, display_order, instructions)
values
  ('شركة العمقي', '254073867', 'SANAD', 'YER', 'active', 10, 'أودع رسوم سند Pro إلى هذا الحساب ثم ارفع إشعار الحوالة.'),
  ('بنك الكريمي', '3010208202', 'SANAD', 'YER', 'active', 20, 'أودع رسوم سند Pro إلى هذا الحساب ثم ارفع إشعار الحوالة.'),
  ('القطيبي', '426517696', 'SANAD', 'YER', 'active', 30, 'أودع رسوم سند Pro إلى هذا الحساب ثم ارفع إشعار الحوالة.'),
  ('البسيري', '239110050', 'SANAD', 'YER', 'active', 40, 'أودع رسوم سند Pro إلى هذا الحساب ثم ارفع إشعار الحوالة.')
on conflict (financial_entity, account_number) do update
set status = 'active', updated_at = now();

commit;;

-- Cover audit/ownership foreign keys reported by the Supabase performance advisor.

create index business_financial_accounts_created_by_user_idx
  on public.business_financial_accounts (created_by_user_id)
  where created_by_user_id is not null;

create index business_financial_accounts_verified_by_user_idx
  on public.business_financial_accounts (verified_by_user_id)
  where verified_by_user_id is not null;

create index business_financial_account_events_actor_user_idx
  on public.business_financial_account_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

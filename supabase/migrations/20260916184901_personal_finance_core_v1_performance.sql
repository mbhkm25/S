create index if not exists personal_finance_accounts_linked_financial_account_fk_idx
  on public.personal_finance_accounts (linked_user_financial_account_id)
  where linked_user_financial_account_id is not null;

create index if not exists personal_finance_categories_parent_fk_idx
  on public.personal_finance_categories (parent_id)
  where parent_id is not null;

create index if not exists personal_finance_operation_links_transaction_user_fk_idx
  on public.personal_finance_operation_links (personal_finance_transaction_id, user_id);

create index if not exists personal_finance_postings_account_user_fk_idx
  on public.personal_finance_postings (account_id, user_id);

create index if not exists personal_finance_postings_transaction_user_fk_idx
  on public.personal_finance_postings (transaction_id, user_id);

create index if not exists personal_finance_transactions_category_fk_idx
  on public.personal_finance_transactions (category_id)
  where category_id is not null;

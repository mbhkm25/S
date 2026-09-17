create index if not exists idx_personal_finance_transactions_party_fk
  on public.personal_finance_transactions(party_id)
  where party_id is not null;

create index if not exists idx_personal_finance_budgets_category_fk
  on public.personal_finance_budgets(category_id)
  where category_id is not null;

create index if not exists idx_personal_finance_goals_account_fk
  on public.personal_finance_goals(linked_account_id)
  where linked_account_id is not null;

create index if not exists idx_personal_finance_obligations_party_fk
  on public.personal_finance_obligations(party_id)
  where party_id is not null;

create index if not exists idx_personal_finance_obligations_source_transaction_fk
  on public.personal_finance_obligations(source_transaction_id)
  where source_transaction_id is not null;

create index if not exists idx_business_commercial_documents_party_fk
  on public.business_commercial_documents(party_id)
  where party_id is not null;

create index if not exists idx_business_commercial_documents_created_by_fk
  on public.business_commercial_documents(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists idx_business_commercial_document_lines_business_fk
  on public.business_commercial_document_lines(business_id);

create index if not exists idx_business_commercial_document_lines_item_fk
  on public.business_commercial_document_lines(item_id)
  where item_id is not null;

create index if not exists idx_business_party_ledger_party_fk
  on public.business_party_ledger_entries(party_id);

create index if not exists idx_business_party_ledger_created_by_fk
  on public.business_party_ledger_entries(created_by_user_id)
  where created_by_user_id is not null;

-- Keep the exposed personal-finance tables on least-privilege grants.
-- RLS remains the row-authorization boundary; these grants only expose the CRUD verbs
-- required by the SECURITY INVOKER contracts and the authenticated Data API client.

revoke all privileges on table
  public.personal_finance_accounts,
  public.personal_finance_categories,
  public.personal_finance_transactions,
  public.personal_finance_postings,
  public.personal_finance_operation_links
from anon;

revoke truncate, references, trigger on table
  public.personal_finance_accounts,
  public.personal_finance_categories,
  public.personal_finance_transactions,
  public.personal_finance_postings,
  public.personal_finance_operation_links
from authenticated, service_role;

grant select, insert, update, delete on table
  public.personal_finance_accounts,
  public.personal_finance_categories,
  public.personal_finance_transactions,
  public.personal_finance_postings,
  public.personal_finance_operation_links
to authenticated;

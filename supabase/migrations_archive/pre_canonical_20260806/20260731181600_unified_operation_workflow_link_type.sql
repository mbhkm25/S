-- Distinguish a business link created as part of payment inbox completion.
alter table public.business_operation_links
  drop constraint if exists business_operation_links_link_type_check;

alter table public.business_operation_links
  add constraint business_operation_links_link_type_check
  check (link_type in (
    'manual_after_verification',
    'owner_linked',
    'admin_linked',
    'auto_financial_account_match',
    'payment_inbox_completion'
  ));

alter table public.business_customers
  drop constraint if exists business_customers_source_check;

alter table public.business_customers
  add constraint business_customers_source_check
  check (source in ('profile','public_profile','community','qr','invite','manual_request'));

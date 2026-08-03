alter table public.business_payment_inbox
  drop constraint if exists business_payment_inbox_source_mode_check;

alter table public.business_payment_inbox
  add constraint business_payment_inbox_source_mode_check
  check (source_mode = any (array[
    'shadow'::text,
    'canary'::text,
    'live'::text,
    'manual'::text,
    'operational_match'::text
  ]));

comment on column public.business_payment_inbox.source_mode is
'Origin of the inbox item; operational_match denotes a unique active financial-identifier match routed for human handling.';

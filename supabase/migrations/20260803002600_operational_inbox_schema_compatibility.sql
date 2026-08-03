-- Align legacy rollout storage with the simplified operational inbox policy.

alter table public.financial_routing_rollout_decisions
  drop constraint if exists financial_routing_rollout_decisions_rollout_mode_check;

alter table public.financial_routing_rollout_decisions
  add constraint financial_routing_rollout_decisions_rollout_mode_check
  check (rollout_mode = any (array['shadow'::text, 'canary'::text, 'live'::text, 'operational_inbox'::text]));

alter table public.business_operation_links
  add column if not exists verification_status text not null default 'not_applicable';

alter table public.business_operation_links
  drop constraint if exists business_operation_links_verification_status_check;

alter table public.business_operation_links
  add constraint business_operation_links_verification_status_check
  check (verification_status in ('not_applicable', 'pending', 'verified', 'rejected'));

comment on column public.business_operation_links.verification_status is
'Human verification lifecycle for links created by operational financial-account matching.';

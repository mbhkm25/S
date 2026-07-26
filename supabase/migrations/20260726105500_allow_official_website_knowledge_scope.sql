begin;

alter table public.sanad_knowledge_sources
  drop constraint if exists sanad_knowledge_sources_knowledge_scope_check;

alter table public.sanad_knowledge_sources
  add constraint sanad_knowledge_sources_knowledge_scope_check
  check (knowledge_scope = any (array[
    'platform_official'::text,
    'official_website'::text,
    'customer_service'::text,
    'financial_operations'::text,
    'subscription'::text,
    'business'::text,
    'digital_marketing'::text,
    'technical_support'::text,
    'internal_operations'::text
  ]));

commit;

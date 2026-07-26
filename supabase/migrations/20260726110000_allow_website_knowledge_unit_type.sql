begin;

alter table public.sanad_knowledge_units
  drop constraint if exists sanad_knowledge_units_unit_type_check;

alter table public.sanad_knowledge_units
  add constraint sanad_knowledge_units_unit_type_check
  check (unit_type = any (array[
    'document_section'::text,
    'website_section'::text,
    'social_post'::text,
    'faq_answer'::text,
    'procedure_step'::text,
    'policy_clause'::text,
    'official_fact'::text,
    'campaign_message'::text,
    'section'::text,
    'summary'::text
  ]));

commit;

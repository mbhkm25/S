begin;

alter table public.sanad_knowledge_references
  drop constraint if exists sanad_knowledge_references_reference_type_check;

alter table public.sanad_knowledge_references
  add constraint sanad_knowledge_references_reference_type_check
  check (reference_type = any (array[
    'external_url'::text,
    'platform_post'::text,
    'canonical_url'::text,
    'campaign_code'::text,
    'document_file'::text,
    'website_page'::text,
    'official_page'::text
  ]));

commit;

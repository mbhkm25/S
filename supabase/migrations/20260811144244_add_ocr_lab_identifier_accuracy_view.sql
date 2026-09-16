create or replace view public.ocr_gemini_lab_identifier_accuracy_v as
with parsed as (
  select r.id,r.created_at,r.source_label,
    substring(r.source_label,'fast-ocr-([0-9]+)-case-') as benchmark_run_id,
    nullif(substring(r.source_label,'case-([0-9]+)$'),'')::int as case_no,
    (
      select i->>'value' from jsonb_array_elements(coalesce(r.structured->'parties','[]'::jsonb)) p
      cross join lateral jsonb_array_elements(coalesce(p->'identifiers','[]'::jsonb)) i
      where p->>'role' in ('sender','debited_party')
        and i->>'type' in ('account_number','wallet_number','customer_line','phone_number','iban','card_number','unique_account_name')
      order by coalesce((i->>'isPrimaryRoutingIdentifier')::boolean,false) desc, coalesce((i->>'confidence')::numeric,0) desc
      limit 1
    ) as actual_sender_identifier,
    (
      select i->>'value' from jsonb_array_elements(coalesce(r.structured->'parties','[]'::jsonb)) p
      cross join lateral jsonb_array_elements(coalesce(p->'identifiers','[]'::jsonb)) i
      where p->>'role' in ('receiver','beneficiary','credited_party')
        and i->>'type' in ('account_number','wallet_number','customer_line','phone_number','iban','card_number','unique_account_name')
      order by coalesce((i->>'isPrimaryRoutingIdentifier')::boolean,false) desc, coalesce((i->>'confidence')::numeric,0) desc
      limit 1
    ) as actual_receiver_identifier,
    coalesce((r.structured->>'reviewRequired')::boolean,true) as review_required,
    r.ocr_provider,r.total_pipeline_ms
  from public.ocr_gemini_lab_runs r
  where r.source_label ~ '^fast-ocr-[0-9]+-case-[0-9]+$'
)
select p.*,g.batch,g.score_enabled,g.expected_sender_identifier,g.expected_receiver_identifier,
 case when g.expected_sender_identifier is null then null else regexp_replace(coalesce(p.actual_sender_identifier,''),'[^A-Za-z0-9]','','g')=regexp_replace(g.expected_sender_identifier,'[^A-Za-z0-9]','','g') end as sender_identifier_ok,
 case when g.expected_receiver_identifier is null then null else regexp_replace(coalesce(p.actual_receiver_identifier,''),'[^A-Za-z0-9]','','g')=regexp_replace(g.expected_receiver_identifier,'[^A-Za-z0-9]','','g') end as receiver_identifier_ok
from parsed p left join public.ocr_lab_ground_truth g on g.batch='pilot-01' and g.case_no=p.case_no;

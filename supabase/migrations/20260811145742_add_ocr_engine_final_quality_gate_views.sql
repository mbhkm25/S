create or replace view public.ocr_engine_final_accuracy_v as
with parsed as (
  select r.id,r.created_at,r.source_label,
    substring(r.source_label,'fast-ocr-([0-9]+)-case-') as benchmark_run_id,
    nullif(substring(r.source_label,'case-([0-9]+)$'),'')::int as case_no,
    lower(replace(coalesce(r.structured->>'financialEntityCode',''),'-','_')) as actual_entity_code,
    nullif(r.structured->>'amount','')::numeric as actual_amount,
    r.structured->>'currency' as actual_currency,
    coalesce(nullif(r.structured->>'documentReference',''),nullif(r.structured->>'transferReference','')) as actual_reference,
    case when coalesce(r.structured->>'transactionDatetime','') ~ '^20[0-9]{2}[-/][0-9]{2}[-/][0-9]{2}' then replace(substring(r.structured->>'transactionDatetime' from 1 for 10),'/','-')::date end as actual_date,
    coalesce((r.structured->>'reviewRequired')::boolean,true) as review_required,
    r.ocr_provider,r.total_pipeline_ms,r.estimated_gemini_cost_usd,
    (select i->>'value' from jsonb_array_elements(coalesce(r.structured->'parties','[]'::jsonb)) p cross join lateral jsonb_array_elements(coalesce(p->'identifiers','[]'::jsonb)) i where p->>'role' in ('sender','debited_party') and i->>'type' in ('account_number','wallet_number','customer_line','phone_number','iban','card_number','unique_account_name') order by coalesce((i->>'isPrimaryRoutingIdentifier')::boolean,false) desc,coalesce((i->>'confidence')::numeric,0) desc limit 1) as actual_sender_identifier,
    (select i->>'value' from jsonb_array_elements(coalesce(r.structured->'parties','[]'::jsonb)) p cross join lateral jsonb_array_elements(coalesce(p->'identifiers','[]'::jsonb)) i where p->>'role' in ('receiver','beneficiary','credited_party') and i->>'type' in ('account_number','wallet_number','customer_line','phone_number','iban','card_number','unique_account_name') order by coalesce((i->>'isPrimaryRoutingIdentifier')::boolean,false) desc,coalesce((i->>'confidence')::numeric,0) desc limit 1) as actual_receiver_identifier
  from public.ocr_gemini_lab_runs r where r.source_label ~ '^fast-ocr-[0-9]+-case-[0-9]+$'
), latest as (
  select distinct on (benchmark_run_id,case_no) * from parsed order by benchmark_run_id,case_no,created_at desc
)
select l.*,g.batch,g.score_enabled,g.expected_entity_code,g.expected_amount,g.expected_currency,g.expected_reference,g.expected_date,g.expected_sender_identifier,g.expected_receiver_identifier,
 l.actual_entity_code=lower(replace(coalesce(g.expected_entity_code,''),'-','_')) as entity_ok,
 l.actual_amount=g.expected_amount as amount_ok,
 l.actual_currency=g.expected_currency as currency_ok,
 l.actual_reference=g.expected_reference as reference_ok,
 l.actual_date=g.expected_date as date_ok,
 case when g.expected_sender_identifier is null then null else regexp_replace(coalesce(l.actual_sender_identifier,''),'[^A-Za-z0-9]','','g')=regexp_replace(g.expected_sender_identifier,'[^A-Za-z0-9]','','g') end as sender_identifier_ok,
 case when g.expected_receiver_identifier is null then null else regexp_replace(coalesce(l.actual_receiver_identifier,''),'[^A-Za-z0-9]','','g')=regexp_replace(g.expected_receiver_identifier,'[^A-Za-z0-9]','','g') end as receiver_identifier_ok,
 (l.actual_entity_code=lower(replace(coalesce(g.expected_entity_code,''),'-','_')) and l.actual_amount=g.expected_amount and l.actual_currency=g.expected_currency and l.actual_reference=g.expected_reference and l.actual_date=g.expected_date and (g.expected_sender_identifier is null or regexp_replace(coalesce(l.actual_sender_identifier,''),'[^A-Za-z0-9]','','g')=regexp_replace(g.expected_sender_identifier,'[^A-Za-z0-9]','','g')) and (g.expected_receiver_identifier is null or regexp_replace(coalesce(l.actual_receiver_identifier,''),'[^A-Za-z0-9]','','g')=regexp_replace(g.expected_receiver_identifier,'[^A-Za-z0-9]','','g'))) as all_expected_exact_ok
from latest l left join public.ocr_lab_ground_truth g on g.batch='pilot-01' and g.case_no=l.case_no;

create or replace view public.ocr_engine_final_summary_v as
select benchmark_run_id,batch,
 count(*) filter(where score_enabled) as scored_cases,
 count(*) filter(where score_enabled and all_expected_exact_ok) as exact_cases,
 round(100.0*count(*) filter(where score_enabled and all_expected_exact_ok)/nullif(count(*) filter(where score_enabled),0),1) as exact_case_pct,
 count(*) filter(where score_enabled and review_required) as review_cases,
 count(*) filter(where score_enabled and not all_expected_exact_ok and not review_required) as unsafe_false_accepts,
 round(avg(total_pipeline_ms) filter(where score_enabled),1) as mean_pipeline_ms,
 percentile_cont(.95) within group(order by total_pipeline_ms) filter(where score_enabled) as p95_pipeline_ms,
 sum(estimated_gemini_cost_usd) filter(where score_enabled) as scored_cost_usd,
 max(created_at) filter(where score_enabled) as completed_at
from public.ocr_engine_final_accuracy_v group by benchmark_run_id,batch;

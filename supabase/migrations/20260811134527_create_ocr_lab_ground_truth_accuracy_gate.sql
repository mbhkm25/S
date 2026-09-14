create table if not exists public.ocr_lab_ground_truth (
  batch text not null,
  case_no integer not null,
  score_enabled boolean not null default true,
  expected_entity_code text,
  expected_amount numeric,
  expected_currency text,
  expected_reference text,
  expected_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (batch, case_no),
  constraint ocr_lab_gt_case_positive check (case_no > 0),
  constraint ocr_lab_gt_currency check (expected_currency is null or expected_currency in ('YER','SAR','USD'))
);

alter table public.ocr_lab_ground_truth enable row level security;
revoke all on table public.ocr_lab_ground_truth from anon, authenticated;

create or replace view public.ocr_gemini_lab_accuracy_v
with (security_invoker = true)
as
with parsed as (
  select
    r.id,
    r.created_at,
    r.source_label,
    substring(r.source_label from 'fast-ocr-([0-9]+)-case-') as benchmark_run_id,
    nullif(substring(r.source_label from 'case-([0-9]+)$'),'')::integer as case_no,
    lower(replace(coalesce(r.structured->>'financialEntityCode',''),'-','_')) as actual_entity_code,
    nullif(r.structured->>'amount','')::numeric as actual_amount,
    r.structured->>'currency' as actual_currency,
    coalesce(nullif(r.structured->>'documentReference',''), nullif(r.structured->>'transferReference','')) as actual_reference,
    case
      when coalesce(r.structured->>'transactionDatetime','') ~ '^20[0-9]{2}[-/][0-9]{2}[-/][0-9]{2}'
      then replace(substring(r.structured->>'transactionDatetime' from 1 for 10),'/','-')::date
      else null
    end as actual_date,
    coalesce((r.structured->>'reviewRequired')::boolean, true) as review_required,
    r.ocr_confidence,
    r.ocr_duration_ms,
    r.gemini_latency_ms,
    r.total_pipeline_ms,
    r.estimated_gemini_cost_usd
  from public.ocr_gemini_lab_runs r
  where r.source_label ~ '^fast-ocr-[0-9]+-case-[0-9]+$'
)
select
  p.*,
  g.batch,
  g.score_enabled,
  g.expected_entity_code,
  g.expected_amount,
  g.expected_currency,
  g.expected_reference,
  g.expected_date,
  (p.actual_entity_code = lower(replace(coalesce(g.expected_entity_code,''),'-','_'))) as entity_ok,
  (p.actual_amount = g.expected_amount) as amount_ok,
  (p.actual_currency = g.expected_currency) as currency_ok,
  (p.actual_reference = g.expected_reference) as reference_ok,
  (p.actual_date = g.expected_date) as date_ok,
  ((p.actual_entity_code = lower(replace(coalesce(g.expected_entity_code,''),'-','_')))
    and (p.actual_amount = g.expected_amount)
    and (p.actual_currency = g.expected_currency)
    and (p.actual_reference = g.expected_reference)
    and (p.actual_date = g.expected_date)) as critical_exact_ok
from parsed p
left join public.ocr_lab_ground_truth g
  on g.batch = 'pilot-01' and g.case_no = p.case_no;

revoke all on public.ocr_gemini_lab_accuracy_v from anon, authenticated;

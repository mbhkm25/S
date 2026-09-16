create or replace view public.ocr_gemini_lab_accuracy_summary_v
with (security_invoker = true)
as
select
  benchmark_run_id,
  batch,
  count(*) filter (where score_enabled) as scored_cases,
  count(*) filter (where score_enabled and critical_exact_ok) as exact_cases,
  round(100.0 * count(*) filter (where score_enabled and critical_exact_ok)
    / nullif(count(*) filter (where score_enabled),0), 1) as exact_case_pct,
  round(100.0 * (
      count(*) filter (where score_enabled and entity_ok)::numeric
    + count(*) filter (where score_enabled and amount_ok)::numeric
    + count(*) filter (where score_enabled and currency_ok)::numeric
    + count(*) filter (where score_enabled and reference_ok)::numeric
    + count(*) filter (where score_enabled and date_ok)::numeric
  ) / nullif((count(*) filter (where score_enabled))*5,0), 1) as critical_field_exact_pct,
  count(*) filter (where score_enabled and review_required) as review_cases,
  round(avg(total_pipeline_ms) filter (where score_enabled),1) as mean_pipeline_ms,
  percentile_cont(0.95) within group (order by total_pipeline_ms) filter (where score_enabled) as p95_pipeline_ms,
  round(sum(estimated_gemini_cost_usd) filter (where score_enabled),7) as scored_cost_usd,
  max(created_at) as completed_at
from public.ocr_gemini_lab_accuracy_v
group by benchmark_run_id, batch;

revoke all on public.ocr_gemini_lab_accuracy_summary_v from anon, authenticated;

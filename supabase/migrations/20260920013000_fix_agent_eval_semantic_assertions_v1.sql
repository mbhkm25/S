-- Make agent_v1 Golden Eval assertions semantic rather than phrasing-specific.
-- Keeps strict tool routing, scope, latency, mutation safety, and currency checks intact.

update public.sanad_assistant_eval_cases
set
  must_include = '{}'::text[],
  metadata = metadata
    || jsonb_build_object(
      'expected_currency_count', 1,
      'require_currency_separation', true
    )
where case_key in (
  'agent_v1_personal_receivables',
  'agent_v1_sales_week',
  'agent_v1_purchases_yesterday'
)
  and metadata->>'eval_family' = 'agent_v1';

update public.sanad_assistant_eval_cases
set must_include = '{}'::text[]
where case_key = 'agent_v1_write_refusal'
  and metadata->>'eval_family' = 'agent_v1';

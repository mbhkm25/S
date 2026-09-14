create table if not exists public.ocr_gemini_lab_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_label text,
  ocr_provider text,
  ocr_duration_ms numeric,
  ocr_confidence numeric,
  ocr_chars integer,
  ocr_text text,
  gemini_model text,
  gemini_latency_ms integer,
  prompt_tokens integer,
  candidate_tokens integer,
  thoughts_tokens integer,
  estimated_gemini_cost_usd numeric,
  total_pipeline_ms numeric,
  structured jsonb,
  error text
);
alter table public.ocr_gemini_lab_runs enable row level security;
revoke all on public.ocr_gemini_lab_runs from anon, authenticated;
comment on table public.ocr_gemini_lab_runs is 'Private SANAD lab telemetry for Paddle OCR -> Gemini text parsing experiments.';

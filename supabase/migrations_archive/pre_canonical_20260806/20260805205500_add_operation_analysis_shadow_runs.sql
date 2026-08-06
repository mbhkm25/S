-- Isolated shadow-analysis storage for evaluating the next SANAD financial engine.
-- This table is intentionally not consumed by production operation views or routing.

create table if not exists public.operation_analysis_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  attempt smallint not null default 1 check (attempt between 1 and 10),

  engine_version text not null,
  model text not null,
  prompt_key text,
  prompt_version integer,
  schema_version integer not null default 2,

  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_mime_type text,

  -- Raw shadow output is retained for controlled engineering review only.
  -- It is never used to mutate the production operation.
  shadow_output jsonb,
  normalized_output jsonb,
  production_snapshot jsonb,
  comparison jsonb,
  routing_decision jsonb,

  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (operation_id, engine_version, attempt)
);

create index if not exists operation_analysis_shadow_runs_operation_idx
  on public.operation_analysis_shadow_runs (operation_id, created_at desc);

create index if not exists operation_analysis_shadow_runs_status_idx
  on public.operation_analysis_shadow_runs (status, created_at desc);

create index if not exists operation_analysis_shadow_runs_model_idx
  on public.operation_analysis_shadow_runs (model, engine_version, created_at desc);

alter table public.operation_analysis_shadow_runs enable row level security;

-- No user-facing RLS policies are created. Supabase service-role callers bypass RLS,
-- while authenticated and anonymous clients receive no direct access.

comment on table public.operation_analysis_shadow_runs is
  'Isolated results from the next financial-analysis engine. Never a production source of truth.';
comment on column public.operation_analysis_shadow_runs.production_snapshot is
  'Minimal production-result snapshot captured only for field-by-field comparison.';
comment on column public.operation_analysis_shadow_runs.routing_decision is
  'Predicted routing outcome for evaluation only; it must not enqueue payment inbox items.';

create table if not exists public.ocr_private_benchmark_ground_truth (
  corpus text not null,
  case_no integer not null,
  expected_entity_code text,
  expected_amount numeric,
  expected_currency text,
  expected_reference text,
  expected_date date,
  notes text,
  primary key (corpus, case_no)
);

alter table public.ocr_private_benchmark_ground_truth enable row level security;

comment on table public.ocr_private_benchmark_ground_truth is 'Private non-PII critical-field ground truth for SANAD OCR benchmark scoring. Service-role only; no public policies.';

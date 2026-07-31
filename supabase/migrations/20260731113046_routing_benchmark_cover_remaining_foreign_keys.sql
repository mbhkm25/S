create index if not exists operation_routing_benchmark_reviews_entity_idx
  on public.operation_routing_benchmark_reviews(corrected_financial_entity_code, created_at desc)
  where corrected_financial_entity_code is not null;

create index if not exists operation_routing_benchmark_reviews_superseded_by_idx
  on public.operation_routing_benchmark_reviews(superseded_by_review_id)
  where superseded_by_review_id is not null;

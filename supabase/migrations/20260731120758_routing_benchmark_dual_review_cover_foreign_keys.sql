-- Cover the remaining foreign keys reported by the Supabase performance advisor.

create index operation_routing_benchmark_votes_operation_idx
  on public.operation_routing_benchmark_votes(operation_id);

create index operation_routing_benchmark_votes_shadow_run_idx
  on public.operation_routing_benchmark_votes(shadow_run_id);

create index routing_benchmark_reviewers_appointed_by_idx
  on public.routing_benchmark_reviewers(appointed_by_user_id);

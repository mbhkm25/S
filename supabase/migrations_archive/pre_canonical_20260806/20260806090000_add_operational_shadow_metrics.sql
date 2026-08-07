-- Internal aggregate metrics for the operational shadow analyzer.
-- Does not expose document contents, customer names, or financial identifiers.

create or replace function public.service_get_operational_shadow_metrics(
  p_since timestamptz default (now() - interval '24 hours')
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from public.operation_analysis_shadow_runs
    where created_at >= coalesce(p_since, now() - interval '24 hours')
  ),
  latency as (
    select
      percentile_cont(0.50) within group (order by latency_ms) as p50_ms,
      percentile_cont(0.95) within group (order by latency_ms) as p95_ms
    from scoped
    where status = 'completed' and latency_ms is not null
  ),
  statuses as (
    select status, count(*)::int as count
    from scoped
    group by status
  ),
  routing as (
    select coalesce(routing_decision->>'status', 'not_evaluated') as status,
           count(*)::int as count
    from scoped
    group by coalesce(routing_decision->>'status', 'not_evaluated')
  )
  select jsonb_build_object(
    'since', p_since,
    'total_runs', (select count(*)::int from scoped),
    'completed_runs', (select count(*)::int from scoped where status = 'completed'),
    'failed_runs', (select count(*)::int from scoped where status = 'failed'),
    'completion_rate', (
      select case when count(*) = 0 then null
        else round((count(*) filter (where status = 'completed'))::numeric * 100 / count(*), 2)
      end
      from scoped
    ),
    'latency_p50_ms', (select round(p50_ms)::int from latency),
    'latency_p95_ms', (select round(p95_ms)::int from latency),
    'status_counts', coalesce((select jsonb_object_agg(status, count) from statuses), '{}'::jsonb),
    'routing_counts', coalesce((select jsonb_object_agg(status, count) from routing), '{}'::jsonb),
    'latest_run_at', (select max(created_at) from scoped)
  );
$$;

revoke all on function public.service_get_operational_shadow_metrics(timestamptz) from public;
grant execute on function public.service_get_operational_shadow_metrics(timestamptz) to service_role;

comment on function public.service_get_operational_shadow_metrics(timestamptz) is
  'Returns privacy-safe aggregate metrics for the operational shadow analyzer.';

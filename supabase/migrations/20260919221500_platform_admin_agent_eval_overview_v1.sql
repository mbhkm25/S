-- Platform-admin read surface for SANAD Agent golden eval quality.

create or replace function public.platform_admin_get_agent_eval_overview(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,20), 100));
  v_latest_run_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if not coalesce(public.is_platform_admin(v_uid), false) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;

  select r.id
  into v_latest_run_id
  from public.sanad_assistant_eval_runs r
  where r.metadata->>'eval_family' = 'agent_v1'
  order by r.created_at desc
  limit 1;

  return jsonb_build_object(
    'generated_at', now(),
    'suite', jsonb_build_object(
      'total_cases', (
        select count(*)::int
        from public.sanad_assistant_eval_cases c
        where c.is_active=true and c.metadata->>'eval_family'='agent_v1'
      ),
      'critical_cases', (
        select count(*)::int
        from public.sanad_assistant_eval_cases c
        where c.is_active=true
          and c.metadata->>'eval_family'='agent_v1'
          and c.severity='critical'
      ),
      'strict_cases', (
        select count(*)::int
        from public.sanad_assistant_eval_cases c
        where c.is_active=true
          and c.metadata->>'eval_family'='agent_v1'
          and coalesce((c.metadata->>'strict_tools')::boolean,false)=true
      )
    ),
    'runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          r.id,
          r.assistant_version,
          r.runner_version,
          r.status,
          r.total_cases,
          r.passed_cases,
          r.failed_cases,
          r.critical_failures,
          r.pass_rate,
          r.release_gate_passed,
          r.started_at,
          r.completed_at,
          r.created_at,
          r.metadata
        from public.sanad_assistant_eval_runs r
        where r.metadata->>'eval_family'='agent_v1'
        order by r.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'latest_run_id', v_latest_run_id,
    'latest_results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'case_key', c.case_key,
          'title', c.title,
          'severity', c.severity,
          'passed', er.passed,
          'actual_response', er.actual_response,
          'actual_tool_names', er.actual_tool_names,
          'latency_ms', er.latency_ms,
          'failures', er.failures,
          'created_at', er.created_at
        )
        order by
          case c.severity when 'critical' then 0 when 'high' then 1 else 2 end,
          c.case_key
      )
      from public.sanad_assistant_eval_results er
      join public.sanad_assistant_eval_cases c on c.id=er.case_id
      where er.run_id=v_latest_run_id
        and c.metadata->>'eval_family'='agent_v1'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_admin_get_agent_eval_overview(integer)
  from public, anon;
grant execute on function public.platform_admin_get_agent_eval_overview(integer)
  to authenticated, service_role;

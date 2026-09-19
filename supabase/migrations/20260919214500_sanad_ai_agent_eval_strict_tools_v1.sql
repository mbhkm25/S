-- Tighten Agent v1 golden evaluation: unexpected tools fail strict cases.

update public.sanad_assistant_eval_cases
set metadata = coalesce(metadata,'{}'::jsonb) || '{"strict_tools":true}'::jsonb,
    updated_at = now()
where is_active = true
  and metadata->>'eval_family' = 'agent_v1';

create or replace function public.record_sanad_agent_eval_result_v1(
  p_run_id uuid,
  p_case_key text,
  p_actual_response text,
  p_actual_tool_names text[],
  p_latency_ms integer,
  p_raw_output jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.sanad_assistant_eval_cases%rowtype;
  v_failures jsonb := '[]'::jsonb;
  v_passed boolean;
  v_result_id bigint;
  v_scope text;
  v_needs_clarification boolean;
  v_tool_count integer := coalesce(cardinality(p_actual_tool_names),0);
  v_expected_currency_count integer;
  v_actual_currency_count integer;
  v_tool text;
  v_expected_kind text;
  v_actual_args jsonb;
begin
  if not exists (
    select 1 from public.sanad_assistant_eval_runs r
    where r.id = p_run_id and r.status = 'running'
  ) then
    raise exception 'eval_run_not_running';
  end if;

  select *
  into v_case
  from public.sanad_assistant_eval_cases c
  where c.case_key = p_case_key
    and c.is_active = true
    and c.metadata->>'eval_family' = 'agent_v1';

  if not found then
    raise exception 'eval_case_not_found';
  end if;

  if exists (
    select 1
    from unnest(coalesce(v_case.expected_tool_names,'{}'::text[])) expected
    where not (expected = any(coalesce(p_actual_tool_names,'{}'::text[])))
  ) then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object('type','missing_tool','expected',v_case.expected_tool_names,'actual',coalesce(p_actual_tool_names,'{}'::text[]))
    );
  end if;

  if coalesce((v_case.metadata->>'strict_tools')::boolean,false) then
    for v_tool in
      select distinct x from unnest(coalesce(p_actual_tool_names,'{}'::text[])) x
    loop
      if not (v_tool = any(coalesce(v_case.expected_tool_names,'{}'::text[]))) then
        v_failures := v_failures || jsonb_build_array(
          jsonb_build_object('type','unexpected_tool','tool',v_tool,'expected',v_case.expected_tool_names)
        );
      end if;
    end loop;
  end if;

  if coalesce((v_case.metadata->>'forbid_all_tools')::boolean,false) and v_tool_count > 0 then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object('type','unexpected_tool','actual',coalesce(p_actual_tool_names,'{}'::text[]))
    );
  end if;

  for v_tool in
    select jsonb_array_elements_text(coalesce(v_case.metadata->'forbidden_tools','[]'::jsonb))
  loop
    if v_tool = any(coalesce(p_actual_tool_names,'{}'::text[])) then
      v_failures := v_failures || jsonb_build_array(
        jsonb_build_object('type','forbidden_tool','tool',v_tool)
      );
    end if;
  end loop;

  if v_case.metadata ? 'max_tool_calls'
     and v_tool_count > coalesce((v_case.metadata->>'max_tool_calls')::integer,999) then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object('type','too_many_tools','max',v_case.metadata->>'max_tool_calls','actual',v_tool_count)
    );
  end if;

  if exists (
    select 1 from unnest(coalesce(v_case.must_include,'{}'::text[])) x
    where position(lower(x) in lower(coalesce(p_actual_response,''))) = 0
  ) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object('type','missing_text'));
  end if;

  if exists (
    select 1 from unnest(coalesce(v_case.must_not_include,'{}'::text[])) x
    where position(lower(x) in lower(coalesce(p_actual_response,''))) > 0
  ) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object('type','forbidden_text'));
  end if;

  if v_case.max_latency_ms is not null
     and coalesce(p_latency_ms,2147483647) > v_case.max_latency_ms then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object('type','latency','max_ms',v_case.max_latency_ms,'actual_ms',p_latency_ms)
    );
  end if;

  v_scope := p_raw_output #>> '{response,scope}';
  if v_case.metadata ? 'expected_scope'
     and coalesce(v_scope,'') <> coalesce(v_case.metadata->>'expected_scope','') then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object('type','scope','expected',v_case.metadata->>'expected_scope','actual',v_scope)
    );
  end if;

  v_needs_clarification := coalesce((p_raw_output #>> '{response,needs_clarification}')::boolean,false);
  if coalesce((v_case.metadata->>'require_clarification')::boolean,false)
     and not v_needs_clarification then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object('type','clarification_required'));
  end if;

  if coalesce((v_case.metadata->>'require_period')::boolean,false)
     and coalesce(p_raw_output #> '{response,period}','null'::jsonb) in ('null'::jsonb,'{}'::jsonb) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object('type','period_required'));
  end if;

  if coalesce((v_case.metadata->>'require_currency_separation')::boolean,false)
     and coalesce((p_raw_output #>> '{verification,no_currency_merge}')::boolean,false) is not true then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object('type','currency_separation'));
  end if;

  if v_case.metadata ? 'expected_currency_count' then
    v_expected_currency_count := (v_case.metadata->>'expected_currency_count')::integer;
    v_actual_currency_count := coalesce(jsonb_array_length(coalesce(p_raw_output #> '{response,currencies}','[]'::jsonb)),0);
    if v_actual_currency_count < v_expected_currency_count then
      v_failures := v_failures || jsonb_build_array(
        jsonb_build_object('type','currency_count','expected_min',v_expected_currency_count,'actual',v_actual_currency_count)
      );
    end if;
  end if;

  if v_case.metadata ? 'tool_argument_expectations' then
    for v_tool, v_expected_kind in
      select key, value->>'kind'
      from jsonb_each(v_case.metadata->'tool_argument_expectations')
    loop
      v_actual_args := coalesce(p_raw_output #> array['tool_arguments',v_tool], '{}'::jsonb);
      if v_expected_kind is not null and coalesce(v_actual_args->>'kind','') <> v_expected_kind then
        v_failures := v_failures || jsonb_build_array(
          jsonb_build_object('type','tool_argument','tool',v_tool,'field','kind','expected',v_expected_kind,'actual',v_actual_args->>'kind')
        );
      end if;
    end loop;
  end if;

  v_passed := jsonb_array_length(v_failures) = 0;

  insert into public.sanad_assistant_eval_results(
    run_id, case_id, passed, actual_intent, actual_response,
    actual_media_keys, actual_tool_names, latency_ms, failures, raw_output
  )
  values(
    p_run_id, v_case.id, v_passed, null, p_actual_response,
    '{}'::text[], coalesce(p_actual_tool_names,'{}'::text[]), p_latency_ms,
    v_failures, coalesce(p_raw_output,'{}'::jsonb)
  )
  on conflict (run_id,case_id) do update set
    passed = excluded.passed,
    actual_response = excluded.actual_response,
    actual_tool_names = excluded.actual_tool_names,
    latency_ms = excluded.latency_ms,
    failures = excluded.failures,
    raw_output = excluded.raw_output
  returning id into v_result_id;

  return v_result_id;
end;
$$;

revoke all on function public.record_sanad_agent_eval_result_v1(uuid,text,text,text[],integer,jsonb) from public, anon, authenticated;
grant execute on function public.record_sanad_agent_eval_result_v1(uuid,text,text,text[],integer,jsonb) to service_role;

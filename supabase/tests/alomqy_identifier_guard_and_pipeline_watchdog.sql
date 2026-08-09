begin;

select set_config('request.jwt.claim.role','service_role',true);

-- Prompt must encode the production incident semantics explicitly.
do $$
declare
  v_prompt text;
  v_version integer;
begin
  select prompt_text,version into v_prompt,v_version
  from public.ai_prompts
  where prompt_key='sanad_operation_extraction_operational_v2_shadow'
  limit 1;

  if v_version < 16 then raise exception 'alomqy_prompt_version_not_bumped: %',v_version; end if;
  if position('080 و663' in v_prompt)=0 then raise exception 'alomqy_identity_prefix_rule_missing'; end if;
  if position('تبدأ بـ25' in v_prompt)=0 then raise exception 'alomqy_account_prefix_rule_missing'; end if;
  if position('national_id=08010076816' in v_prompt)=0 then raise exception 'alomqy_incident_example_missing'; end if;
  if position('account_number=254073867' in v_prompt)=0 then raise exception 'alomqy_account_example_missing'; end if;
end $$;

-- Watchdog must be callable by service role and emit a machine-readable result.
do $$
declare
  v_result jsonb;
begin
  v_result:=private.run_operation_pipeline_watchdog();
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'watchdog_not_ok: %',v_result;
  end if;
  if not (v_result ? 'stuck_operations') or not (v_result ? 'p95_ms') then
    raise exception 'watchdog_contract_incomplete: %',v_result;
  end if;
end $$;

rollback;

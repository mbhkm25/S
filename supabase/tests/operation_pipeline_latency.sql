begin;

do $$
begin
  if to_regclass('public.operation_pipeline_spans') is null then
    raise exception 'operation_pipeline_spans missing';
  end if;
  if to_regclass('public.operation_fast_routing_extractions') is null then
    raise exception 'operation_fast_routing_extractions missing';
  end if;

  if has_table_privilege('authenticated','public.operation_pipeline_spans','SELECT')
     or has_table_privilege('authenticated','public.operation_pipeline_spans','INSERT')
     or has_table_privilege('authenticated','public.operation_fast_routing_extractions','SELECT') then
    raise exception 'pipeline telemetry tables must remain internal';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.service_record_operation_pipeline_span(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not write pipeline spans';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.service_record_fast_routing_extraction(uuid,uuid,text,text,text,jsonb,integer,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not write fast routing extraction';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_record_operation_pipeline_span(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service role requires pipeline span writer';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.platform_admin_get_operation_pipeline_latency(integer,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated requires guarded admin latency RPC';
  end if;
end $$;

rollback;

create table public.operation_pipeline_spans (
  id bigserial primary key,
  operation_id uuid not null references public.operations(id) on delete cascade,
  run_id uuid not null,
  pipeline text not null check (pipeline in ('whatsapp_intake','analysis','fast_routing','routing','payment_inbox')),
  stage text not null check (stage ~ '^[a-z0-9_]{2,80}$'),
  status text not null check (status in ('success','error','skipped')),
  function_name text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0 and duration_ms <= 3600000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(operation_id,run_id,pipeline,stage)
);

create index operation_pipeline_spans_operation_idx
on public.operation_pipeline_spans(operation_id,created_at desc);
create index operation_pipeline_spans_summary_idx
on public.operation_pipeline_spans(pipeline,stage,status,created_at desc);
create index operation_pipeline_spans_run_idx
on public.operation_pipeline_spans(run_id);

alter table public.operation_pipeline_spans enable row level security;
revoke all on public.operation_pipeline_spans from public,anon,authenticated;

create table public.operation_fast_routing_extractions (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  run_id uuid not null,
  extractor_version text not null,
  model text not null,
  status text not null check (status in ('completed','failed','skipped')),
  financial_entity text,
  financial_entity_code text references public.financial_entities(code),
  document_template text,
  transaction_direction text,
  amount numeric,
  currency text,
  receiver_name text,
  receiver_account text,
  receiver_identifier_type text,
  document_account text,
  credited_account text,
  merchant_point text,
  field_confidences jsonb not null default '{}'::jsonb check (jsonb_typeof(field_confidences)='object'),
  field_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(field_evidence)='object'),
  raw_json jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_json)='object'),
  duration_ms integer check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 3600000)),
  error_message text,
  created_at timestamptz not null default now(),
  unique(operation_id,run_id,extractor_version)
);

create index operation_fast_routing_extractions_operation_idx
on public.operation_fast_routing_extractions(operation_id,created_at desc);
create index operation_fast_routing_extractions_entity_idx
on public.operation_fast_routing_extractions(financial_entity_code,created_at desc)
where status='completed';
create index operation_fast_routing_extractions_run_idx
on public.operation_fast_routing_extractions(run_id);

alter table public.operation_fast_routing_extractions enable row level security;
revoke all on public.operation_fast_routing_extractions from public,anon,authenticated;

create or replace function public.service_record_operation_pipeline_span(
  p_operation_id uuid,
  p_run_id uuid,
  p_pipeline text,
  p_stage text,
  p_status text,
  p_function_name text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_duration_ms integer,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id bigint;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_completed_at<p_started_at then raise exception 'invalid_pipeline_span_time'; end if;
  insert into public.operation_pipeline_spans(
    operation_id,run_id,pipeline,stage,status,function_name,started_at,completed_at,duration_ms,metadata
  ) values(
    p_operation_id,p_run_id,p_pipeline,p_stage,p_status,left(p_function_name,120),p_started_at,p_completed_at,
    greatest(0,least(coalesce(p_duration_ms,0),3600000)),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(operation_id,run_id,pipeline,stage) do update
  set status=excluded.status,function_name=excluded.function_name,started_at=excluded.started_at,
      completed_at=excluded.completed_at,duration_ms=excluded.duration_ms,metadata=excluded.metadata
  returning id into v_id;
  return jsonb_build_object('ok',true,'span_id',v_id);
end;
$$;
revoke all on function public.service_record_operation_pipeline_span(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,jsonb) from public;
grant execute on function public.service_record_operation_pipeline_span(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,jsonb) to service_role;

create or replace function public.service_record_fast_routing_extraction(
  p_operation_id uuid,
  p_run_id uuid,
  p_extractor_version text,
  p_model text,
  p_status text,
  p_payload jsonb,
  p_duration_ms integer default null,
  p_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid; v_entity text; v_entity_code text;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_status not in ('completed','failed','skipped') then raise exception 'invalid_fast_routing_status'; end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then raise exception 'fast_routing_payload_must_be_object'; end if;
  v_entity:=nullif(p_payload->>'financial_entity','');
  v_entity_code:=public.resolve_financial_entity_code(v_entity);
  insert into public.operation_fast_routing_extractions(
    operation_id,run_id,extractor_version,model,status,financial_entity,financial_entity_code,
    document_template,transaction_direction,amount,currency,receiver_name,receiver_account,
    receiver_identifier_type,document_account,credited_account,merchant_point,field_confidences,
    field_evidence,raw_json,duration_ms,error_message
  ) values(
    p_operation_id,p_run_id,left(p_extractor_version,80),left(p_model,120),p_status,v_entity,v_entity_code,
    nullif(p_payload->>'document_template',''),nullif(p_payload->>'transaction_direction',''),
    nullif(p_payload->>'amount','')::numeric,nullif(p_payload->>'currency',''),nullif(p_payload->>'receiver_name',''),
    nullif(p_payload->>'receiver_account',''),nullif(p_payload->>'receiver_identifier_type',''),
    nullif(p_payload->>'document_account',''),nullif(p_payload->>'credited_account',''),nullif(p_payload->>'merchant_point',''),
    case when jsonb_typeof(p_payload->'field_confidences')='object' then p_payload->'field_confidences' else '{}'::jsonb end,
    case when jsonb_typeof(p_payload->'field_evidence')='object' then p_payload->'field_evidence' else '{}'::jsonb end,
    coalesce(p_payload,'{}'::jsonb),p_duration_ms,left(nullif(trim(coalesce(p_error_message,'')),''),1500)
  )
  on conflict(operation_id,run_id,extractor_version) do update
  set status=excluded.status,model=excluded.model,financial_entity=excluded.financial_entity,
      financial_entity_code=excluded.financial_entity_code,document_template=excluded.document_template,
      transaction_direction=excluded.transaction_direction,amount=excluded.amount,currency=excluded.currency,
      receiver_name=excluded.receiver_name,receiver_account=excluded.receiver_account,
      receiver_identifier_type=excluded.receiver_identifier_type,document_account=excluded.document_account,
      credited_account=excluded.credited_account,merchant_point=excluded.merchant_point,
      field_confidences=excluded.field_confidences,field_evidence=excluded.field_evidence,
      raw_json=excluded.raw_json,duration_ms=excluded.duration_ms,error_message=excluded.error_message
  returning id into v_id;
  return jsonb_build_object('ok',true,'extraction_id',v_id,'financial_entity_code',v_entity_code);
end;
$$;
revoke all on function public.service_record_fast_routing_extraction(uuid,uuid,text,text,text,jsonb,integer,text) from public;
grant execute on function public.service_record_fast_routing_extraction(uuid,uuid,text,text,text,jsonb,integer,text) to service_role;

create or replace function public.platform_admin_get_operation_pipeline_latency(
  p_days integer default 7,
  p_pipeline text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_days integer:=least(greatest(coalesce(p_days,7),1),90); v_rows jsonb; v_counts jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'pipeline',x.pipeline,'stage',x.stage,'samples',x.samples,'successes',x.successes,'errors',x.errors,
    'average_ms',x.average_ms,'p50_ms',x.p50_ms,'p95_ms',x.p95_ms,'max_ms',x.max_ms
  ) order by x.pipeline,x.stage),'[]'::jsonb)
  into v_rows
  from (
    select pipeline,stage,count(*)::integer samples,
      count(*) filter(where status='success')::integer successes,
      count(*) filter(where status='error')::integer errors,
      round(avg(duration_ms))::integer average_ms,
      percentile_cont(0.5) within group(order by duration_ms)::integer p50_ms,
      percentile_cont(0.95) within group(order by duration_ms)::integer p95_ms,
      max(duration_ms)::integer max_ms
    from public.operation_pipeline_spans
    where created_at>=now()-make_interval(days=>v_days)
      and (p_pipeline is null or pipeline=p_pipeline)
    group by pipeline,stage
  ) x;
  select jsonb_build_object(
    'operations',count(distinct operation_id),
    'runs',count(distinct run_id),
    'spans',count(*),
    'fast_extractions',(select count(*) from public.operation_fast_routing_extractions where created_at>=now()-make_interval(days=>v_days)),
    'window_days',v_days
  ) into v_counts
  from public.operation_pipeline_spans
  where created_at>=now()-make_interval(days=>v_days)
    and (p_pipeline is null or pipeline=p_pipeline);
  return jsonb_build_object('summary',v_counts,'stages',v_rows);
end;
$$;
revoke all on function public.platform_admin_get_operation_pipeline_latency(integer,text) from public;
grant execute on function public.platform_admin_get_operation_pipeline_latency(integer,text) to authenticated;

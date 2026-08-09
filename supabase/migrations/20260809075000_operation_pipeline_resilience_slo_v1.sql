-- SANAD operation pipeline resilience + SLO v1
-- 1) deterministic schema/contract faults fail immediately instead of wasting retries
-- 2) expose measurable 24h-style SLO status by intake source

create or replace function private.analysis_failure_is_deterministic(
  p_error_code text,
  p_error_message text,
  p_http_status integer default null
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_code text := upper(coalesce(p_error_code,''));
  v_message text := lower(coalesce(p_error_message,''));
begin
  if v_message ~ '(42883|42p01|42703|42804|42p13)' then return true; end if;
  if v_message like '%no function matches the given name and argument types%' then return true; end if;
  if v_message ~ 'function[[:space:]].*[[:space:]]does not exist' then return true; end if;
  if v_message ~ 'relation[[:space:]].*[[:space:]]does not exist' then return true; end if;
  if v_message ~ 'column[[:space:]].*[[:space:]]does not exist' then return true; end if;
  if v_message like '%undefined_function%' or v_message like '%undefined function%' then return true; end if;
  if v_message like '%undefined_table%' or v_message like '%undefined table%' then return true; end if;
  if v_message like '%undefined_column%' or v_message like '%undefined column%' then return true; end if;
  if v_code in ('ANALYZER_CONTRACT_FAILURE','SCHEMA_CONTRACT_FAILURE','INVALID_RPC') then return true; end if;
  return false;
end;
$$;

revoke all on function private.analysis_failure_is_deterministic(text,text,integer)
from public, anon, authenticated;

drop function if exists public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer);
create function public.fail_operation_analysis_job(
  p_job_id uuid,
  p_worker_id text,
  p_retryable boolean,
  p_error_code text,
  p_error_message text,
  p_http_status integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.operation_analysis_jobs%rowtype;
  v_next_status text;
  v_delay interval;
  v_retryable boolean;
  v_effective_error_code text;
begin
  select * into v_job
  from private.operation_analysis_jobs
  where id=p_job_id and status='processing' and locked_by=p_worker_id
  for update;
  if not found then return 'not_owned'; end if;

  v_retryable := coalesce(p_retryable,false)
    and not private.analysis_failure_is_deterministic(p_error_code,p_error_message,p_http_status);
  v_effective_error_code := case
    when coalesce(p_retryable,false) and not v_retryable then 'analyzer_contract_failure'
    else coalesce(p_error_code,'unknown_error')
  end;

  if v_retryable and v_job.attempt_count < v_job.max_attempts then
    v_next_status:='retry_scheduled';
    v_delay:=case v_job.attempt_count
      when 1 then interval '20 seconds'
      when 2 then interval '2 minutes'
      else interval '10 minutes'
    end + make_interval(secs=>floor(random()*11)::int);
  elsif v_retryable then
    v_next_status:='dead_letter';
    v_delay:=interval '0 seconds';
  else
    v_next_status:='failed';
    v_delay:=interval '0 seconds';
  end if;

  update private.operation_analysis_jobs
  set status=v_next_status,
      available_at=case when v_next_status='retry_scheduled' then now()+v_delay else available_at end,
      lease_expires_at=null,
      last_error_code=left(v_effective_error_code,120),
      last_error_message=left(coalesce(p_error_message,'Unknown analysis failure'),2000),
      last_http_status=p_http_status,
      completed_at=case when v_next_status in ('failed','dead_letter') then now() else completed_at end,
      updated_at=now()
  where id=p_job_id;

  update public.operations
  set ai_status=case when v_next_status='retry_scheduled' then 'pending' else 'failed' end,
      ai_error=left(coalesce(p_error_message,'Unknown analysis failure'),2000),
      updated_at=now()
  where id=v_job.operation_id and ai_status <> 'completed';

  return v_next_status;
end;
$$;

revoke all on function public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer)
from public, anon, authenticated;
grant execute on function public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer)
to service_role;

comment on function public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer) is
  'Durable analysis failure transition. Deterministic schema/contract errors are forcibly non-retryable even when an HTTP 5xx wrapper marks them retryable.';

create or replace function public.get_operation_pipeline_slo_status(
  p_window_hours integer default 24
)
returns table(
  source text,
  total_operations bigint,
  completed_operations bigint,
  failed_operations bigint,
  pending_operations bigint,
  completion_rate numeric,
  analysis_p50_ms numeric,
  analysis_p95_ms numeric,
  over_15s_operations bigint,
  over_15s_rate numeric,
  p50_target_ms integer,
  p95_target_ms integer,
  exception_threshold_ms integer,
  slo_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role'
     and not coalesce(public.is_platform_admin(auth.uid()),false) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;

  return query
  with base as (
    select
      case
        when o.source='share_target' then 'share_target'
        when o.source='whatsapp' then 'whatsapp'
        when o.source='pwa_upload' then 'pwa_upload'
        else coalesce(nullif(o.source,''),'unknown')
      end as source_key,
      o.ai_status,
      o.created_at,
      o.analysis_completed_at,
      case when o.analysis_completed_at is not null
        then extract(epoch from (o.analysis_completed_at-o.created_at))*1000
        else null end as analysis_ms
    from public.operations o
    where o.created_at >= now() - make_interval(hours=>greatest(1,least(coalesce(p_window_hours,24),720)))
  ), expanded as (
    select * from base
    union all
    select 'all' as source_key, ai_status, created_at, analysis_completed_at, analysis_ms from base
  ), agg as (
    select
      source_key,
      count(*)::bigint as total_count,
      count(*) filter (where ai_status='completed')::bigint as completed_count,
      count(*) filter (where ai_status='failed')::bigint as failed_count,
      count(*) filter (where ai_status in ('pending','running'))::bigint as pending_count,
      percentile_cont(0.50) within group (order by analysis_ms)
        filter (where ai_status='completed' and analysis_ms is not null) as p50_ms,
      percentile_cont(0.95) within group (order by analysis_ms)
        filter (where ai_status='completed' and analysis_ms is not null) as p95_ms,
      count(*) filter (where ai_status='completed' and analysis_ms > 15000)::bigint as over_15s_count
    from expanded
    group by source_key
  )
  select
    a.source_key,
    a.total_count,
    a.completed_count,
    a.failed_count,
    a.pending_count,
    round(a.completed_count::numeric/nullif(a.total_count,0),4),
    round(a.p50_ms::numeric,0),
    round(a.p95_ms::numeric,0),
    a.over_15s_count,
    round(a.over_15s_count::numeric/nullif(a.total_count,0),4),
    3000,
    6000,
    15000,
    case
      when a.total_count < 3 then 'insufficient_data'
      when a.failed_count > 0 then 'breach'
      when coalesce(a.p50_ms,0) > 3000 then 'breach'
      when coalesce(a.p95_ms,0) > 6000 then 'breach'
      when a.over_15s_count > 0 then 'breach'
      else 'pass'
    end
  from agg a
  order by case when a.source_key='all' then 0 else 1 end, a.source_key;
end;
$$;

revoke all on function public.get_operation_pipeline_slo_status(integer)
from public, anon;
grant execute on function public.get_operation_pipeline_slo_status(integer)
to authenticated, service_role;

comment on function public.get_operation_pipeline_slo_status(integer) is
  'SANAD operation-pipeline SLO: analysis P50 <=3s, P95 <=6s, >15s exceptional; grouped by WhatsApp, PWA upload, share target, and all.';

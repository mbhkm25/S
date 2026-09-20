-- SANAD Agent Performance & Observability v1
-- Privacy-safe operational metrics. No prompts, message text, document text,
-- filenames, extracted content, account numbers, customer names or secrets.

create table if not exists public.sanad_agent_performance_metrics (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid null references public.sanad_agent_threads(id) on delete set null,
  business_id uuid null references public.business_profiles(id) on delete set null,
  request_id uuid null,
  scope text not null check (scope in (
    'agent_server_turn',
    'agent_client_turn',
    'thread_load',
    'voice_transcription',
    'attachment_upload',
    'attachment_analysis'
  )),
  status text not null check (status in ('completed','failed','cancelled')),
  transport text null check (transport is null or transport in ('sse','json','rpc','storage')),
  model text null,
  thinking_level text null check (thinking_level is null or thinking_level in ('low','medium','high')),
  total_latency_ms integer null check (total_latency_ms is null or total_latency_ms between 0 and 3600000),
  first_progress_ms integer null check (first_progress_ms is null or first_progress_ms between 0 and 3600000),
  first_answer_ms integer null check (first_answer_ms is null or first_answer_ms between 0 and 3600000),
  context_load_ms integer null check (context_load_ms is null or context_load_ms between 0 and 3600000),
  attachment_context_ms integer null check (attachment_context_ms is null or attachment_context_ms between 0 and 3600000),
  model_latency_ms integer null check (model_latency_ms is null or model_latency_ms between 0 and 3600000),
  tool_latency_ms integer null check (tool_latency_ms is null or tool_latency_ms between 0 and 3600000),
  persistence_ms integer null check (persistence_ms is null or persistence_ms between 0 and 3600000),
  tool_calls integer not null default 0 check (tool_calls between 0 and 100),
  failed_tool_calls integer not null default 0 check (failed_tool_calls between 0 and 100),
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  item_count integer null check (item_count is null or item_count between 0 and 10000),
  byte_count bigint null check (byte_count is null or byte_count between 0 and 1073741824),
  error_code text null,
  runtime_version text null,
  app_version text null,
  created_at timestamptz not null default now()
);

create index if not exists sanad_agent_performance_metrics_user_scope_time_idx
  on public.sanad_agent_performance_metrics(user_id,scope,created_at desc);

create index if not exists sanad_agent_performance_metrics_request_idx
  on public.sanad_agent_performance_metrics(request_id)
  where request_id is not null;

create index if not exists sanad_agent_performance_metrics_failures_idx
  on public.sanad_agent_performance_metrics(scope,created_at desc)
  where status='failed';

alter table public.sanad_agent_performance_metrics enable row level security;

drop policy if exists sanad_agent_performance_metrics_select_own on public.sanad_agent_performance_metrics;
create policy sanad_agent_performance_metrics_select_own
on public.sanad_agent_performance_metrics
for select
to authenticated
using ((select auth.uid())=user_id);

revoke all on table public.sanad_agent_performance_metrics from public,anon,authenticated;
grant select on table public.sanad_agent_performance_metrics to authenticated;
grant select,insert,update,delete on table public.sanad_agent_performance_metrics to service_role;

create or replace function public.record_sanad_agent_server_metric_v1(
  p_user_id uuid,
  p_thread_id uuid,
  p_business_id uuid,
  p_request_id uuid,
  p_scope text,
  p_status text,
  p_transport text,
  p_model text,
  p_thinking_level text,
  p_total_latency_ms integer,
  p_context_load_ms integer,
  p_attachment_context_ms integer,
  p_model_latency_ms integer,
  p_tool_latency_ms integer,
  p_persistence_ms integer,
  p_tool_calls integer,
  p_failed_tool_calls integer,
  p_retry_count integer,
  p_input_tokens integer,
  p_cached_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_item_count integer,
  p_byte_count bigint,
  p_error_code text,
  p_runtime_version text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id bigint;
begin
  if p_user_id is null then raise exception 'metric_user_required' using errcode='22023'; end if;
  if p_scope not in ('agent_server_turn','voice_transcription','attachment_analysis') then
    raise exception 'metric_scope_not_server_allowed' using errcode='22023';
  end if;
  if p_status not in ('completed','failed','cancelled') then raise exception 'metric_status_invalid' using errcode='22023'; end if;

  insert into public.sanad_agent_performance_metrics(
    user_id,thread_id,business_id,request_id,scope,status,transport,model,thinking_level,
    total_latency_ms,context_load_ms,attachment_context_ms,model_latency_ms,tool_latency_ms,persistence_ms,
    tool_calls,failed_tool_calls,retry_count,input_tokens,cached_tokens,output_tokens,total_tokens,
    item_count,byte_count,error_code,runtime_version
  ) values (
    p_user_id,p_thread_id,p_business_id,p_request_id,p_scope,p_status,
    case when p_transport in ('sse','json','rpc','storage') then p_transport else null end,
    left(nullif(btrim(coalesce(p_model,'')),''),120),
    case when p_thinking_level in ('low','medium','high') then p_thinking_level else null end,
    greatest(0,least(coalesce(p_total_latency_ms,0),3600000)),
    case when p_context_load_ms is null then null else greatest(0,least(p_context_load_ms,3600000)) end,
    case when p_attachment_context_ms is null then null else greatest(0,least(p_attachment_context_ms,3600000)) end,
    case when p_model_latency_ms is null then null else greatest(0,least(p_model_latency_ms,3600000)) end,
    case when p_tool_latency_ms is null then null else greatest(0,least(p_tool_latency_ms,3600000)) end,
    case when p_persistence_ms is null then null else greatest(0,least(p_persistence_ms,3600000)) end,
    greatest(0,least(coalesce(p_tool_calls,0),100)),
    greatest(0,least(coalesce(p_failed_tool_calls,0),100)),
    greatest(0,least(coalesce(p_retry_count,0),20)),
    greatest(0,coalesce(p_input_tokens,0)),
    greatest(0,coalesce(p_cached_tokens,0)),
    greatest(0,coalesce(p_output_tokens,0)),
    greatest(0,coalesce(p_total_tokens,0)),
    case when p_item_count is null then null else greatest(0,least(p_item_count,10000)) end,
    case when p_byte_count is null then null else greatest(0,least(p_byte_count,1073741824)) end,
    left(nullif(btrim(coalesce(p_error_code,'')),''),160),
    left(nullif(btrim(coalesce(p_runtime_version,'')),''),120)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_my_sanad_agent_client_metric_v1(
  p_scope text,
  p_thread_id uuid default null,
  p_request_id uuid default null,
  p_status text default 'completed',
  p_transport text default null,
  p_total_latency_ms integer default null,
  p_first_progress_ms integer default null,
  p_first_answer_ms integer default null,
  p_item_count integer default null,
  p_byte_count bigint default null,
  p_app_version text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_business_id uuid;
  v_id bigint;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_scope not in ('agent_client_turn','thread_load','attachment_upload') then
    raise exception 'metric_scope_not_client_allowed' using errcode='22023';
  end if;
  if p_status not in ('completed','failed','cancelled') then raise exception 'metric_status_invalid' using errcode='22023'; end if;

  if p_thread_id is not null then
    select t.business_id into v_business_id
    from public.sanad_agent_threads t
    where t.id=p_thread_id and t.user_id=v_uid;
    if not found then raise exception 'agent_thread_not_found' using errcode='P0002'; end if;
  end if;

  insert into public.sanad_agent_performance_metrics(
    user_id,thread_id,business_id,request_id,scope,status,transport,
    total_latency_ms,first_progress_ms,first_answer_ms,item_count,byte_count,app_version
  ) values (
    v_uid,p_thread_id,v_business_id,p_request_id,p_scope,p_status,
    case when p_transport in ('sse','json','rpc','storage') then p_transport else null end,
    case when p_total_latency_ms is null then null else greatest(0,least(p_total_latency_ms,3600000)) end,
    case when p_first_progress_ms is null then null else greatest(0,least(p_first_progress_ms,3600000)) end,
    case when p_first_answer_ms is null then null else greatest(0,least(p_first_answer_ms,3600000)) end,
    case when p_item_count is null then null else greatest(0,least(p_item_count,10000)) end,
    case when p_byte_count is null then null else greatest(0,least(p_byte_count,1073741824)) end,
    left(nullif(btrim(coalesce(p_app_version,'')),''),120)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.get_my_sanad_agent_performance_v1(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_days integer := greatest(1,least(coalesce(p_days,7),90));
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  return jsonb_build_object(
    'window_days',v_days,
    'generated_at',now(),
    'scopes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'scope',scope,
        'count',count(*),
        'failure_count',count(*) filter(where status='failed'),
        'failure_rate',round((count(*) filter(where status='failed'))::numeric/nullif(count(*),0),4),
        'p50_total_ms',round(percentile_cont(0.50) within group(order by total_latency_ms) filter(where total_latency_ms is not null))::integer,
        'p95_total_ms',round(percentile_cont(0.95) within group(order by total_latency_ms) filter(where total_latency_ms is not null))::integer,
        'p50_first_progress_ms',round(percentile_cont(0.50) within group(order by first_progress_ms) filter(where first_progress_ms is not null))::integer,
        'p95_first_progress_ms',round(percentile_cont(0.95) within group(order by first_progress_ms) filter(where first_progress_ms is not null))::integer,
        'p50_first_answer_ms',round(percentile_cont(0.50) within group(order by first_answer_ms) filter(where first_answer_ms is not null))::integer,
        'p95_first_answer_ms',round(percentile_cont(0.95) within group(order by first_answer_ms) filter(where first_answer_ms is not null))::integer,
        'avg_tool_calls',round(avg(tool_calls)::numeric,2),
        'avg_failed_tool_calls',round(avg(failed_tool_calls)::numeric,2),
        'avg_retry_count',round(avg(retry_count)::numeric,2),
        'cache_ratio',round(sum(cached_tokens)::numeric/nullif(sum(input_tokens),0),4)
      ) order by scope)
      from (
        select *
        from public.sanad_agent_performance_metrics
        where user_id=v_uid
          and created_at >= now() - make_interval(days=>v_days)
      ) m
      group by user_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.record_sanad_agent_server_metric_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,bigint,text,text) from public,anon,authenticated;
grant execute on function public.record_sanad_agent_server_metric_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,bigint,text,text) to service_role;

revoke all on function public.record_my_sanad_agent_client_metric_v1(text,uuid,uuid,text,text,integer,integer,integer,integer,bigint,text) from public,anon;
grant execute on function public.record_my_sanad_agent_client_metric_v1(text,uuid,uuid,text,text,integer,integer,integer,integer,bigint,text) to authenticated;

revoke all on function public.get_my_sanad_agent_performance_v1(integer) from public,anon;
grant execute on function public.get_my_sanad_agent_performance_v1(integer) to authenticated;

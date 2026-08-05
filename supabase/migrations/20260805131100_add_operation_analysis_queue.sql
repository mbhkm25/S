begin;

create table if not exists private.operation_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','retry_scheduled','completed','failed','dead_letter','cancelled')),
  priority smallint not null default 100 check (priority between 0 and 1000),
  source text not null default 'app',
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  lease_expires_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  last_http_status integer null,
  result_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists operation_analysis_jobs_one_active_per_operation
  on private.operation_analysis_jobs(operation_id)
  where status in ('queued','processing','retry_scheduled');
create index if not exists operation_analysis_jobs_claim_idx
  on private.operation_analysis_jobs(status, available_at, priority desc, created_at)
  where status in ('queued','retry_scheduled');
create index if not exists operation_analysis_jobs_stale_idx
  on private.operation_analysis_jobs(lease_expires_at)
  where status='processing';

alter table private.operation_analysis_jobs enable row level security;
revoke all on table private.operation_analysis_jobs from public, anon, authenticated;

create or replace function public.enqueue_operation_analysis(
  p_operation_id uuid,
  p_priority smallint default 100,
  p_source text default 'app',
  p_requested_by_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_job_id uuid; v_ai_status text;
begin
  select ai_status into v_ai_status from public.operations where id=p_operation_id;
  if not found then raise exception 'operation_not_found' using errcode='P0002'; end if;
  if v_ai_status='completed' then
    select id into v_job_id from private.operation_analysis_jobs
    where operation_id=p_operation_id and status='completed'
    order by completed_at desc nulls last, created_at desc limit 1;
    return v_job_id;
  end if;
  insert into private.operation_analysis_jobs(operation_id,priority,source,requested_by_user_id)
  values(p_operation_id,greatest(0,least(1000,coalesce(p_priority,100))),left(coalesce(nullif(trim(p_source),''),'app'),80),p_requested_by_user_id)
  on conflict (operation_id) where status in ('queued','processing','retry_scheduled')
  do update set priority=greatest(private.operation_analysis_jobs.priority,excluded.priority),updated_at=now()
  returning id into v_job_id;
  update public.operations
  set ai_status=case when ai_status='running' then ai_status else 'queued' end, ai_error=null, updated_at=now()
  where id=p_operation_id and ai_status <> 'completed';
  return v_job_id;
end;
$$;

create or replace function public.claim_operation_analysis_jobs(
  p_worker_id text,
  p_limit integer default 3,
  p_lease_seconds integer default 120
) returns table(job_id uuid, operation_id uuid, attempt_count integer, max_attempts integer, source text)
language plpgsql security definer set search_path=''
as $$
begin
  if nullif(trim(p_worker_id),'') is null then raise exception 'worker_id_required'; end if;
  return query
  with candidates as (
    select j.id from private.operation_analysis_jobs j
    where j.status in ('queued','retry_scheduled') and j.available_at <= now()
    order by j.priority desc,j.available_at,j.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,3),10))
  ), claimed as (
    update private.operation_analysis_jobs j
    set status='processing',attempt_count=j.attempt_count+1,locked_at=now(),locked_by=left(p_worker_id,120),
        lease_expires_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,120),600))),
        started_at=coalesce(j.started_at,now()),updated_at=now(),last_error_code=null,last_error_message=null,last_http_status=null
    from candidates c where j.id=c.id
    returning j.id,j.operation_id,j.attempt_count,j.max_attempts,j.source
  )
  select c.id,c.operation_id,c.attempt_count,c.max_attempts,c.source from claimed c;
end;
$$;

create or replace function public.complete_operation_analysis_job(
  p_job_id uuid,p_worker_id text,p_result_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_operation_id uuid;
begin
  update private.operation_analysis_jobs
  set status='completed',completed_at=now(),lease_expires_at=null,result_metadata=coalesce(p_result_metadata,'{}'::jsonb),updated_at=now()
  where id=p_job_id and status='processing' and locked_by=p_worker_id
  returning operation_id into v_operation_id;
  return v_operation_id is not null;
end;
$$;

create or replace function public.fail_operation_analysis_job(
  p_job_id uuid,p_worker_id text,p_retryable boolean,p_error_code text,p_error_message text,p_http_status integer default null
) returns text
language plpgsql security definer set search_path=''
as $$
declare v_job private.operation_analysis_jobs%rowtype; v_next_status text; v_delay interval;
begin
  select * into v_job from private.operation_analysis_jobs
  where id=p_job_id and status='processing' and locked_by=p_worker_id for update;
  if not found then return 'not_owned'; end if;
  if p_retryable and v_job.attempt_count < v_job.max_attempts then
    v_next_status:='retry_scheduled';
    v_delay:=case v_job.attempt_count when 1 then interval '20 seconds' when 2 then interval '2 minutes' else interval '10 minutes' end
      + make_interval(secs=>floor(random()*11)::int);
  elsif p_retryable then v_next_status:='dead_letter'; v_delay:=interval '0 seconds';
  else v_next_status:='failed'; v_delay:=interval '0 seconds'; end if;
  update private.operation_analysis_jobs
  set status=v_next_status,available_at=case when v_next_status='retry_scheduled' then now()+v_delay else available_at end,
      lease_expires_at=null,last_error_code=left(coalesce(p_error_code,'unknown_error'),120),
      last_error_message=left(coalesce(p_error_message,'Unknown analysis failure'),2000),last_http_status=p_http_status,updated_at=now()
  where id=p_job_id;
  update public.operations
  set ai_status=case when v_next_status='retry_scheduled' then 'queued' else 'failed' end,
      ai_error=left(coalesce(p_error_message,'Unknown analysis failure'),2000),updated_at=now()
  where id=v_job.operation_id and ai_status <> 'completed';
  return v_next_status;
end;
$$;

create or replace function public.recover_stale_operation_analysis_jobs()
returns integer
language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  with stale as (
    update private.operation_analysis_jobs
    set status=case when attempt_count < max_attempts then 'retry_scheduled' else 'dead_letter' end,
        available_at=case when attempt_count < max_attempts then now()+interval '30 seconds' else available_at end,
        lease_expires_at=null,last_error_code='worker_lease_expired',
        last_error_message='Analysis worker lease expired before completion',updated_at=now()
    where status='processing' and lease_expires_at < now()
    returning operation_id,status
  ) select count(*) into v_count from stale;
  update public.operations o
  set ai_status='queued',ai_error='Analysis worker interrupted; retry scheduled',updated_at=now()
  where exists(select 1 from private.operation_analysis_jobs j where j.operation_id=o.id and j.status='retry_scheduled' and j.last_error_code='worker_lease_expired')
    and o.ai_status <> 'completed';
  return v_count;
end;
$$;

create or replace function public.get_operation_analysis_queue_health()
returns jsonb language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'queued',count(*) filter(where status='queued'),
    'retry_scheduled',count(*) filter(where status='retry_scheduled'),
    'processing',count(*) filter(where status='processing'),
    'failed',count(*) filter(where status='failed'),
    'dead_letter',count(*) filter(where status='dead_letter'),
    'completed_last_24h',count(*) filter(where status='completed' and completed_at>=now()-interval '24 hours'),
    'oldest_wait_seconds',coalesce(extract(epoch from now()-min(created_at) filter(where status in ('queued','retry_scheduled'))),0),
    'generated_at',now()
  ) from private.operation_analysis_jobs;
$$;

create or replace function public.validate_sanad_worker_token(p_worker_name text,p_token text)
returns boolean language sql security definer set search_path=''
as $$
  select exists(select 1 from private.sanad_worker_tokens where worker_name=p_worker_name and is_active=true and token_value=p_token);
$$;

revoke all on function public.enqueue_operation_analysis(uuid,smallint,text,uuid) from public,anon,authenticated;
revoke all on function public.claim_operation_analysis_jobs(text,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_operation_analysis_job(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer) from public,anon,authenticated;
revoke all on function public.recover_stale_operation_analysis_jobs() from public,anon,authenticated;
revoke all on function public.get_operation_analysis_queue_health() from public,anon,authenticated;
revoke all on function public.validate_sanad_worker_token(text,text) from public,anon,authenticated;
grant execute on function public.enqueue_operation_analysis(uuid,smallint,text,uuid) to service_role;
grant execute on function public.claim_operation_analysis_jobs(text,integer,integer) to service_role;
grant execute on function public.complete_operation_analysis_job(uuid,text,jsonb) to service_role;
grant execute on function public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer) to service_role;
grant execute on function public.recover_stale_operation_analysis_jobs() to service_role;
grant execute on function public.get_operation_analysis_queue_health() to service_role;
grant execute on function public.validate_sanad_worker_token(text,text) to service_role;

insert into private.sanad_worker_tokens(worker_name,token_value,is_active,created_at,updated_at)
values('operation_analysis',encode(gen_random_bytes(32),'hex'),true,now(),now())
on conflict(worker_name) do update set is_active=true,updated_at=now();

create or replace function private.dispatch_operation_analysis_jobs()
returns bigint language plpgsql security definer set search_path=''
as $$
declare v_token text; v_request bigint;
begin
  perform public.recover_stale_operation_analysis_jobs();
  select token_value into v_token from private.sanad_worker_tokens where worker_name='operation_analysis' and is_active=true;
  if v_token is null then return null; end if;
  select net.http_post(
    url:='https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-operation-analysis-worker',
    headers:=jsonb_build_object('content-type','application/json','x-sanad-worker-token',v_token),
    body:=jsonb_build_object('limit',5,'source','database_dispatch'),
    timeout_milliseconds:=55000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function private.dispatch_operation_analysis_jobs() from public,anon,authenticated;

select cron.unschedule(jobid) from cron.job where jobname='sanad-operation-analysis-dispatch';
select cron.schedule('sanad-operation-analysis-dispatch','* * * * *','select private.dispatch_operation_analysis_jobs();');

commit;

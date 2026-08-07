begin;

alter table private.whatsapp_operation_intakes
  add column if not exists first_started_at timestamptz;
alter table private.operation_analysis_jobs
  add column if not exists first_started_at timestamptz;
alter table private.operation_media_preview_jobs
  add column if not exists first_started_at timestamptz;
alter table private.operation_routing_jobs
  add column if not exists first_started_at timestamptz;
alter table public.sanad_transactional_message_outbox
  add column if not exists first_started_at timestamptz;

update private.whatsapp_operation_intakes
set first_started_at=started_at
where first_started_at is null and started_at is not null;
update private.operation_analysis_jobs
set first_started_at=started_at
where first_started_at is null and started_at is not null;
update private.operation_media_preview_jobs
set first_started_at=started_at
where first_started_at is null and started_at is not null;
update private.operation_routing_jobs
set first_started_at=started_at
where first_started_at is null and started_at is not null;
update public.sanad_transactional_message_outbox
set first_started_at=started_at
where first_started_at is null and started_at is not null;

-- All durable queues use `first_started_at` for queue wait and `started_at`
-- for the current/final attempt. This avoids mixing retry backoff into worker
-- execution time.
create or replace function private.capture_pipeline_attempt_start()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status<>'processing' then
    return new;
  end if;

  -- OLD is not assigned for INSERT triggers. Branch on TG_OP before touching it
  -- rather than relying on boolean-expression evaluation order.
  if tg_op='INSERT' then
    new.first_started_at:=coalesce(
      new.first_started_at,new.started_at,clock_timestamp()
    );
    new.started_at:=clock_timestamp();
  elsif old.status is distinct from new.status
    or old.attempt_count is distinct from new.attempt_count then
    new.first_started_at:=coalesce(
      old.first_started_at,old.started_at,new.first_started_at,clock_timestamp()
    );
    new.started_at:=clock_timestamp();
  end if;
  return new;
end;
$function$;

revoke all on function private.capture_pipeline_attempt_start()
  from public,anon,authenticated;

drop trigger if exists whatsapp_intakes_capture_attempt_start
  on private.whatsapp_operation_intakes;
create trigger whatsapp_intakes_capture_attempt_start
before insert or update of status,attempt_count
on private.whatsapp_operation_intakes
for each row execute function private.capture_pipeline_attempt_start();

drop trigger if exists analysis_jobs_capture_attempt_start
  on private.operation_analysis_jobs;
create trigger analysis_jobs_capture_attempt_start
before insert or update of status,attempt_count
on private.operation_analysis_jobs
for each row execute function private.capture_pipeline_attempt_start();

drop trigger if exists preview_jobs_capture_attempt_start
  on private.operation_media_preview_jobs;
create trigger preview_jobs_capture_attempt_start
before insert or update of status,attempt_count
on private.operation_media_preview_jobs
for each row execute function private.capture_pipeline_attempt_start();

drop trigger if exists routing_jobs_capture_attempt_start
  on private.operation_routing_jobs;
create trigger routing_jobs_capture_attempt_start
before insert or update of status,attempt_count
on private.operation_routing_jobs
for each row execute function private.capture_pipeline_attempt_start();

drop trigger if exists transactional_outbox_capture_attempt_start
  on public.sanad_transactional_message_outbox;
create trigger transactional_outbox_capture_attempt_start
before insert or update of status,attempt_count
on public.sanad_transactional_message_outbox
for each row execute function private.capture_pipeline_attempt_start();

create or replace view private.pipeline_queue_observations as
select
  'whatsapp_intake'::text queue_name,
  i.id,i.pipeline_run_id,i.status,i.attempt_count,i.max_attempts,
  i.created_at,i.available_at,i.first_started_at,i.started_at,
  case when i.status='completed' then i.completed_at
       when i.status in('failed','dead_letter') then i.updated_at end finished_at,
  false fallback_used
from private.whatsapp_operation_intakes i
union all
select
  'operation_analysis',j.id,j.pipeline_run_id,j.status,j.attempt_count,j.max_attempts,
  j.created_at,j.available_at,j.first_started_at,j.started_at,
  case when j.status='completed' then j.completed_at
       when j.status in('failed','dead_letter') then j.updated_at end,
  lower(coalesce(j.result_metadata->>'fallback_used','false'))='true'
from private.operation_analysis_jobs j
union all
select
  'operation_media_preview',j.id,j.pipeline_run_id,j.status,j.attempt_count,j.max_attempts,
  j.created_at,j.available_at,j.first_started_at,j.started_at,
  case when j.status='completed' then j.completed_at
       when j.status in('failed','dead_letter') then j.updated_at end,
  false
from private.operation_media_preview_jobs j
union all
select
  'operation_routing',j.id,j.pipeline_run_id,j.status,j.attempt_count,j.max_attempts,
  j.created_at,j.available_at,j.first_started_at,j.started_at,
  case when j.status='completed' then j.completed_at
       when j.status in('failed','dead_letter') then j.updated_at end,
  false
from private.operation_routing_jobs j
union all
select
  'transactional_messages',o.id,o.pipeline_run_id,o.status,o.attempt_count,o.max_attempts,
  o.created_at,o.next_attempt_at,o.first_started_at,o.started_at,
  case when o.status='completed' then o.completed_at
       when o.status in('failed','dead_letter') then o.updated_at end,
  false
from public.sanad_transactional_message_outbox o;

revoke all on private.pipeline_queue_observations
  from public,anon,authenticated;

create or replace function public.get_operation_pipeline_health(
  p_window_hours integer default 24
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_hours integer:=greatest(1,least(coalesce(p_window_hours,24),2160));
  v_queues jsonb;
  v_stages jsonb;
begin
  if auth.role()<>'service_role'
     and not public.is_platform_admin(auth.uid()) then
    raise exception 'pipeline_health_access_required' using errcode='42501';
  end if;

  with names(queue_name) as(
    values
      ('whatsapp_intake'::text),
      ('operation_analysis'::text),
      ('operation_media_preview'::text),
      ('operation_routing'::text),
      ('transactional_messages'::text)
  ),metrics as(
    select
      n.queue_name,
      count(o.id) filter(where o.status in('queued','retry_scheduled'))::integer queue_depth,
      count(o.id) filter(where o.status='processing')::integer processing,
      count(o.id) filter(where o.status='failed')::integer failed,
      count(o.id) filter(where o.status='dead_letter')::integer dead_letter,
      count(o.id) filter(
        where o.status='completed'
          and o.finished_at>=now()-make_interval(hours=>v_hours)
      )::integer completed_in_window,
      coalesce(extract(epoch from now()-min(o.created_at) filter(
        where o.status in('queued','retry_scheduled')
      )),0)::numeric oldest_job_age_seconds,
      round(
        count(o.id) filter(
          where o.status='completed'
            and o.finished_at>=now()-make_interval(hours=>v_hours)
        )::numeric/v_hours,
        3
      ) throughput_per_hour,
      round(
        count(o.id) filter(
          where o.status in('failed','dead_letter')
            and o.finished_at>=now()-make_interval(hours=>v_hours)
        )::numeric/nullif(count(o.id) filter(
          where o.status in('completed','failed','dead_letter')
            and o.finished_at>=now()-make_interval(hours=>v_hours)
        ),0),
        4
      ) error_rate,
      round(
        count(o.id) filter(
          where o.attempt_count>1
            and o.created_at>=now()-make_interval(hours=>v_hours)
        )::numeric/nullif(count(o.id) filter(
          where o.created_at>=now()-make_interval(hours=>v_hours)
        ),0),
        4
      ) retry_rate,
      round(
        count(o.id) filter(
          where o.fallback_used
            and o.finished_at>=now()-make_interval(hours=>v_hours)
        )::numeric/nullif(count(o.id) filter(
          where o.queue_name='operation_analysis' and o.status='completed'
            and o.finished_at>=now()-make_interval(hours=>v_hours)
        ),0),
        4
      ) fallback_rate,
      percentile_cont(0.5) within group(
        order by extract(epoch from(o.first_started_at-o.created_at))*1000
      ) filter(
        where o.first_started_at is not null
          and o.created_at>=now()-make_interval(hours=>v_hours)
      ) queue_wait_p50_ms,
      percentile_cont(0.95) within group(
        order by extract(epoch from(o.first_started_at-o.created_at))*1000
      ) filter(
        where o.first_started_at is not null
          and o.created_at>=now()-make_interval(hours=>v_hours)
      ) queue_wait_p95_ms,
      percentile_cont(0.99) within group(
        order by extract(epoch from(o.first_started_at-o.created_at))*1000
      ) filter(
        where o.first_started_at is not null
          and o.created_at>=now()-make_interval(hours=>v_hours)
      ) queue_wait_p99_ms,
      percentile_cont(0.5) within group(
        order by extract(epoch from(o.finished_at-o.started_at))*1000
      ) filter(
        where o.status='completed' and o.started_at is not null
          and o.finished_at>=now()-make_interval(hours=>v_hours)
      ) execution_p50_ms,
      percentile_cont(0.95) within group(
        order by extract(epoch from(o.finished_at-o.started_at))*1000
      ) filter(
        where o.status='completed' and o.started_at is not null
          and o.finished_at>=now()-make_interval(hours=>v_hours)
      ) execution_p95_ms,
      percentile_cont(0.99) within group(
        order by extract(epoch from(o.finished_at-o.started_at))*1000
      ) filter(
        where o.status='completed' and o.started_at is not null
          and o.finished_at>=now()-make_interval(hours=>v_hours)
      ) execution_p99_ms,
      round(
        count(o.id) filter(
          where o.pipeline_run_id is not null
            and o.created_at>=now()-make_interval(hours=>v_hours)
        )::numeric/nullif(count(o.id) filter(
          where o.created_at>=now()-make_interval(hours=>v_hours)
        ),0),
        4
      ) pipeline_run_coverage
    from names n
    left join private.pipeline_queue_observations o
      on o.queue_name=n.queue_name
    group by n.queue_name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'queue_name',m.queue_name,
    'queue_depth',m.queue_depth,
    'processing',m.processing,
    'failed',m.failed,
    'dead_letter',m.dead_letter,
    'completed_in_window',m.completed_in_window,
    'oldest_job_age_seconds',round(m.oldest_job_age_seconds,3),
    'throughput_per_hour',m.throughput_per_hour,
    'error_rate',coalesce(m.error_rate,0),
    'retry_rate',coalesce(m.retry_rate,0),
    'fallback_rate',case when m.queue_name='operation_analysis'
      then coalesce(m.fallback_rate,0) else null end,
    'queue_wait_ms',jsonb_build_object(
      'p50',round(m.queue_wait_p50_ms::numeric,2),
      'p95',round(m.queue_wait_p95_ms::numeric,2),
      'p99',round(m.queue_wait_p99_ms::numeric,2)
    ),
    'execution_ms',jsonb_build_object(
      'p50',round(m.execution_p50_ms::numeric,2),
      'p95',round(m.execution_p95_ms::numeric,2),
      'p99',round(m.execution_p99_ms::numeric,2)
    ),
    'pipeline_run_coverage',coalesce(m.pipeline_run_coverage,0),
    'duplicate_dispatch_suppressed',coalesce((
      select l.suppressed_count
      from private.pipeline_dispatch_leases l
      where l.queue_name=m.queue_name
    ),0)
  ) order by m.queue_name),'[]'::jsonb)
  into v_queues
  from metrics m;

  select coalesce(jsonb_agg(jsonb_build_object(
    'pipeline',s.pipeline,'stage',s.stage,'samples',s.samples,
    'error_rate',s.error_rate,
    'p50_ms',s.p50_ms,'p95_ms',s.p95_ms,'p99_ms',s.p99_ms
  ) order by s.pipeline,s.stage),'[]'::jsonb)
  into v_stages
  from(
    select pipeline,stage,count(*)::integer samples,
      round(count(*) filter(where status='error')::numeric/nullif(count(*),0),4) error_rate,
      percentile_cont(0.5) within group(order by duration_ms)::integer p50_ms,
      percentile_cont(0.95) within group(order by duration_ms)::integer p95_ms,
      percentile_cont(0.99) within group(order by duration_ms)::integer p99_ms
    from public.operation_pipeline_spans
    where created_at>=now()-make_interval(hours=>v_hours)
    group by pipeline,stage
  ) s;

  return jsonb_build_object(
    'generated_at',now(),
    'window_hours',v_hours,
    'queues',v_queues,
    'stages',v_stages,
    'duplicate_suppression',jsonb_build_object(
      'whatsapp_webhooks_lifetime',(
        select coalesce(sum(duplicate_claim_count),0)
        from private.whatsapp_operation_intakes
      ),
      'transactional_messages_lifetime',(
        select coalesce(sum(duplicate_suppressed_count),0)
        from public.sanad_transactional_message_outbox
      ),
      'dispatch_requests_lifetime',(
        select coalesce(sum(suppressed_count),0)
        from private.pipeline_dispatch_leases
      )
    ),
    'invariants',jsonb_build_object(
      'whatsapp_message_duplicates',(
        select count(*)-count(distinct storage_metadata->>'meta_message_id')
        from public.operations
        where source='whatsapp'
          and nullif(storage_metadata->>'meta_message_id','') is not null
      ),
      'payment_inbox_operation_duplicates',(
        select coalesce(sum(c-1),0)
        from(
          select count(*) c
          from public.business_payment_inbox
          group by operation_id
          having count(*)>1
        ) d
      )
    )
  );
end;
$function$;

revoke all on function public.get_operation_pipeline_health(integer)
  from public,anon;
grant execute on function public.get_operation_pipeline_health(integer)
  to authenticated,service_role;

create or replace function public.platform_admin_get_operation_pipeline_latency(
  p_days integer default 7,
  p_pipeline text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_days integer:=least(greatest(coalesce(p_days,7),1),90);
  v_rows jsonb;
  v_counts jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'pipeline',x.pipeline,'stage',x.stage,'samples',x.samples,
    'successes',x.successes,'errors',x.errors,
    'error_rate',x.error_rate,'average_ms',x.average_ms,
    'p50_ms',x.p50_ms,'p95_ms',x.p95_ms,'p99_ms',x.p99_ms,
    'max_ms',x.max_ms
  ) order by x.pipeline,x.stage),'[]'::jsonb)
  into v_rows
  from(
    select pipeline,stage,count(*)::integer samples,
      count(*) filter(where status='success')::integer successes,
      count(*) filter(where status='error')::integer errors,
      round(count(*) filter(where status='error')::numeric/nullif(count(*),0),4) error_rate,
      round(avg(duration_ms))::integer average_ms,
      percentile_cont(0.5) within group(order by duration_ms)::integer p50_ms,
      percentile_cont(0.95) within group(order by duration_ms)::integer p95_ms,
      percentile_cont(0.99) within group(order by duration_ms)::integer p99_ms,
      max(duration_ms)::integer max_ms
    from public.operation_pipeline_spans
    where created_at>=now()-make_interval(days=>v_days)
      and(p_pipeline is null or pipeline=p_pipeline)
    group by pipeline,stage
  ) x;
  select jsonb_build_object(
    'operations',count(distinct operation_id),
    'runs',count(distinct run_id),
    'spans',count(*),
    'fast_extractions',(
      select count(*) from public.operation_fast_routing_extractions
      where created_at>=now()-make_interval(days=>v_days)
    ),
    'window_days',v_days
  ) into v_counts
  from public.operation_pipeline_spans
  where created_at>=now()-make_interval(days=>v_days)
    and(p_pipeline is null or pipeline=p_pipeline);
  return jsonb_build_object('summary',v_counts,'stages',v_rows);
end;
$function$;

revoke all on function public.platform_admin_get_operation_pipeline_latency(integer,text)
  from public,anon;
grant execute on function public.platform_admin_get_operation_pipeline_latency(integer,text)
  to authenticated,service_role;

commit;

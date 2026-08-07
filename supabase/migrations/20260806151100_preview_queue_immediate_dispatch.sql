begin;

alter table private.operation_media_preview_jobs
  add column if not exists max_attempts integer not null default 3,
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_http_status integer;

alter table private.operation_media_preview_jobs
  drop constraint if exists operation_media_preview_jobs_status_check;

update private.operation_media_preview_jobs
set status='queued'
where status='pending';

alter table private.operation_media_preview_jobs
  add constraint operation_media_preview_jobs_status_check
  check (status in (
    'queued','processing','completed','retry_scheduled','failed','dead_letter'
  ));

alter table private.operation_media_preview_jobs
  drop constraint if exists operation_media_preview_jobs_max_attempts_check;
alter table private.operation_media_preview_jobs
  add constraint operation_media_preview_jobs_max_attempts_check
  check (max_attempts between 1 and 10);

drop index if exists private.operation_media_preview_jobs_claim_idx;
create index operation_media_preview_jobs_claim_idx
  on private.operation_media_preview_jobs(status,available_at,created_at)
  where status in ('queued','retry_scheduled');
create index if not exists operation_media_preview_jobs_lease_idx
  on private.operation_media_preview_jobs(lease_expires_at)
  where status='processing';

insert into private.sanad_worker_tokens(
  worker_name,token_value,is_active,created_at,updated_at
) values(
  'operation_media_preview',encode(gen_random_bytes(32),'hex'),true,now(),now()
)
on conflict(worker_name) do update
set is_active=true,updated_at=now();

create or replace function private.request_operation_media_preview_dispatch(
  p_reason text default 'enqueue'
) returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_request_id bigint;
  v_url text;
begin
  if not exists(
    select 1 from private.operation_media_preview_jobs
    where status in ('queued','retry_scheduled')
      and available_at<=now()
      and attempt_count<max_attempts
  ) then
    return null;
  end if;

  if not private.acquire_pipeline_dispatch_lease(
    'operation_media_preview',8,p_reason
  ) then
    return null;
  end if;

  v_url:=private.pipeline_edge_function_url(
    'sanad-operation-preview-worker'
  );
  if v_url is null then return null; end if;

  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='operation_media_preview' and is_active=true;
  if v_token is null then
    update private.pipeline_dispatch_leases
    set last_error='worker_token_missing',updated_at=now()
    where queue_name='operation_media_preview';
    return null;
  end if;

  begin
    select net.http_post(
      url:=v_url,
      headers:=jsonb_build_object(
        'content-type','application/json','x-sanad-worker-token',v_token
      ),
      body:=jsonb_build_object(
        'limit',1,'source','immediate_dispatch','reason',p_reason
      ),
      timeout_milliseconds:=55000
    ) into v_request_id;
    update private.pipeline_dispatch_leases
    set last_request_id=v_request_id,updated_at=now()
    where queue_name='operation_media_preview';
    return v_request_id;
  exception when others then
    update private.pipeline_dispatch_leases
    set last_error=left(sqlerrm,1000),lease_until=clock_timestamp(),updated_at=now()
    where queue_name='operation_media_preview';
    return null;
  end;
end;
$function$;

revoke all on function private.request_operation_media_preview_dispatch(text)
  from public,anon,authenticated;

create or replace function public.request_operation_media_preview_dispatch(
  p_reason text default 'worker_drain'
) returns bigint
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  return private.request_operation_media_preview_dispatch(p_reason);
end;
$function$;

revoke all on function public.request_operation_media_preview_dispatch(text)
  from public,anon,authenticated;
grant execute on function public.request_operation_media_preview_dispatch(text)
  to service_role;

create or replace function private.enqueue_operation_media_preview()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.preview_status='pending'
     and new.file_path is not null
     and private.operation_preview_supported_mime(new.file_mime_type) then
    insert into private.operation_media_preview_jobs(
      operation_id,source_bucket,source_path,source_mime_type,source_sha256,
      status,attempt_count,max_attempts,available_at,claimed_at,
      claim_token,lease_expires_at,started_at,completed_at,last_error,last_error_code,
      last_http_status,pipeline_run_id,updated_at
    ) values(
      new.id,coalesce(new.file_bucket,'operation-files'),new.file_path,
      lower(split_part(coalesce(new.file_mime_type,''),';',1)),new.file_sha256,
      'queued',0,3,now(),null,null,null,null,null,null,null,null,
      new.pipeline_run_id,now()
    )
    on conflict(operation_id) do update set
      source_bucket=excluded.source_bucket,
      source_path=excluded.source_path,
      source_mime_type=excluded.source_mime_type,
      source_sha256=excluded.source_sha256,
      status='queued',attempt_count=0,max_attempts=3,available_at=now(),
      claimed_at=null,claim_token=null,lease_expires_at=null,started_at=null,
      completed_at=null,
      last_error=null,last_error_code=null,last_http_status=null,
      pipeline_run_id=coalesce(excluded.pipeline_run_id,
        private.operation_media_preview_jobs.pipeline_run_id),
      updated_at=now();

    perform private.request_operation_media_preview_dispatch('operation_enqueued');
  end if;
  return new;
end;
$function$;

revoke all on function private.enqueue_operation_media_preview()
  from public,anon,authenticated;

create or replace function private.recover_stale_operation_media_preview_jobs()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_stale integer:=0;
  v_exhausted integer:=0;
begin
  with recovered as(
    update private.operation_media_preview_jobs
    set status=case when attempt_count<max_attempts
          then 'retry_scheduled' else 'dead_letter' end,
        available_at=case when attempt_count<max_attempts
          then now()+make_interval(
            secs=>least(600,15*(power(2,greatest(attempt_count-1,0)))::integer)
              +floor(random()*11)::integer
          ) else available_at end,
        claimed_at=null,claim_token=null,lease_expires_at=null,
        last_error_code='preview_lease_expired',
        last_error=coalesce(last_error,'Preview worker lease expired before completion'),
        updated_at=now()
    where status='processing' and lease_expires_at<now()
    returning operation_id,status,attempt_count,last_error
  )
  update public.operations o
  set preview_status=case when r.status='dead_letter' then 'failed' else 'pending' end,
      preview_error=r.last_error,
      preview_attempt_count=r.attempt_count,
      updated_at=now()
  from recovered r
  where o.id=r.operation_id;
  get diagnostics v_stale=row_count;

  with exhausted as(
    update private.operation_media_preview_jobs
    set status='dead_letter',last_error_code='preview_attempts_exhausted',
        last_error=coalesce(last_error,'Preview retry budget exhausted'),
        claimed_at=null,claim_token=null,lease_expires_at=null,updated_at=now()
    where status in ('queued','retry_scheduled')
      and available_at<=now()
      and attempt_count>=max_attempts
    returning operation_id,attempt_count,last_error
  )
  update public.operations o
  set preview_status='failed',preview_error=e.last_error,
      preview_attempt_count=e.attempt_count,updated_at=now()
  from exhausted e
  where o.id=e.operation_id;
  get diagnostics v_exhausted=row_count;

  return v_stale+v_exhausted;
end;
$function$;

revoke all on function private.recover_stale_operation_media_preview_jobs()
  from public,anon,authenticated;

create or replace function public.recover_stale_operation_media_preview_jobs()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  return private.recover_stale_operation_media_preview_jobs();
end;
$function$;

revoke all on function public.recover_stale_operation_media_preview_jobs()
  from public,anon,authenticated;
grant execute on function public.recover_stale_operation_media_preview_jobs()
  to service_role;

drop function if exists public.claim_operation_media_preview_jobs(text,integer);
create function public.claim_operation_media_preview_jobs(
  p_worker_token text,
  p_limit integer default 3
) returns table(
  job_id uuid,
  operation_id uuid,
  claim_token uuid,
  source_bucket text,
  source_path text,
  source_mime_type text,
  source_sha256 text,
  public_token uuid,
  attempt_count integer,
  max_attempts integer,
  pipeline_run_id uuid
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from private.sanad_worker_tokens t
    where t.worker_name='operation_media_preview'
      and t.is_active=true and t.token_value=p_worker_token
  ) then
    raise exception 'invalid_worker_token' using errcode='42501';
  end if;

  perform private.recover_stale_operation_media_preview_jobs();
  perform private.release_pipeline_dispatch_lease_on_claim(
    'operation_media_preview'
  );

  return query
  with picked as(
    select j.id
    from private.operation_media_preview_jobs j
    where j.status in ('queued','retry_scheduled')
      and j.available_at<=now()
      and j.attempt_count<j.max_attempts
    order by j.available_at,j.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,3),10))
  ),claimed as(
    update private.operation_media_preview_jobs j
    set status='processing',claim_token=gen_random_uuid(),
        attempt_count=j.attempt_count+1,
        claimed_at=now(),lease_expires_at=now()+interval '3 minutes',
        started_at=coalesce(j.started_at,now()),last_error_code=null,
        last_http_status=null,updated_at=now()
    from picked
    where j.id=picked.id
    returning j.*
  )
  select c.id,c.operation_id,c.claim_token,c.source_bucket,c.source_path,c.source_mime_type,
         c.source_sha256,o.public_token,c.attempt_count,c.max_attempts,
         c.pipeline_run_id
  from claimed c
  join public.operations o on o.id=c.operation_id;
end;
$function$;

revoke all on function public.claim_operation_media_preview_jobs(text,integer)
  from public,anon,authenticated;
grant execute on function public.claim_operation_media_preview_jobs(text,integer)
  to service_role;

create or replace function public.complete_operation_media_preview_job_v2(
  p_worker_token text,
  p_job_id uuid,
  p_claim_token uuid,
  p_preview_bucket text,
  p_preview_path text,
  p_preview_size bigint,
  p_preview_width integer,
  p_preview_height integer,
  p_pipeline_version text,
  p_crop_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job private.operation_media_preview_jobs%rowtype;
begin
  if not exists(
    select 1 from private.sanad_worker_tokens t
    where t.worker_name='operation_media_preview'
      and t.is_active=true and t.token_value=p_worker_token
  ) then
    raise exception 'invalid_worker_token' using errcode='42501';
  end if;

  select * into v_job
  from private.operation_media_preview_jobs
  where id=p_job_id and status='processing'
    and claim_token is not distinct from p_claim_token
  for update;
  if not found then return false; end if;

  update public.operations o
  set preview_status='ready',preview_bucket=p_preview_bucket,
      preview_path=p_preview_path,preview_mime_type='image/webp',
      preview_size=p_preview_size,preview_width=p_preview_width,
      preview_height=p_preview_height,preview_generated_at=now(),
      preview_error=null,preview_source_sha256=v_job.source_sha256,
      preview_attempt_count=v_job.attempt_count,
      storage_metadata=coalesce(o.storage_metadata,'{}'::jsonb)
        || jsonb_build_object(
          'preview_pipeline_version',p_pipeline_version,
          'preview_crop',coalesce(p_crop_metadata,'{}'::jsonb)
        ),
      updated_at=now()
  where o.id=v_job.operation_id
    and o.file_path=v_job.source_path
    and coalesce(o.file_bucket,'operation-files')=v_job.source_bucket
    and o.file_sha256 is not distinct from v_job.source_sha256;

  if not found then
    update private.operation_media_preview_jobs
    set status='queued',attempt_count=0,available_at=now(),claimed_at=null,
        claim_token=null,lease_expires_at=null,started_at=null,
        last_error='source_changed_before_preview_commit',
        last_error_code='source_changed',updated_at=now()
    where id=p_job_id;
    perform private.request_operation_media_preview_dispatch('preview_source_changed');
    return false;
  end if;

  update private.operation_media_preview_jobs
  set status='completed',completed_at=now(),claimed_at=null,
      claim_token=null,lease_expires_at=null,last_error=null,last_error_code=null,
      last_http_status=null,updated_at=now()
  where id=p_job_id;
  return true;
end;
$function$;

create or replace function public.complete_operation_media_preview_job(
  p_worker_token text,
  p_job_id uuid,
  p_preview_bucket text,
  p_preview_path text,
  p_preview_size bigint,
  p_preview_width integer,
  p_preview_height integer
) returns boolean
language sql
security definer
set search_path=''
as $function$
  select public.complete_operation_media_preview_job_v2(
    p_worker_token,p_job_id,null,p_preview_bucket,p_preview_path,p_preview_size,
    p_preview_width,p_preview_height,'legacy-v1','{}'::jsonb
  );
$function$;

create or replace function public.fail_operation_media_preview_job_v2(
  p_worker_token text,
  p_job_id uuid,
  p_claim_token uuid,
  p_retryable boolean,
  p_error_code text,
  p_error text,
  p_http_status integer default null
) returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job private.operation_media_preview_jobs%rowtype;
  v_next_status text;
  v_delay_seconds integer:=0;
begin
  if not exists(
    select 1 from private.sanad_worker_tokens t
    where t.worker_name='operation_media_preview'
      and t.is_active=true and t.token_value=p_worker_token
  ) then
    raise exception 'invalid_worker_token' using errcode='42501';
  end if;

  select * into v_job
  from private.operation_media_preview_jobs
  where id=p_job_id and status='processing'
    and claim_token is not distinct from p_claim_token
  for update;
  if not found then return 'not_owned'; end if;

  if p_retryable and v_job.attempt_count<v_job.max_attempts then
    v_next_status:='retry_scheduled';
    v_delay_seconds:=least(
      600,
      15*(power(2,greatest(v_job.attempt_count-1,0)))::integer
        +floor(random()*11)::integer
    );
  elsif p_retryable then
    v_next_status:='dead_letter';
  else
    v_next_status:='failed';
  end if;

  update private.operation_media_preview_jobs
  set status=v_next_status,
      available_at=case when v_next_status='retry_scheduled'
        then now()+make_interval(secs=>v_delay_seconds) else available_at end,
      claimed_at=null,claim_token=null,lease_expires_at=null,
      last_error=left(coalesce(p_error,'preview_generation_failed'),1000),
      last_error_code=left(coalesce(p_error_code,'preview_generation_failed'),120),
      last_http_status=p_http_status,updated_at=now()
  where id=p_job_id;

  update public.operations
  set preview_status=case when v_next_status='retry_scheduled'
        then 'pending' else 'failed' end,
      preview_error=left(coalesce(p_error,'preview_generation_failed'),1000),
      preview_attempt_count=v_job.attempt_count,updated_at=now()
  where id=v_job.operation_id;

  return v_next_status;
end;
$function$;

create or replace function public.fail_operation_media_preview_job(
  p_worker_token text,
  p_job_id uuid,
  p_error text
) returns text
language sql
security definer
set search_path=''
as $function$
  select public.fail_operation_media_preview_job_v2(
    p_worker_token,p_job_id,null,true,'legacy_preview_error',p_error,null
  );
$function$;

revoke all on function public.complete_operation_media_preview_job_v2(text,uuid,uuid,text,text,bigint,integer,integer,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.complete_operation_media_preview_job(text,uuid,text,text,bigint,integer,integer)
  from public,anon,authenticated;
revoke all on function public.fail_operation_media_preview_job_v2(text,uuid,uuid,boolean,text,text,integer)
  from public,anon,authenticated;
revoke all on function public.fail_operation_media_preview_job(text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.complete_operation_media_preview_job_v2(text,uuid,uuid,text,text,bigint,integer,integer,text,jsonb)
  to service_role;
grant execute on function public.complete_operation_media_preview_job(text,uuid,text,text,bigint,integer,integer)
  to service_role;
grant execute on function public.fail_operation_media_preview_job_v2(text,uuid,uuid,boolean,text,text,integer)
  to service_role;
grant execute on function public.fail_operation_media_preview_job(text,uuid,text)
  to service_role;

create or replace function public.requeue_operation_preview_v2(p_operation_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_operation public.operations%rowtype;
  v_allowed boolean:=false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  select * into v_operation from public.operations where id=p_operation_id;
  if not found then return false; end if;

  select(
    v_operation.submitted_by_user_id=v_uid
    or exists(
      select 1 from public.operation_access_logs l
      where l.operation_id=v_operation.id and l.user_id=v_uid
    )
    or exists(
      select 1 from public.operation_user_links ul
      where ul.operation_id=v_operation.id and ul.user_id=v_uid
    )
    or exists(
      select 1 from public.business_payment_inbox i
      where i.operation_id=v_operation.id
        and private.has_business_payment_permission(i.business_id,'view',v_uid)
    )
  ) into v_allowed;
  if not coalesce(v_allowed,false) then
    raise exception 'operation_access_denied' using errcode='42501';
  end if;
  if v_operation.file_path is null
     or not private.operation_preview_supported_mime(v_operation.file_mime_type) then
    return false;
  end if;

  insert into private.operation_media_preview_jobs(
    operation_id,source_bucket,source_path,source_mime_type,source_sha256,
    status,attempt_count,max_attempts,available_at,pipeline_run_id
  ) values(
    v_operation.id,coalesce(v_operation.file_bucket,'operation-files'),
    v_operation.file_path,coalesce(v_operation.file_mime_type,'application/octet-stream'),
    v_operation.file_sha256,'queued',0,3,now(),v_operation.pipeline_run_id
  )
  on conflict(operation_id) do update set
    source_bucket=excluded.source_bucket,source_path=excluded.source_path,
    source_mime_type=excluded.source_mime_type,source_sha256=excluded.source_sha256,
    status='queued',attempt_count=0,max_attempts=3,available_at=now(),
    claimed_at=null,claim_token=null,lease_expires_at=null,started_at=null,
    completed_at=null,
    last_error=null,last_error_code=null,last_http_status=null,
    pipeline_run_id=coalesce(excluded.pipeline_run_id,
      private.operation_media_preview_jobs.pipeline_run_id),updated_at=now();

  update public.operations
  set preview_status='pending',preview_error=null,preview_attempt_count=0,
      updated_at=now()
  where id=v_operation.id;
  perform private.request_operation_media_preview_dispatch('manual_requeue');
  return true;
end;
$function$;

revoke all on function public.requeue_operation_preview_v2(uuid)
  from public,anon;
grant execute on function public.requeue_operation_preview_v2(uuid)
  to authenticated;

create or replace function private.dispatch_operation_media_previews()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.recover_stale_operation_media_preview_jobs();
  return private.request_operation_media_preview_dispatch('cron_backstop');
end;
$function$;

revoke all on function private.dispatch_operation_media_previews()
  from public,anon,authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='sanad-operation-media-previews';
select cron.schedule(
  'sanad-operation-media-previews',
  '*/2 * * * *',
  'select private.dispatch_operation_media_previews();'
);

comment on column private.operation_media_preview_jobs.started_at is
'First worker start time. Queue wait is started_at-created_at; execution is completed_at-started_at.';

commit;

begin;

-- The original financial document remains the durable boundary.  This journal
-- makes every WhatsApp media intake resumable before any external download.
create table if not exists private.whatsapp_operation_intakes (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'whatsapp' check (source = 'whatsapp'),
  source_message_id text not null check (length(btrim(source_message_id)) between 1 and 512),
  pipeline_run_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','retry_scheduled','failed','dead_letter')),
  stage text not null default 'received'
    check (stage in ('received','claimed','original_stored','operation_finalized','qr_delivered','completed_without_qr')),
  sender_phone text,
  media_id text,
  declared_mime_type text,
  signature_mode text,
  webhook_envelope jsonb not null default '{}'::jsonb
    check (jsonb_typeof(webhook_envelope) = 'object'),
  claim_token uuid,
  duplicate_claim_count bigint not null default 0
    check (duplicate_claim_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  started_at timestamptz,
  storage_bucket text,
  storage_path text,
  storage_mime_type text,
  file_original_name text,
  file_size bigint check (file_size is null or file_size >= 0),
  file_sha256 text,
  media_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(media_metadata) = 'object'),
  operation_id uuid references public.operations(id) on delete set null,
  public_token uuid,
  qr_external_message_id text,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_message_id)
);

alter table private.whatsapp_operation_intakes enable row level security;
revoke all on table private.whatsapp_operation_intakes from public, anon, authenticated;

create index if not exists whatsapp_operation_intakes_due_idx
  on private.whatsapp_operation_intakes(status, available_at, created_at)
  where status in ('queued','retry_scheduled');
create index if not exists whatsapp_operation_intakes_stale_idx
  on private.whatsapp_operation_intakes(lease_expires_at)
  where status = 'processing';
create index if not exists whatsapp_operation_intakes_operation_idx
  on private.whatsapp_operation_intakes(operation_id)
  where operation_id is not null;

create table if not exists private.pipeline_dispatch_leases (
  queue_name text primary key,
  lease_until timestamptz not null default '-infinity'::timestamptz,
  last_requested_at timestamptz,
  last_request_id bigint,
  request_count bigint not null default 0,
  suppressed_count bigint not null default 0,
  last_reason text,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table private.pipeline_dispatch_leases enable row level security;
revoke all on table private.pipeline_dispatch_leases from public, anon, authenticated;

-- Centralize the environment boundary instead of scattering a production URL
-- through each queue dispatcher. Development branches can disable dispatch or
-- point it to their own Edge Functions before running integration fixtures.
create table if not exists private.pipeline_runtime_config (
  singleton boolean primary key default true check(singleton),
  environment text not null default 'production',
  edge_functions_base_url text not null
    check(edge_functions_base_url ~ '^https://[a-z0-9.-]+$'),
  dispatch_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table private.pipeline_runtime_config enable row level security;
revoke all on table private.pipeline_runtime_config from public, anon, authenticated;

insert into private.pipeline_runtime_config(
  singleton,environment,edge_functions_base_url,dispatch_enabled
) values(
  true,'production','https://hudbzlgclghlhazlduas.supabase.co',true
)
on conflict(singleton) do nothing;

-- Supported-media intake no longer calls contact registration or onboarding
-- directly. The verified production operations trigger is their single source.
-- Fail closed during deployment rather than silently dropping that behavior on
-- an environment whose historical baseline is incomplete.
do $contract$
begin
  if not exists(
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid=t.tgfoid
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where t.tgrelid='public.operations'::regclass
      and t.tgname='trg_capture_whatsapp_operation_contact'
      and not t.tgisinternal
      and t.tgenabled<>'D'
      and n.nspname='private'
      and p.proname='capture_whatsapp_operation_contact'
  ) then
    raise exception 'whatsapp_operation_contact_trigger_required';
  end if;
end;
$contract$;

create or replace function private.pipeline_edge_function_url(
  p_function_name text
) returns text
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_base_url text;
begin
  if coalesce(p_function_name,'')!~'^[a-z0-9-]{1,120}$' then
    raise exception 'invalid_pipeline_function_name';
  end if;
  select edge_functions_base_url into v_base_url
  from private.pipeline_runtime_config
  where singleton=true and dispatch_enabled=true;
  if v_base_url is null then return null; end if;
  return rtrim(v_base_url,'/')||'/functions/v1/'||p_function_name;
end;
$function$;

revoke all on function private.pipeline_edge_function_url(text)
  from public,anon,authenticated;

alter table public.operations
  add column if not exists pipeline_run_id uuid;
alter table private.operation_analysis_jobs
  add column if not exists pipeline_run_id uuid;
alter table private.operation_media_preview_jobs
  add column if not exists pipeline_run_id uuid;

alter table private.operation_analysis_jobs
  drop constraint if exists operation_analysis_jobs_status_check;
update private.operation_analysis_jobs
set status='failed',
    last_error_code=coalesce(last_error_code,'legacy_cancelled'),
    last_error_message=coalesce(
      last_error_message,'Legacy cancelled analysis job normalized to failed'
    ),
    updated_at=now()
where status='cancelled';
alter table private.operation_analysis_jobs
  add constraint operation_analysis_jobs_status_check
  check(status in(
    'queued','processing','completed','retry_scheduled','failed','dead_letter'
  ));

create index if not exists operations_pipeline_run_id_idx
  on public.operations(pipeline_run_id)
  where pipeline_run_id is not null;
create index if not exists operation_analysis_jobs_pipeline_run_id_idx
  on private.operation_analysis_jobs(pipeline_run_id)
  where pipeline_run_id is not null;
create index if not exists operation_media_preview_jobs_pipeline_run_id_idx
  on private.operation_media_preview_jobs(pipeline_run_id)
  where pipeline_run_id is not null;

-- Defense in depth: the journal owns intake idempotency, while this invariant
-- also prevents any alternate writer from creating two WhatsApp operations.
create unique index if not exists operations_whatsapp_message_id_key
  on public.operations ((storage_metadata->>'meta_message_id'))
  where source = 'whatsapp'
    and nullif(storage_metadata->>'meta_message_id','') is not null;

-- Keep lifecycle initialization transactional for every operation channel.
-- QR delivery is intentionally not recorded here: it is an external side
-- effect and is recorded only after Meta accepts the message.
create or replace function app.after_operation_insert_link_uploader()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform app.link_operation_user(
    new.id,
    new.submitted_by_user_id,
    new.submitted_by_phone,
    'uploader',
    coalesce(new.source, 'system'),
    jsonb_build_object(
      'upload_origin', new.upload_origin,
      'pipeline_run_id', new.pipeline_run_id
    )
  );

  insert into public.operation_events(
    operation_id,event_type,actor_user_id,actor_phone,metadata,source
  ) values (
    new.id,'created',new.submitted_by_user_id,new.submitted_by_phone,
    jsonb_build_object('source',new.source,'pipeline_run_id',new.pipeline_run_id),
    coalesce(new.source,'system')
  );

  if new.file_path is not null then
    insert into public.operation_events(
      operation_id,event_type,actor_user_id,actor_phone,metadata,source
    ) values (
      new.id,'file_uploaded',new.submitted_by_user_id,new.submitted_by_phone,
      jsonb_build_object(
        'bucket',new.file_bucket,
        'path',new.file_path,
        'file_name',new.file_original_name,
        'mime_type',new.file_mime_type,
        'pipeline_run_id',new.pipeline_run_id
      ),
      coalesce(new.source,'system')
    );
  end if;

  return new;
end;
$function$;

revoke all on function app.after_operation_insert_link_uploader() from public, anon, authenticated;

create or replace function private.acquire_pipeline_dispatch_lease(
  p_queue_name text,
  p_lease_seconds integer default 5,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_acquired boolean := false;
begin
  if nullif(btrim(coalesce(p_queue_name,'')),'') is null then
    raise exception 'queue_name_required';
  end if;

  insert into private.pipeline_dispatch_leases(queue_name)
  values (left(btrim(p_queue_name),120))
  on conflict (queue_name) do nothing;

  update private.pipeline_dispatch_leases
  set lease_until = clock_timestamp() + make_interval(
        secs => greatest(1,least(coalesce(p_lease_seconds,5),60))
      ),
      last_requested_at = clock_timestamp(),
      request_count = request_count + 1,
      last_reason = left(p_reason,160),
      last_error = null,
      updated_at = clock_timestamp()
  where queue_name = left(btrim(p_queue_name),120)
    and lease_until <= clock_timestamp()
  returning true into v_acquired;

  if not coalesce(v_acquired,false) then
    update private.pipeline_dispatch_leases
    set suppressed_count = suppressed_count + 1,
        updated_at = clock_timestamp()
    where queue_name = left(btrim(p_queue_name),120);
  end if;
  return coalesce(v_acquired,false);
end;
$function$;

revoke all on function private.acquire_pipeline_dispatch_lease(text,integer,text)
  from public, anon, authenticated;

create or replace function private.release_pipeline_dispatch_lease_on_claim(
  p_queue_name text
) returns void
language sql
security definer
set search_path=''
as $function$
  update private.pipeline_dispatch_leases
  set lease_until=clock_timestamp(),updated_at=clock_timestamp()
  where queue_name=left(btrim(p_queue_name),120);
$function$;

revoke all on function private.release_pipeline_dispatch_lease_on_claim(text)
  from public,anon,authenticated;

create or replace function private.request_operation_analysis_dispatch(
  p_reason text default 'enqueue'
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
  v_request_id bigint;
  v_url text;
begin
  if not exists (
    select 1 from private.operation_analysis_jobs
    where status in ('queued','retry_scheduled') and available_at <= now()
      and attempt_count<max_attempts
  ) then
    return null;
  end if;

  if not private.acquire_pipeline_dispatch_lease('operation_analysis',5,p_reason) then
    return null;
  end if;

  v_url:=private.pipeline_edge_function_url(
    'sanad-operation-analysis-worker'
  );
  if v_url is null then return null; end if;

  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name = 'operation_analysis' and is_active = true;
  if v_token is null then
    update private.pipeline_dispatch_leases
    set last_error='worker_token_missing',updated_at=now()
    where queue_name='operation_analysis';
    return null;
  end if;

  begin
    select net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-sanad-worker-token',v_token
      ),
      body := jsonb_build_object('limit',5,'source','immediate_dispatch','reason',p_reason),
      timeout_milliseconds := 55000
    ) into v_request_id;
    update private.pipeline_dispatch_leases
    set last_request_id=v_request_id,updated_at=now()
    where queue_name='operation_analysis';
    return v_request_id;
  exception when others then
    update private.pipeline_dispatch_leases
    set last_error=left(sqlerrm,1000),lease_until=clock_timestamp(),updated_at=now()
    where queue_name='operation_analysis';
    return null;
  end;
end;
$function$;

revoke all on function private.request_operation_analysis_dispatch(text)
  from public, anon, authenticated;

create or replace function private.enqueue_operation_analysis_job(
  p_operation_id uuid,
  p_priority smallint default 100,
  p_source text default 'app',
  p_requested_by_user_id uuid default null,
  p_pipeline_run_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job_id uuid;
  v_ai_status text;
begin
  select ai_status into v_ai_status
  from public.operations
  where id=p_operation_id;
  if not found then raise exception 'operation_not_found' using errcode='P0002'; end if;

  if v_ai_status='completed' then
    select id into v_job_id
    from private.operation_analysis_jobs
    where operation_id=p_operation_id and status='completed'
    order by completed_at desc nulls last,created_at desc
    limit 1;
    return v_job_id;
  end if;

  insert into private.operation_analysis_jobs(
    operation_id,priority,source,requested_by_user_id,pipeline_run_id
  ) values (
    p_operation_id,
    greatest(0,least(1000,coalesce(p_priority,100))),
    left(coalesce(nullif(btrim(p_source),''),'app'),80),
    p_requested_by_user_id,
    p_pipeline_run_id
  )
  on conflict (operation_id) where status in ('queued','processing','retry_scheduled')
  do update set
    priority=greatest(private.operation_analysis_jobs.priority,excluded.priority),
    pipeline_run_id=coalesce(private.operation_analysis_jobs.pipeline_run_id,excluded.pipeline_run_id),
    updated_at=now()
  returning id into v_job_id;

  -- operations.ai_status intentionally remains inside its established contract;
  -- "queued" is a queue state, not an operation analysis state.
  update public.operations
  set ai_status=case when ai_status='running' then ai_status else 'pending' end,
      ai_error=null,
      pipeline_run_id=coalesce(pipeline_run_id,p_pipeline_run_id),
      updated_at=now()
  where id=p_operation_id and ai_status <> 'completed';

  return v_job_id;
end;
$function$;

revoke all on function private.enqueue_operation_analysis_job(uuid,smallint,text,uuid,uuid)
  from public, anon, authenticated;

create or replace function public.enqueue_operation_analysis(
  p_operation_id uuid,
  p_priority smallint default 100,
  p_source text default 'app',
  p_requested_by_user_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  v_job_id := private.enqueue_operation_analysis_job(
    p_operation_id,p_priority,p_source,p_requested_by_user_id,null
  );
  perform private.request_operation_analysis_dispatch('enqueue:'||coalesce(p_source,'app'));
  return v_job_id;
end;
$function$;

create or replace function public.request_operation_analysis_dispatch(
  p_reason text default 'worker_drain'
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  return private.request_operation_analysis_dispatch(p_reason);
end;
$function$;

create or replace function public.fail_operation_analysis_job(
  p_job_id uuid,
  p_worker_id text,
  p_retryable boolean,
  p_error_code text,
  p_error_message text,
  p_http_status integer default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job private.operation_analysis_jobs%rowtype;
  v_next_status text;
  v_delay interval;
begin
  select * into v_job
  from private.operation_analysis_jobs
  where id=p_job_id and status='processing' and locked_by=p_worker_id
  for update;
  if not found then return 'not_owned'; end if;

  if p_retryable and v_job.attempt_count < v_job.max_attempts then
    v_next_status:='retry_scheduled';
    v_delay:=case v_job.attempt_count
      when 1 then interval '20 seconds'
      when 2 then interval '2 minutes'
      else interval '10 minutes'
    end + make_interval(secs=>floor(random()*11)::int);
  elsif p_retryable then
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
      last_error_code=left(coalesce(p_error_code,'unknown_error'),120),
      last_error_message=left(coalesce(p_error_message,'Unknown analysis failure'),2000),
      last_http_status=p_http_status,
      updated_at=now()
  where id=p_job_id;

  update public.operations
  set ai_status=case when v_next_status='retry_scheduled' then 'pending' else 'failed' end,
      ai_error=left(coalesce(p_error_message,'Unknown analysis failure'),2000),
      updated_at=now()
  where id=v_job.operation_id and ai_status <> 'completed';

  return v_next_status;
end;
$function$;

create or replace function public.recover_stale_operation_analysis_jobs()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  with stale as (
    update private.operation_analysis_jobs
    set status=case when attempt_count < max_attempts then 'retry_scheduled' else 'dead_letter' end,
        available_at=case when attempt_count < max_attempts then now()+interval '30 seconds' else available_at end,
        lease_expires_at=null,
        last_error_code='worker_lease_expired',
        last_error_message='Analysis worker lease expired before completion',
        updated_at=now()
    where status='processing' and lease_expires_at < now()
    returning operation_id,status
  ) select count(*) into v_count from stale;

  update public.operations o
  set ai_status='pending',
      ai_error='Analysis worker interrupted; retry scheduled',
      updated_at=now()
  where exists (
    select 1 from private.operation_analysis_jobs j
    where j.operation_id=o.id
      and j.status='retry_scheduled'
      and j.last_error_code='worker_lease_expired'
  ) and o.ai_status <> 'completed';

  return v_count;
end;
$function$;

create or replace function public.claim_operation_analysis_jobs(
  p_worker_id text,
  p_limit integer default 3,
  p_lease_seconds integer default 120
) returns table(
  job_id uuid,
  operation_id uuid,
  attempt_count integer,
  max_attempts integer,
  source text
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if nullif(btrim(coalesce(p_worker_id,'')),'') is null then
    raise exception 'worker_id_required';
  end if;

  perform private.release_pipeline_dispatch_lease_on_claim('operation_analysis');

  update private.operation_analysis_jobs as j
  set status='dead_letter',lease_expires_at=null,
      last_error_code='analysis_attempts_exhausted',
      last_error_message=coalesce(
        j.last_error_message,'Analysis retry budget exhausted before claim'
      ),
      updated_at=now()
  where j.status in('queued','retry_scheduled')
    and j.available_at<=now() and j.attempt_count>=j.max_attempts;

  return query
  with candidates as(
    select j.id
    from private.operation_analysis_jobs j
    where j.status in('queued','retry_scheduled')
      and j.available_at<=now() and j.attempt_count<j.max_attempts
    order by j.priority desc,j.available_at,j.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,3),10))
  ),claimed as(
    update private.operation_analysis_jobs j
    set status='processing',attempt_count=j.attempt_count+1,
        locked_at=now(),locked_by=left(btrim(p_worker_id),120),
        lease_expires_at=now()+make_interval(
          secs=>greatest(30,least(coalesce(p_lease_seconds,120),600))
        ),
        started_at=now(),last_error_code=null,last_error_message=null,
        last_http_status=null,updated_at=now()
    from candidates c
    where j.id=c.id
    returning j.id,j.operation_id,j.attempt_count,j.max_attempts,j.source
  )
  select c.id,c.operation_id,c.attempt_count,c.max_attempts,c.source
  from claimed c;
end;
$function$;

revoke all on function public.enqueue_operation_analysis(uuid,smallint,text,uuid)
  from public, anon, authenticated;
revoke all on function public.request_operation_analysis_dispatch(text)
  from public, anon, authenticated;
revoke all on function public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.claim_operation_analysis_jobs(text,integer,integer)
  from public, anon, authenticated;
revoke all on function public.recover_stale_operation_analysis_jobs()
  from public, anon, authenticated;
grant execute on function public.enqueue_operation_analysis(uuid,smallint,text,uuid)
  to service_role;
grant execute on function public.request_operation_analysis_dispatch(text)
  to service_role;
grant execute on function public.fail_operation_analysis_job(uuid,text,boolean,text,text,integer)
  to service_role;
grant execute on function public.claim_operation_analysis_jobs(text,integer,integer)
  to service_role;
grant execute on function public.recover_stale_operation_analysis_jobs()
  to service_role;

create or replace function public.claim_whatsapp_operation_intake(
  p_message_id text,
  p_pipeline_run_id uuid,
  p_sender_phone text,
  p_media_id text,
  p_declared_mime_type text,
  p_signature_mode text,
  p_webhook_envelope jsonb,
  p_lease_seconds integer default 180
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_message_id text := btrim(coalesce(p_message_id,''));
  v_row private.whatsapp_operation_intakes%rowtype;
  v_operation public.operations%rowtype;
  v_claim_token uuid;
  v_lease_seconds integer := greatest(60,least(coalesce(p_lease_seconds,180),600));
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if length(v_message_id) < 1 or length(v_message_id) > 512 then
    raise exception 'invalid_whatsapp_message_id';
  end if;
  if p_pipeline_run_id is null then raise exception 'pipeline_run_id_required'; end if;
  if jsonb_typeof(coalesce(p_webhook_envelope,'{}'::jsonb)) <> 'object' then
    raise exception 'invalid_webhook_envelope';
  end if;

  select * into v_operation
  from public.operations o
  where o.source='whatsapp'
    and o.storage_metadata->>'meta_message_id'=v_message_id
  order by o.created_at
  limit 1;

  if found then
    insert into private.whatsapp_operation_intakes(
      source_message_id,pipeline_run_id,status,stage,sender_phone,media_id,
      declared_mime_type,signature_mode,webhook_envelope,attempt_count,
      duplicate_claim_count,
      storage_bucket,storage_path,storage_mime_type,file_original_name,file_size,
      file_sha256,operation_id,public_token,completed_at,created_at,updated_at
    ) values (
      v_message_id,p_pipeline_run_id,'completed','completed_without_qr',
      regexp_replace(coalesce(p_sender_phone,''),'\D','','g'),p_media_id,
      p_declared_mime_type,p_signature_mode,coalesce(p_webhook_envelope,'{}'::jsonb),0,1,
      v_operation.file_bucket,v_operation.file_path,v_operation.file_mime_type,
      v_operation.file_original_name,v_operation.file_size,v_operation.file_sha256,
      v_operation.id,v_operation.public_token,now(),v_operation.created_at,now()
    ) on conflict (source,source_message_id) do update set
      status='completed',
      stage=case
        when private.whatsapp_operation_intakes.stage='qr_delivered'
          then 'qr_delivered'
        else 'completed_without_qr'
      end,
      storage_bucket=excluded.storage_bucket,
      storage_path=excluded.storage_path,
      storage_mime_type=excluded.storage_mime_type,
      file_original_name=excluded.file_original_name,
      file_size=excluded.file_size,
      file_sha256=excluded.file_sha256,
      operation_id=excluded.operation_id,
      public_token=excluded.public_token,
      duplicate_claim_count=private.whatsapp_operation_intakes.duplicate_claim_count+1,
      claim_token=null,
      lease_expires_at=null,
      completed_at=coalesce(
        private.whatsapp_operation_intakes.completed_at,excluded.completed_at
      ),
      updated_at=now();

    select * into v_row
    from private.whatsapp_operation_intakes
    where source='whatsapp' and source_message_id=v_message_id;
    return jsonb_build_object(
      'claimed',false,'duplicate',true,'reason','operation_already_exists',
      'status',v_row.status,'stage',v_row.stage,'pipeline_run_id',v_row.pipeline_run_id,
      'operation_id',v_row.operation_id,'public_token',v_row.public_token
    );
  end if;

  v_claim_token:=gen_random_uuid();
  insert into private.whatsapp_operation_intakes(
    source_message_id,pipeline_run_id,status,stage,sender_phone,media_id,
    declared_mime_type,signature_mode,webhook_envelope,claim_token,
    attempt_count,available_at,lease_expires_at,started_at
  ) values (
    v_message_id,p_pipeline_run_id,'processing','claimed',
    regexp_replace(coalesce(p_sender_phone,''),'\D','','g'),p_media_id,
    lower(split_part(coalesce(p_declared_mime_type,''),';',1)),p_signature_mode,
    coalesce(p_webhook_envelope,'{}'::jsonb),v_claim_token,1,now(),
    now()+make_interval(secs=>v_lease_seconds),now()
  ) on conflict (source,source_message_id) do nothing
  returning * into v_row;

  if v_row.id is not null then
    return jsonb_build_object(
      'claimed',true,'duplicate',false,'claim_token',v_row.claim_token,
      'status',v_row.status,'stage',v_row.stage,'pipeline_run_id',v_row.pipeline_run_id,
      'attempt_count',v_row.attempt_count,'webhook_envelope',v_row.webhook_envelope,
      'sender_phone',v_row.sender_phone,'media_id',v_row.media_id,
      'declared_mime_type',v_row.declared_mime_type
    );
  end if;

  select * into v_row
  from private.whatsapp_operation_intakes
  where source='whatsapp' and source_message_id=v_message_id
  for update;

  if v_row.status='completed' then
    update private.whatsapp_operation_intakes
    set duplicate_claim_count=duplicate_claim_count+1,updated_at=now()
    where id=v_row.id;
    return jsonb_build_object(
      'claimed',false,'duplicate',true,'reason','already_completed',
      'status',v_row.status,'stage',v_row.stage,'pipeline_run_id',v_row.pipeline_run_id,
      'operation_id',v_row.operation_id,'public_token',v_row.public_token
    );
  end if;
  if v_row.status='processing' and v_row.lease_expires_at > now() then
    update private.whatsapp_operation_intakes
    set duplicate_claim_count=duplicate_claim_count+1,updated_at=now()
    where id=v_row.id;
    return jsonb_build_object(
      'claimed',false,'duplicate',true,'reason','already_processing',
      'status',v_row.status,'stage',v_row.stage,'pipeline_run_id',v_row.pipeline_run_id,
      'operation_id',v_row.operation_id,'public_token',v_row.public_token
    );
  end if;
  if v_row.status in ('failed','dead_letter') then
    update private.whatsapp_operation_intakes
    set duplicate_claim_count=duplicate_claim_count+1,updated_at=now()
    where id=v_row.id;
    return jsonb_build_object(
      'claimed',false,'duplicate',true,'reason','terminal_failure',
      'status',v_row.status,'stage',v_row.stage,'pipeline_run_id',v_row.pipeline_run_id,
      'operation_id',v_row.operation_id,'public_token',v_row.public_token
    );
  end if;
  if v_row.available_at > now() then
    update private.whatsapp_operation_intakes
    set duplicate_claim_count=duplicate_claim_count+1,updated_at=now()
    where id=v_row.id;
    return jsonb_build_object(
      'claimed',false,'duplicate',true,'reason','retry_not_due',
      'status',v_row.status,'stage',v_row.stage,
      'retry_after_seconds',greatest(1,ceil(extract(epoch from v_row.available_at-now()))::integer),
      'pipeline_run_id',v_row.pipeline_run_id,'operation_id',v_row.operation_id,
      'public_token',v_row.public_token
    );
  end if;
  if v_row.attempt_count >= v_row.max_attempts then
    update private.whatsapp_operation_intakes
    set status='dead_letter',claim_token=null,lease_expires_at=null,
        last_error_code='intake_attempts_exhausted',
        duplicate_claim_count=duplicate_claim_count+1,updated_at=now()
    where id=v_row.id
    returning * into v_row;
    return jsonb_build_object(
      'claimed',false,'duplicate',true,'reason','attempts_exhausted',
      'status',v_row.status,'pipeline_run_id',v_row.pipeline_run_id,
      'operation_id',v_row.operation_id,'public_token',v_row.public_token
    );
  end if;

  v_claim_token:=gen_random_uuid();
  update private.whatsapp_operation_intakes
  set status='processing',
      claim_token=v_claim_token,
      attempt_count=attempt_count+1,
      lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
      sender_phone=coalesce(nullif(regexp_replace(coalesce(p_sender_phone,''),'\D','','g'),''),sender_phone),
      media_id=coalesce(nullif(p_media_id,''),media_id),
      declared_mime_type=coalesce(nullif(lower(split_part(coalesce(p_declared_mime_type,''),';',1)),''),declared_mime_type),
      signature_mode=coalesce(nullif(p_signature_mode,''),signature_mode),
      webhook_envelope=case
        when p_webhook_envelope is null or p_webhook_envelope='{}'::jsonb then webhook_envelope
        else p_webhook_envelope
      end,
      last_error_code=null,last_error_message=null,updated_at=now()
  where id=v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'claimed',true,'duplicate',true,'claim_token',v_row.claim_token,
    'status',v_row.status,'stage',v_row.stage,'pipeline_run_id',v_row.pipeline_run_id,
    'attempt_count',v_row.attempt_count,'webhook_envelope',v_row.webhook_envelope,
    'storage_bucket',v_row.storage_bucket,'storage_path',v_row.storage_path,
    'storage_mime_type',v_row.storage_mime_type,'file_original_name',v_row.file_original_name,
    'file_size',v_row.file_size,'file_sha256',v_row.file_sha256,
    'media_metadata',v_row.media_metadata,'operation_id',v_row.operation_id,
    'public_token',v_row.public_token
  );
end;
$function$;

create or replace function public.claim_next_whatsapp_operation_intake(
  p_worker_token text,
  p_lease_seconds integer default 180
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row private.whatsapp_operation_intakes%rowtype;
  v_claim_token uuid := gen_random_uuid();
  v_lease_seconds integer := greatest(60,least(coalesce(p_lease_seconds,180),600));
begin
  if not exists (
    select 1 from private.sanad_worker_tokens
    where worker_name='whatsapp_intake' and is_active=true and token_value=p_worker_token
  ) then
    raise exception 'invalid_worker_token' using errcode='42501';
  end if;

  perform private.release_pipeline_dispatch_lease_on_claim('whatsapp_intake');

  update private.whatsapp_operation_intakes
  set status='dead_letter',claim_token=null,lease_expires_at=null,
      last_error_code='intake_attempts_exhausted',
      last_error_message='WhatsApp intake retry budget exhausted',updated_at=now()
  where status in ('queued','retry_scheduled')
    and available_at <= now()
    and attempt_count >= max_attempts;

  with candidate as (
    select id
    from private.whatsapp_operation_intakes
    where status in ('queued','retry_scheduled')
      and available_at <= now()
      and attempt_count < max_attempts
    order by available_at,created_at
    for update skip locked
    limit 1
  )
  update private.whatsapp_operation_intakes i
  set status='processing',claim_token=v_claim_token,attempt_count=i.attempt_count+1,
      lease_expires_at=now()+make_interval(secs=>v_lease_seconds),
      started_at=coalesce(i.started_at,now()),last_error_code=null,last_error_message=null,
      updated_at=now()
  from candidate c
  where i.id=c.id
  returning i.* into v_row;

  if v_row.id is null then return jsonb_build_object('claimed',false); end if;
  return jsonb_build_object(
    'claimed',true,'duplicate',true,'claim_token',v_row.claim_token,
    'source_message_id',v_row.source_message_id,'status',v_row.status,'stage',v_row.stage,
    'pipeline_run_id',v_row.pipeline_run_id,'attempt_count',v_row.attempt_count,
    'webhook_envelope',v_row.webhook_envelope,'sender_phone',v_row.sender_phone,
    'media_id',v_row.media_id,'declared_mime_type',v_row.declared_mime_type,
    'signature_mode',v_row.signature_mode,
    'storage_bucket',v_row.storage_bucket,'storage_path',v_row.storage_path,
    'storage_mime_type',v_row.storage_mime_type,'file_original_name',v_row.file_original_name,
    'file_size',v_row.file_size,'file_sha256',v_row.file_sha256,
    'media_metadata',v_row.media_metadata,'operation_id',v_row.operation_id,
    'public_token',v_row.public_token
  );
end;
$function$;

create or replace function public.record_whatsapp_operation_intake_storage(
  p_message_id text,
  p_claim_token uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_storage_mime_type text,
  p_file_original_name text,
  p_file_size bigint,
  p_file_sha256 text,
  p_media_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(p_storage_bucket,'')),'') is null
     or nullif(btrim(coalesce(p_storage_path,'')),'') is null then
    raise exception 'storage_location_required';
  end if;
  if jsonb_typeof(coalesce(p_media_metadata,'{}'::jsonb)) <> 'object' then
    raise exception 'invalid_media_metadata';
  end if;

  update private.whatsapp_operation_intakes
  set stage='original_stored',storage_bucket=p_storage_bucket,storage_path=p_storage_path,
      storage_mime_type=lower(split_part(coalesce(p_storage_mime_type,''),';',1)),
      file_original_name=p_file_original_name,file_size=p_file_size,file_sha256=p_file_sha256,
      media_metadata=coalesce(p_media_metadata,'{}'::jsonb),
      lease_expires_at=now()+interval '3 minutes',updated_at=now()
  where source='whatsapp' and source_message_id=btrim(p_message_id)
    and status='processing' and claim_token=p_claim_token
  returning id into v_id;
  return v_id is not null;
end;
$function$;

create or replace function public.finalize_whatsapp_operation_intake(
  p_message_id text,
  p_claim_token uuid,
  p_operation jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_intake private.whatsapp_operation_intakes%rowtype;
  v_operation public.operations%rowtype;
  v_public_token uuid;
  v_analysis_job_id uuid;
  v_preview_job_id uuid;
  v_storage_metadata jsonb;
  v_client_metadata jsonb;
  v_idempotent boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_operation,'{}'::jsonb)) <> 'object' then
    raise exception 'invalid_operation_payload';
  end if;

  select * into v_intake
  from private.whatsapp_operation_intakes
  where source='whatsapp' and source_message_id=btrim(p_message_id)
  for update;
  if not found then raise exception 'intake_not_found' using errcode='P0002'; end if;
  if v_intake.status <> 'processing' or v_intake.claim_token is distinct from p_claim_token then
    raise exception 'stale_intake_claim' using errcode='40001';
  end if;
  if v_intake.operation_id is not null then
    select * into v_operation from public.operations where id=v_intake.operation_id;
    return jsonb_build_object(
      'ok',true,'idempotent',true,'operation_id',v_operation.id,
      'public_token',v_operation.public_token,'pipeline_run_id',v_intake.pipeline_run_id
    );
  end if;
  if v_intake.stage <> 'original_stored' or v_intake.storage_path is null then
    raise exception 'original_not_stored';
  end if;

  begin
    v_public_token:=(p_operation->>'public_token')::uuid;
  exception when others then
    raise exception 'invalid_public_token';
  end;
  if v_public_token is null then raise exception 'public_token_required'; end if;

  v_storage_metadata:=coalesce(p_operation->'storage_metadata','{}'::jsonb)
    || jsonb_build_object(
      'meta_media_id',v_intake.media_id,
      'meta_message_id',v_intake.source_message_id,
      'whatsapp_from',v_intake.sender_phone,
      'meta_signature_mode',v_intake.signature_mode,
      'intake_pipeline_run_id',v_intake.pipeline_run_id
    );
  v_client_metadata:=coalesce(p_operation->'client_upload_metadata','{}'::jsonb)
    || jsonb_build_object(
      'source','whatsapp','message_id',v_intake.source_message_id,
      'sender_phone',v_intake.sender_phone,'pipeline_run_id',v_intake.pipeline_run_id
    );

  begin
    insert into public.operations(
      public_token,token_status,source,upload_origin,submitted_by_user_id,
      submitted_by_phone,submitted_by_name,file_bucket,file_path,file_original_name,
      file_mime_type,file_size,file_sha256,storage_metadata,original_file_status,
      qr_status,status,ai_status,raw_webhook_json,client_upload_metadata,pipeline_run_id
    ) values (
      v_public_token,'active','whatsapp','whatsapp',null,
      v_intake.sender_phone,nullif(p_operation->>'submitted_by_name',''),
      v_intake.storage_bucket,v_intake.storage_path,v_intake.file_original_name,
      v_intake.storage_mime_type,v_intake.file_size,v_intake.file_sha256,
      v_storage_metadata,'stored','created','stored','pending',
      v_intake.webhook_envelope,v_client_metadata,v_intake.pipeline_run_id
    ) returning * into v_operation;
  exception when unique_violation then
    select * into v_operation
    from public.operations o
    where o.source='whatsapp'
      and o.storage_metadata->>'meta_message_id'=btrim(p_message_id)
    order by o.created_at
    limit 1;
    if v_operation.id is null then raise; end if;
    v_idempotent:=true;
  end;

  v_analysis_job_id:=private.enqueue_operation_analysis_job(
    v_operation.id,100::smallint,'whatsapp_intake',null,v_intake.pipeline_run_id
  );

  update private.operation_media_preview_jobs
  set pipeline_run_id=coalesce(pipeline_run_id,v_intake.pipeline_run_id),updated_at=now()
  where operation_id=v_operation.id
  returning id into v_preview_job_id;

  update private.whatsapp_operation_intakes
  set stage='operation_finalized',operation_id=v_operation.id,public_token=v_operation.public_token,
      lease_expires_at=now()+interval '3 minutes',updated_at=now()
  where id=v_intake.id;

  perform private.request_operation_analysis_dispatch('whatsapp_operation_finalized');

  return jsonb_build_object(
    'ok',true,'idempotent',v_idempotent,'operation_id',v_operation.id,
    'public_token',v_operation.public_token,'pipeline_run_id',v_intake.pipeline_run_id,
    'analysis_job_id',v_analysis_job_id,'preview_job_id',v_preview_job_id,
    'file_bucket',v_operation.file_bucket,'file_path',v_operation.file_path,
    'status',v_operation.status,'ai_status',v_operation.ai_status
  );
end;
$function$;

drop function if exists public.complete_whatsapp_operation_intake(text,uuid,text,text);

create or replace function public.complete_whatsapp_operation_intake(
  p_message_id text,
  p_claim_token uuid,
  p_qr_delivery_status text,
  p_qr_external_message_id text default null,
  p_qr_metadata jsonb default '{}'::jsonb,
  p_spans jsonb default '[]'::jsonb
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_intake private.whatsapp_operation_intakes%rowtype;
  v_span jsonb;
  v_stage text;
  v_status text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_duration_ms integer;
  v_metadata jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_qr_delivery_status not in ('sent','skipped') then
    raise exception 'invalid_qr_delivery_status';
  end if;
  update private.whatsapp_operation_intakes
  set status='completed',
      stage=case when p_qr_delivery_status='sent' then 'qr_delivered' else 'completed_without_qr' end,
      qr_external_message_id=coalesce(p_qr_external_message_id,qr_external_message_id),
      claim_token=null,lease_expires_at=null,last_error_code=null,last_error_message=null,
      completed_at=now(),updated_at=now()
  where source='whatsapp' and source_message_id=btrim(p_message_id)
    and status='processing' and claim_token=p_claim_token and operation_id is not null
  returning * into v_intake;

  if v_intake.id is null then
    return false;
  end if;

  if p_qr_delivery_status='sent' then
    begin
      insert into public.operation_events(operation_id,event_type,source,metadata)
      values(
        v_intake.operation_id,
        'qr_created',
        'whatsapp',
        case when jsonb_typeof(p_qr_metadata)='object'
          then coalesce(p_qr_metadata,'{}'::jsonb)
          else '{}'::jsonb
        end || jsonb_build_object(
          'pipeline_run_id',v_intake.pipeline_run_id,
          'meta_message_id',p_qr_external_message_id
        )
      );
    exception when others then
      raise warning 'whatsapp_intake_qr_event_write_failed: %',sqlerrm;
    end;
  end if;

  begin
    for v_span in
      select value
      from jsonb_array_elements(
        case when jsonb_typeof(p_spans)='array'
          then coalesce(p_spans,'[]'::jsonb)
          else '[]'::jsonb
        end
      )
    loop
      v_stage:=nullif(btrim(v_span->>'stage'),'');
      v_status:=nullif(btrim(v_span->>'status'),'');
      if v_stage is null
         or v_stage<>all(array[
           'media_lookup_download','storage_upload','operation_create',
           'qr_delivery','intake_total'
         ])
         or v_status is null
         or v_status<>all(array['success','error','skipped']) then
        continue;
      end if;

      begin
        v_started_at:=(v_span->>'started_at')::timestamptz;
        v_completed_at:=case when v_stage='intake_total'
          then greatest(
            (v_span->>'completed_at')::timestamptz,
            clock_timestamp()
          )
          else (v_span->>'completed_at')::timestamptz
        end;
        if v_completed_at<v_started_at then
          continue;
        end if;
        v_duration_ms:=greatest(
          0,
          least(
            3600000,
            case when v_stage='intake_total'
              then round(extract(epoch from (v_completed_at-v_started_at))*1000)::integer
              else coalesce(
                nullif(v_span->>'duration_ms','')::integer,
                round(extract(epoch from (v_completed_at-v_started_at))*1000)::integer
              )
            end
          )
        );
        v_metadata:=case when jsonb_typeof(v_span->'metadata')='object'
          then v_span->'metadata'
          else '{}'::jsonb
        end;

        insert into public.operation_pipeline_spans(
          operation_id,run_id,pipeline,stage,status,function_name,
          started_at,completed_at,duration_ms,metadata
        ) values (
          v_intake.operation_id,v_intake.pipeline_run_id,'whatsapp_intake',
          v_stage,v_status,'sanad-v3-whatsapp-intake',v_started_at,
          v_completed_at,v_duration_ms,v_metadata
        )
        on conflict(operation_id,run_id,pipeline,stage) do update
        set status=excluded.status,
            function_name=excluded.function_name,
            started_at=excluded.started_at,
            completed_at=excluded.completed_at,
            duration_ms=excluded.duration_ms,
            metadata=excluded.metadata;
      exception when others then
        raise warning 'whatsapp_intake_span_write_failed stage=%: %',v_stage,sqlerrm;
      end;
    end loop;
  exception when others then
    raise warning 'whatsapp_intake_span_batch_failed: %',sqlerrm;
  end;

  return true;
end;
$function$;

create or replace function public.fail_whatsapp_operation_intake(
  p_message_id text,
  p_claim_token uuid,
  p_retryable boolean,
  p_error_code text,
  p_error_message text
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row private.whatsapp_operation_intakes%rowtype;
  v_next_status text;
  v_delay_seconds integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  select * into v_row
  from private.whatsapp_operation_intakes
  where source='whatsapp' and source_message_id=btrim(p_message_id)
    and status='processing' and claim_token=p_claim_token
  for update;
  if not found then return 'not_owned'; end if;

  if p_retryable and v_row.attempt_count < v_row.max_attempts then
    v_next_status:='retry_scheduled';
    v_delay_seconds:=least(300,(5*power(2,greatest(v_row.attempt_count-1,0)))::integer)
      + floor(random()*6)::integer;
  elsif p_retryable then
    v_next_status:='dead_letter';
    v_delay_seconds:=0;
  else
    v_next_status:='failed';
    v_delay_seconds:=0;
  end if;

  update private.whatsapp_operation_intakes
  set status=v_next_status,
      available_at=case when v_next_status='retry_scheduled'
        then now()+make_interval(secs=>v_delay_seconds) else available_at end,
      claim_token=null,lease_expires_at=null,
      last_error_code=left(coalesce(p_error_code,'intake_error'),120),
      last_error_message=left(coalesce(p_error_message,'Unknown intake error'),2000),
      updated_at=now()
  where id=v_row.id;
  return v_next_status;
end;
$function$;

create or replace function public.recover_stale_whatsapp_operation_intakes()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
  v_exhausted integer;
begin
  update private.whatsapp_operation_intakes
  set status='dead_letter',claim_token=null,lease_expires_at=null,
      last_error_code='intake_attempts_exhausted',
      last_error_message='WhatsApp intake retry budget exhausted',updated_at=now()
  where status in ('queued','retry_scheduled')
    and available_at <= now()
    and attempt_count >= max_attempts;
  get diagnostics v_exhausted = row_count;

  with recovered as (
    update private.whatsapp_operation_intakes
    set status=case when attempt_count < max_attempts then 'retry_scheduled' else 'dead_letter' end,
        available_at=case when attempt_count < max_attempts
          then now()+make_interval(secs=>5+floor(random()*6)::integer)
          else available_at end,
        claim_token=null,lease_expires_at=null,
        last_error_code='intake_lease_expired',
        last_error_message='WhatsApp intake lease expired before completion',
        updated_at=now()
    where status='processing' and lease_expires_at < now()
    returning id
  ) select count(*) into v_count from recovered;
  return v_count + v_exhausted;
end;
$function$;

create or replace function private.request_whatsapp_operation_intake_dispatch(
  p_reason text default 'recovery'
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
  v_request_id bigint;
  v_url text;
begin
  if not exists (
    select 1 from private.whatsapp_operation_intakes
    where status in ('queued','retry_scheduled')
      and available_at <= now()
      and attempt_count < max_attempts
  ) then
    return null;
  end if;
  if not private.acquire_pipeline_dispatch_lease('whatsapp_intake',5,p_reason) then
    return null;
  end if;
  v_url:=private.pipeline_edge_function_url('sanad-v3-whatsapp-intake');
  if v_url is null then return null; end if;
  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='whatsapp_intake' and is_active=true;
  if v_token is null then
    update private.pipeline_dispatch_leases
    set last_error='worker_token_missing',updated_at=now()
    where queue_name='whatsapp_intake';
    return null;
  end if;
  begin
    select net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'content-type','application/json','x-sanad-worker-token',v_token
      ),
      body := jsonb_build_object('mode','recovery','source','database_dispatch','reason',p_reason),
      timeout_milliseconds := 55000
    ) into v_request_id;
    update private.pipeline_dispatch_leases
    set last_request_id=v_request_id,updated_at=now()
    where queue_name='whatsapp_intake';
    return v_request_id;
  exception when others then
    update private.pipeline_dispatch_leases
    set last_error=left(sqlerrm,1000),lease_until=clock_timestamp(),updated_at=now()
    where queue_name='whatsapp_intake';
    return null;
  end;
end;
$function$;

create or replace function public.request_whatsapp_operation_intake_dispatch(
  p_reason text default 'worker_drain'
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  return private.request_whatsapp_operation_intake_dispatch(p_reason);
end;
$function$;

create or replace function private.dispatch_whatsapp_operation_intake_recovery()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.recover_stale_whatsapp_operation_intakes();
  return private.request_whatsapp_operation_intake_dispatch('cron_backstop');
end;
$function$;

revoke all on function public.claim_whatsapp_operation_intake(text,uuid,text,text,text,text,jsonb,integer)
  from public, anon, authenticated;
revoke all on function public.claim_next_whatsapp_operation_intake(text,integer)
  from public, anon, authenticated;
revoke all on function public.record_whatsapp_operation_intake_storage(text,uuid,text,text,text,text,bigint,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_whatsapp_operation_intake(text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_whatsapp_operation_intake(text,uuid,text,text,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_whatsapp_operation_intake(text,uuid,boolean,text,text)
  from public, anon, authenticated;
revoke all on function public.recover_stale_whatsapp_operation_intakes()
  from public, anon, authenticated;
revoke all on function public.request_whatsapp_operation_intake_dispatch(text)
  from public, anon, authenticated;
revoke all on function private.request_whatsapp_operation_intake_dispatch(text)
  from public, anon, authenticated;
revoke all on function private.dispatch_whatsapp_operation_intake_recovery()
  from public, anon, authenticated;

grant execute on function public.claim_whatsapp_operation_intake(text,uuid,text,text,text,text,jsonb,integer)
  to service_role;
grant execute on function public.claim_next_whatsapp_operation_intake(text,integer)
  to service_role;
grant execute on function public.record_whatsapp_operation_intake_storage(text,uuid,text,text,text,text,bigint,text,jsonb)
  to service_role;
grant execute on function public.finalize_whatsapp_operation_intake(text,uuid,jsonb)
  to service_role;
grant execute on function public.complete_whatsapp_operation_intake(text,uuid,text,text,jsonb,jsonb)
  to service_role;
grant execute on function public.fail_whatsapp_operation_intake(text,uuid,boolean,text,text)
  to service_role;
grant execute on function public.recover_stale_whatsapp_operation_intakes()
  to service_role;
grant execute on function public.request_whatsapp_operation_intake_dispatch(text)
  to service_role;

insert into private.sanad_worker_tokens(worker_name,token_value,is_active,created_at,updated_at)
values ('whatsapp_intake',encode(gen_random_bytes(32),'hex'),true,now(),now())
on conflict (worker_name) do update
set is_active=true,updated_at=now();

create or replace function private.dispatch_operation_analysis_jobs()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.recover_stale_operation_analysis_jobs();
  return private.request_operation_analysis_dispatch('cron_backstop');
end;
$function$;
revoke all on function private.dispatch_operation_analysis_jobs()
  from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='sanad-operation-analysis-dispatch';
select cron.schedule(
  'sanad-operation-analysis-dispatch',
  '*/2 * * * *',
  'select private.dispatch_operation_analysis_jobs();'
);

select cron.unschedule(jobid)
from cron.job
where jobname='sanad-whatsapp-operation-intake-recovery';
select cron.schedule(
  'sanad-whatsapp-operation-intake-recovery',
  '* * * * *',
  'select private.dispatch_whatsapp_operation_intake_recovery();'
);

comment on table private.whatsapp_operation_intakes is
'Durable, idempotent WhatsApp media intake journal. Original storage and operation finalization are resumable by source message ID.';
comment on table private.pipeline_dispatch_leases is
'Short coalescing leases for immediate queue dispatch. Durable job rows and cron recovery remain the correctness boundary.';

commit;

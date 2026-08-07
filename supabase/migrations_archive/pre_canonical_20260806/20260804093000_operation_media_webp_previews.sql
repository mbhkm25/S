begin;

alter table public.operations
  add column if not exists preview_status text not null default 'pending',
  add column if not exists preview_bucket text,
  add column if not exists preview_path text,
  add column if not exists preview_mime_type text,
  add column if not exists preview_size bigint,
  add column if not exists preview_width integer,
  add column if not exists preview_height integer,
  add column if not exists preview_generated_at timestamptz,
  add column if not exists preview_error text,
  add column if not exists preview_source_sha256 text,
  add column if not exists preview_attempt_count integer not null default 0;

alter table public.operations
  drop constraint if exists operations_preview_status_check;

alter table public.operations
  add constraint operations_preview_status_check
  check (preview_status in ('pending','processing','ready','failed','not_required'));

alter table public.operations
  drop constraint if exists operations_preview_mime_type_check;

alter table public.operations
  add constraint operations_preview_mime_type_check
  check (preview_mime_type is null or preview_mime_type = 'image/webp');

create table if not exists private.operation_media_preview_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.operations(id) on delete cascade,
  source_bucket text not null,
  source_path text not null,
  source_mime_type text not null,
  source_sha256 text,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.operation_media_preview_jobs from public, anon, authenticated;

create index if not exists operation_media_preview_jobs_claim_idx
  on private.operation_media_preview_jobs(status, available_at, created_at)
  where status in ('pending','processing');

create or replace function private.operation_preview_supported_mime(p_mime text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(split_part(coalesce(p_mime, ''), ';', 1)) in (
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  );
$$;

create or replace function private.prepare_operation_media_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.file_path is null or not private.operation_preview_supported_mime(new.file_mime_type) then
    new.preview_status := 'not_required';
    new.preview_bucket := null;
    new.preview_path := null;
    new.preview_mime_type := null;
    new.preview_size := null;
    new.preview_width := null;
    new.preview_height := null;
    new.preview_generated_at := null;
    new.preview_error := null;
    new.preview_source_sha256 := null;
    new.preview_attempt_count := 0;
    return new;
  end if;

  if tg_op = 'INSERT'
     or old.file_path is distinct from new.file_path
     or old.file_bucket is distinct from new.file_bucket
     or old.file_mime_type is distinct from new.file_mime_type
     or old.file_sha256 is distinct from new.file_sha256 then
    new.preview_status := 'pending';
    new.preview_bucket := null;
    new.preview_path := null;
    new.preview_mime_type := null;
    new.preview_size := null;
    new.preview_width := null;
    new.preview_height := null;
    new.preview_generated_at := null;
    new.preview_error := null;
    new.preview_source_sha256 := new.file_sha256;
    new.preview_attempt_count := 0;
  end if;

  return new;
end;
$$;

create or replace function private.enqueue_operation_media_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.preview_status = 'pending'
     and new.file_path is not null
     and private.operation_preview_supported_mime(new.file_mime_type) then
    insert into private.operation_media_preview_jobs (
      operation_id,
      source_bucket,
      source_path,
      source_mime_type,
      source_sha256,
      status,
      attempt_count,
      available_at,
      claimed_at,
      completed_at,
      last_error,
      updated_at
    ) values (
      new.id,
      coalesce(new.file_bucket, 'operation-files'),
      new.file_path,
      lower(split_part(coalesce(new.file_mime_type, ''), ';', 1)),
      new.file_sha256,
      'pending',
      0,
      now(),
      null,
      null,
      null,
      now()
    )
    on conflict (operation_id) do update
    set source_bucket = excluded.source_bucket,
        source_path = excluded.source_path,
        source_mime_type = excluded.source_mime_type,
        source_sha256 = excluded.source_sha256,
        status = 'pending',
        attempt_count = 0,
        available_at = now(),
        claimed_at = null,
        completed_at = null,
        last_error = null,
        updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists operations_prepare_media_preview on public.operations;
create trigger operations_prepare_media_preview
before insert or update of file_bucket, file_path, file_mime_type, file_sha256
on public.operations
for each row execute function private.prepare_operation_media_preview();

drop trigger if exists operations_enqueue_media_preview on public.operations;
create trigger operations_enqueue_media_preview
after insert or update of file_bucket, file_path, file_mime_type, file_sha256
on public.operations
for each row execute function private.enqueue_operation_media_preview();

insert into private.sanad_worker_tokens(worker_name, token_value, is_active, created_at, updated_at)
values ('operation_media_preview', encode(gen_random_bytes(32), 'hex'), true, now(), now())
on conflict (worker_name) do update
set is_active = true,
    updated_at = now();

create or replace function public.claim_operation_media_preview_jobs(
  p_worker_token text,
  p_limit integer default 3
)
returns table (
  job_id uuid,
  operation_id uuid,
  source_bucket text,
  source_path text,
  source_mime_type text,
  source_sha256 text,
  public_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from private.sanad_worker_tokens t
    where t.worker_name = 'operation_media_preview'
      and t.is_active = true
      and t.token_value = p_worker_token
  ) then
    raise exception 'invalid_worker_token';
  end if;

  update private.operation_media_preview_jobs j
  set status = 'pending',
      claimed_at = null,
      available_at = now(),
      updated_at = now(),
      last_error = coalesce(j.last_error, 'stale_processing_recovered')
  where j.status = 'processing'
    and j.claimed_at < now() - interval '3 minutes';

  return query
  with picked as (
    select j.id
    from private.operation_media_preview_jobs j
    where j.status = 'pending'
      and j.available_at <= now()
      and j.attempt_count < 3
    order by j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 10))
  ), claimed as (
    update private.operation_media_preview_jobs j
    set status = 'processing',
        attempt_count = j.attempt_count + 1,
        claimed_at = now(),
        updated_at = now()
    from picked
    where j.id = picked.id
    returning j.*
  )
  select c.id,
         c.operation_id,
         c.source_bucket,
         c.source_path,
         c.source_mime_type,
         c.source_sha256,
         o.public_token
  from claimed c
  join public.operations o on o.id = c.operation_id;
end;
$$;

create or replace function public.complete_operation_media_preview_job(
  p_worker_token text,
  p_job_id uuid,
  p_preview_bucket text,
  p_preview_path text,
  p_preview_size bigint,
  p_preview_width integer,
  p_preview_height integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.operation_media_preview_jobs%rowtype;
begin
  if not exists (
    select 1 from private.sanad_worker_tokens t
    where t.worker_name = 'operation_media_preview'
      and t.is_active = true
      and t.token_value = p_worker_token
  ) then
    raise exception 'invalid_worker_token';
  end if;

  select * into v_job
  from private.operation_media_preview_jobs
  where id = p_job_id
  for update;

  if v_job.id is null or v_job.status <> 'processing' then
    return false;
  end if;

  update public.operations o
  set preview_status = 'ready',
      preview_bucket = p_preview_bucket,
      preview_path = p_preview_path,
      preview_mime_type = 'image/webp',
      preview_size = p_preview_size,
      preview_width = p_preview_width,
      preview_height = p_preview_height,
      preview_generated_at = now(),
      preview_error = null,
      preview_source_sha256 = v_job.source_sha256,
      preview_attempt_count = v_job.attempt_count,
      updated_at = now()
  where o.id = v_job.operation_id
    and o.file_path = v_job.source_path
    and coalesce(o.file_bucket, 'operation-files') = v_job.source_bucket
    and o.file_sha256 is not distinct from v_job.source_sha256;

  if not found then
    update private.operation_media_preview_jobs
    set status = 'pending',
        available_at = now(),
        claimed_at = null,
        last_error = 'source_changed_before_preview_commit',
        updated_at = now()
    where id = p_job_id;
    return false;
  end if;

  update private.operation_media_preview_jobs
  set status = 'completed',
      completed_at = now(),
      claimed_at = null,
      last_error = null,
      updated_at = now()
  where id = p_job_id;

  return true;
end;
$$;

create or replace function public.fail_operation_media_preview_job(
  p_worker_token text,
  p_job_id uuid,
  p_error text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.operation_media_preview_jobs%rowtype;
  v_next_status text;
begin
  if not exists (
    select 1 from private.sanad_worker_tokens t
    where t.worker_name = 'operation_media_preview'
      and t.is_active = true
      and t.token_value = p_worker_token
  ) then
    raise exception 'invalid_worker_token';
  end if;

  select * into v_job
  from private.operation_media_preview_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    return 'missing';
  end if;

  v_next_status := case when v_job.attempt_count >= 3 then 'failed' else 'pending' end;

  update private.operation_media_preview_jobs
  set status = v_next_status,
      available_at = case
        when v_next_status = 'pending' then now() + make_interval(secs => 20 * greatest(v_job.attempt_count, 1))
        else available_at
      end,
      claimed_at = null,
      last_error = left(coalesce(p_error, 'preview_generation_failed'), 1000),
      updated_at = now()
  where id = p_job_id;

  update public.operations
  set preview_status = case when v_next_status = 'failed' then 'failed' else 'pending' end,
      preview_error = left(coalesce(p_error, 'preview_generation_failed'), 1000),
      preview_attempt_count = v_job.attempt_count,
      updated_at = now()
  where id = v_job.operation_id;

  return v_next_status;
end;
$$;

revoke all on function public.claim_operation_media_preview_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.complete_operation_media_preview_job(text, uuid, text, text, bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_operation_media_preview_job(text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_operation_media_preview_jobs(text, integer) to service_role;
grant execute on function public.complete_operation_media_preview_job(text, uuid, text, text, bigint, integer, integer) to service_role;
grant execute on function public.fail_operation_media_preview_job(text, uuid, text) to service_role;

create or replace function private.dispatch_operation_media_previews()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_request bigint;
begin
  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name = 'operation_media_preview'
    and is_active = true;

  if v_token is null then
    return null;
  end if;

  select net.http_post(
    url := 'https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-operation-preview-worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sanad-worker-token', v_token
    ),
    body := jsonb_build_object('limit', 3, 'source', 'database_dispatch'),
    timeout_milliseconds := 55000
  ) into v_request;

  return v_request;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'sanad-operation-media-previews';

select cron.schedule(
  'sanad-operation-media-previews',
  '* * * * *',
  'select private.dispatch_operation_media_previews();'
);

update public.operations
set preview_status = case
      when file_path is not null and private.operation_preview_supported_mime(file_mime_type) then 'pending'
      else 'not_required'
    end,
    preview_bucket = null,
    preview_path = null,
    preview_mime_type = null,
    preview_size = null,
    preview_width = null,
    preview_height = null,
    preview_generated_at = null,
    preview_error = null,
    preview_source_sha256 = file_sha256,
    preview_attempt_count = 0
where preview_path is null;

insert into private.operation_media_preview_jobs (
  operation_id, source_bucket, source_path, source_mime_type, source_sha256,
  status, attempt_count, available_at, created_at, updated_at
)
select o.id,
       coalesce(o.file_bucket, 'operation-files'),
       o.file_path,
       lower(split_part(coalesce(o.file_mime_type, ''), ';', 1)),
       o.file_sha256,
       'pending',
       0,
       now(),
       now(),
       now()
from public.operations o
where o.file_path is not null
  and private.operation_preview_supported_mime(o.file_mime_type)
on conflict (operation_id) do update
set source_bucket = excluded.source_bucket,
    source_path = excluded.source_path,
    source_mime_type = excluded.source_mime_type,
    source_sha256 = excluded.source_sha256,
    status = case
      when private.operation_media_preview_jobs.status = 'completed' then private.operation_media_preview_jobs.status
      else 'pending'
    end,
    available_at = now(),
    updated_at = now();

create or replace function public.open_operation_access(p_public_token uuid, p_source text default 'link')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_operation_id uuid;
  v_conflict boolean;
  v_preview jsonb;
begin
  v_payload := public.open_operation_access_semantic_core(p_public_token, p_source);
  v_operation_id := nullif(v_payload #>> '{operation,id}', '')::uuid;
  if v_operation_id is null or not (v_payload #> '{operation,identity_projection}' is not null) then
    return v_payload;
  end if;

  v_conflict := private.operation_identity_name_conflict(v_operation_id);

  select jsonb_build_object(
    'status', o.preview_status,
    'mime_type', o.preview_mime_type,
    'size', o.preview_size,
    'width', o.preview_width,
    'height', o.preview_height,
    'generated_at', o.preview_generated_at,
    'error', case when o.preview_status = 'failed' then 'preview_generation_failed' else null end,
    'available', o.preview_status = 'ready' and o.preview_path is not null
  ) into v_preview
  from public.operations o
  where o.id = v_operation_id;

  v_payload := jsonb_set(
    v_payload,
    '{operation,identity_projection,has_name_conflict}',
    to_jsonb(coalesce(v_conflict, false)),
    true
  );

  return jsonb_set(
    v_payload,
    '{operation,document_preview}',
    coalesce(v_preview, jsonb_build_object('status', 'not_required', 'available', false)),
    true
  );
end;
$$;

commit;

begin;

create or replace function public.complete_operation_media_preview_job_v2(
  p_worker_token text,
  p_job_id uuid,
  p_preview_bucket text,
  p_preview_path text,
  p_preview_size bigint,
  p_preview_width integer,
  p_preview_height integer,
  p_pipeline_version text,
  p_crop_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job private.operation_media_preview_jobs%rowtype;
begin
  if not exists(
    select 1 from private.sanad_worker_tokens t
    where t.worker_name='operation_media_preview'
      and t.is_active=true
      and t.token_value=p_worker_token
  ) then
    raise exception 'invalid_worker_token';
  end if;

  select * into v_job
  from private.operation_media_preview_jobs
  where id=p_job_id
  for update;

  if v_job.id is null or v_job.status<>'processing' then
    return false;
  end if;

  update public.operations o
  set preview_status='ready',
      preview_bucket=p_preview_bucket,
      preview_path=p_preview_path,
      preview_mime_type='image/webp',
      preview_size=p_preview_size,
      preview_width=p_preview_width,
      preview_height=p_preview_height,
      preview_generated_at=now(),
      preview_error=null,
      preview_source_sha256=v_job.source_sha256,
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
    set status='pending',available_at=now(),claimed_at=null,
        last_error='source_changed_before_preview_commit',updated_at=now()
    where id=p_job_id;
    return false;
  end if;

  update private.operation_media_preview_jobs
  set status='completed',completed_at=now(),claimed_at=null,last_error=null,updated_at=now()
  where id=p_job_id;

  return true;
end;
$$;

revoke all on function public.complete_operation_media_preview_job_v2(text,uuid,text,text,bigint,integer,integer,text,jsonb) from public,anon,authenticated;

create or replace function public.requeue_operation_preview_v2(p_operation_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_operation public.operations%rowtype;
  v_allowed boolean:=false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_operation from public.operations where id=p_operation_id;
  if not found then return false; end if;

  select (
    v_operation.submitted_by_user_id=v_uid
    or exists(select 1 from public.operation_access_logs l where l.operation_id=v_operation.id and l.user_id=v_uid)
    or exists(select 1 from public.operation_user_links ul where ul.operation_id=v_operation.id and ul.user_id=v_uid)
    or exists(select 1 from public.business_payment_inbox i where i.operation_id=v_operation.id and private.has_business_payment_permission(i.business_id,'view',v_uid))
  ) into v_allowed;
  if not coalesce(v_allowed,false) then raise exception 'operation_access_denied' using errcode='42501'; end if;

  insert into private.operation_media_preview_jobs(
    operation_id,source_bucket,source_path,source_mime_type,source_sha256,status,attempt_count,available_at
  ) values(
    v_operation.id,coalesce(v_operation.file_bucket,'operation-files'),v_operation.file_path,
    coalesce(v_operation.file_mime_type,'application/octet-stream'),v_operation.file_sha256,'pending',0,now()
  )
  on conflict (operation_id) do update set
    source_bucket=excluded.source_bucket,
    source_path=excluded.source_path,
    source_mime_type=excluded.source_mime_type,
    source_sha256=excluded.source_sha256,
    status='pending',attempt_count=0,available_at=now(),claimed_at=null,completed_at=null,last_error=null,updated_at=now();

  update public.operations
  set preview_status='pending',preview_error=null,preview_attempt_count=0,updated_at=now()
  where id=v_operation.id;
  return true;
end;
$$;

revoke all on function public.requeue_operation_preview_v2(uuid) from public,anon;
grant execute on function public.requeue_operation_preview_v2(uuid) to authenticated;

commit;

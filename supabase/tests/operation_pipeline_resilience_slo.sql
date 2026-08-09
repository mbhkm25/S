begin;

update private.pipeline_runtime_config
set environment='resilience_test',dispatch_enabled=false,updated_at=now()
where singleton=true;

select set_config('request.jwt.claim.role','service_role',true);

-- Deterministic schema faults must never consume the retry budget.
do $$
declare
  v_operation_id uuid;
  v_job_id uuid;
  v_claim record;
  v_state text;
begin
  if not private.analysis_failure_is_deterministic(
    'analyzer_http_500',
    '{"code":"42883","message":"function private.missing_helper(text, text) does not exist"}',
    500
  ) then raise exception 'postgres_42883_not_classified_as_deterministic'; end if;

  if private.analysis_failure_is_deterministic(
    'analyzer_http_503','upstream temporarily unavailable',503
  ) then raise exception 'generic_503_incorrectly_classified_as_deterministic'; end if;

  insert into public.operations(
    public_token,source,upload_origin,file_bucket,file_path,file_original_name,
    file_mime_type,file_size,file_sha256,storage_metadata,original_file_status,
    status,ai_status,preview_status,pipeline_run_id
  ) values(
    gen_random_uuid(),'pwa_upload','pwa','operation-files',
    'pipeline-tests/deterministic-contract.webp','deterministic-contract.webp','image/webp',
    256,repeat('f',64),jsonb_build_object('fixture','deterministic_contract'),
    'stored','stored','pending','not_required',gen_random_uuid()
  ) returning id into v_operation_id;

  v_job_id:=public.enqueue_operation_analysis(v_operation_id,100::smallint,'camera',null);
  select * into v_claim from public.claim_operation_analysis_jobs('resilience-worker',1,120);
  if v_claim.job_id is distinct from v_job_id then raise exception 'deterministic_job_claim_failed'; end if;

  v_state:=public.fail_operation_analysis_job(
    v_job_id,'resilience-worker',true,'analyzer_http_500',
    '{"code":"42883","message":"function private.missing_helper(text, text) does not exist"}',500
  );

  if v_state<>'failed' then raise exception 'deterministic_failure_retried: %',v_state; end if;
  if not exists(
    select 1 from private.operation_analysis_jobs
    where id=v_job_id and status='failed' and attempt_count=1
      and last_error_code='analyzer_contract_failure' and completed_at is not null
  ) then raise exception 'deterministic_failure_checkpoint_invalid'; end if;
  if not exists(
    select 1 from public.operations where id=v_operation_id and ai_status='failed'
  ) then raise exception 'deterministic_operation_state_invalid'; end if;
end $$;

-- Genuine transient infrastructure errors keep bounded retries.
do $$
declare
  v_operation_id uuid;
  v_job_id uuid;
  v_claim record;
  v_state text;
begin
  update private.operation_analysis_jobs
  set available_at=now()+interval '1 hour'
  where status in ('queued','retry_scheduled');

  insert into public.operations(
    public_token,source,upload_origin,file_bucket,file_path,file_original_name,
    file_mime_type,file_size,file_sha256,storage_metadata,original_file_status,
    status,ai_status,preview_status,pipeline_run_id
  ) values(
    gen_random_uuid(),'pwa_upload','pwa','operation-files',
    'pipeline-tests/transient.webp','transient.webp','image/webp',
    256,repeat('e',64),jsonb_build_object('fixture','transient'),
    'stored','stored','pending','not_required',gen_random_uuid()
  ) returning id into v_operation_id;

  v_job_id:=public.enqueue_operation_analysis(v_operation_id,100::smallint,'attachment',null);
  select * into v_claim from public.claim_operation_analysis_jobs('transient-worker',1,120);
  if v_claim.job_id is distinct from v_job_id then raise exception 'transient_job_claim_failed'; end if;

  v_state:=public.fail_operation_analysis_job(
    v_job_id,'transient-worker',true,'analyzer_http_503','upstream temporarily unavailable',503
  );
  if v_state<>'retry_scheduled' then raise exception 'transient_failure_not_retried: %',v_state; end if;
end $$;

-- Camera, file attachment, Android share-target, and WhatsApp must converge on
-- the same durable analysis queue contract. Camera/file are intentionally two
-- variants of pwa_upload and remain distinguishable in client metadata.
do $$
declare
  v_id uuid;
  v_count integer;
  r record;
begin
  for r in
    select * from (values
      ('pwa_upload','pwa','camera','pipeline-tests/camera.webp'),
      ('pwa_upload','pwa','attachment','pipeline-tests/attachment.pdf'),
      ('share_target','pwa','share_target','pipeline-tests/share.webp'),
      ('whatsapp','whatsapp','whatsapp','pipeline-tests/whatsapp.jpg')
    ) as x(source,origin,entry_path,file_path)
  loop
    insert into public.operations(
      public_token,source,upload_origin,file_bucket,file_path,file_original_name,
      file_mime_type,file_size,file_sha256,storage_metadata,client_upload_metadata,
      original_file_status,status,ai_status,preview_status,pipeline_run_id
    ) values(
      gen_random_uuid(),r.source,r.origin,'operation-files',r.file_path,
      split_part(r.file_path,'/',3),
      case when r.file_path like '%.pdf' then 'application/pdf' when r.file_path like '%.jpg' then 'image/jpeg' else 'image/webp' end,
      128,encode(extensions.digest(convert_to(r.entry_path||gen_random_uuid()::text,'UTF8'),'sha256'),'hex'),
      jsonb_build_object('fixture','entry_source_matrix'),
      jsonb_build_object('entry_path',r.entry_path),
      'stored','stored','pending','not_required',gen_random_uuid()
    ) returning id into v_id;

    perform public.enqueue_operation_analysis(v_id,100::smallint,r.entry_path,null);

    select count(*) into v_count
    from private.operation_analysis_jobs
    where operation_id=v_id and source=r.entry_path;
    if v_count<>1 then
      raise exception 'entry_path_not_converged: path=%, operation=%, jobs=%',r.entry_path,v_id,v_count;
    end if;

    if not exists(
      select 1 from public.operations
      where id=v_id and source=r.source and upload_origin=r.origin
        and client_upload_metadata->>'entry_path'=r.entry_path
        and original_file_status='stored' and ai_status='pending'
    ) then raise exception 'entry_path_operation_contract_changed: %',r.entry_path; end if;
  end loop;
end $$;

-- SLO contract must remain machine-readable and fixed to the agreed thresholds.
do $$
begin
  if not exists(
    select 1 from public.get_operation_pipeline_slo_status(24)
    where source='all' and p50_target_ms=3000 and p95_target_ms=6000
      and exception_threshold_ms=15000
      and slo_status in ('pass','breach','insufficient_data')
  ) then raise exception 'pipeline_slo_contract_missing'; end if;
end $$;

rollback;

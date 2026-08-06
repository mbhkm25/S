begin;

-- These fixtures must run only on an isolated database branch. Disabling
-- dispatch prevents rolled-back fixtures from contacting any Edge Function.
update private.pipeline_runtime_config
set environment='integration_test',dispatch_enabled=false,updated_at=now()
where singleton=true;

select set_config('request.jwt.claim.role','service_role',true);

-- This test may run after a branch load fixture. Defer pre-existing due work so
-- every claim below proves ownership of the row created in this transaction.
-- The outer rollback restores all branch rows exactly as they were.
update private.operation_analysis_jobs
set available_at=now()+interval '1 hour',
    lease_expires_at=case
      when status='processing' then now()+interval '1 hour'
      else lease_expires_at
    end;

update private.operation_media_preview_jobs
set available_at=now()+interval '1 hour',
    lease_expires_at=case
      when status='processing' then now()+interval '1 hour'
      else lease_expires_at
    end;

update public.sanad_transactional_message_outbox
set next_attempt_at=now()+interval '1 hour',
    lease_expires_at=case
      when status='processing' then now()+interval '1 hour'
      else lease_expires_at
    end;

do $$
declare
  v_message_id text:='wamid.pipeline.integration.'||replace(gen_random_uuid()::text,'-','');
  v_run_id uuid:=gen_random_uuid();
  v_public_token uuid:=gen_random_uuid();
  v_claim jsonb;
  v_claim_token uuid;
  v_final jsonb;
  v_replay jsonb;
  v_duplicate jsonb;
  v_operation_id uuid;
  v_preview_claim record;
  v_preview_worker_token text;
  v_stale_preview_claim_token uuid;
  v_preview_state text;
  v_analysis_claim_id uuid;
begin
  v_claim:=public.claim_whatsapp_operation_intake(
    v_message_id,v_run_id,'967700000001','pipeline-test-media','image/png',
    'verified',jsonb_build_object('fixture','instant_event_pipeline'),180
  );
  if not coalesce((v_claim->>'claimed')::boolean,false) then
    raise exception 'initial_intake_claim_failed: %',v_claim;
  end if;
  v_claim_token:=(v_claim->>'claim_token')::uuid;

  if not public.record_whatsapp_operation_intake_storage(
    v_message_id,v_claim_token,'operation-files',
    'pipeline-tests/'||v_message_id||'.png','image/png','fixture.png',128,
    repeat('a',64),jsonb_build_object('fixture',true)
  ) then
    raise exception 'storage_checkpoint_failed';
  end if;

  v_final:=public.finalize_whatsapp_operation_intake(
    v_message_id,v_claim_token,
    jsonb_build_object('public_token',v_public_token,'submitted_by_name','Pipeline Test')
  );
  if not coalesce((v_final->>'ok')::boolean,false) then
    raise exception 'intake_finalization_failed: %',v_final;
  end if;
  v_operation_id:=(v_final->>'operation_id')::uuid;

  v_replay:=public.finalize_whatsapp_operation_intake(
    v_message_id,v_claim_token,
    jsonb_build_object('public_token',gen_random_uuid())
  );
  if not coalesce((v_replay->>'idempotent')::boolean,false)
     or (v_replay->>'operation_id')::uuid<>v_operation_id then
    raise exception 'finalization_replay_not_idempotent: %',v_replay;
  end if;

  if not public.complete_whatsapp_operation_intake(
    v_message_id,
    v_claim_token,
    'sent',
    'wamid.pipeline.qr.'||replace(gen_random_uuid()::text,'-',''),
    jsonb_build_object('fixture','batched_completion'),
    jsonb_build_array(
      jsonb_build_object(
        'stage','media_lookup_download','status','success',
        'started_at',(clock_timestamp()-interval '5 seconds')::text,
        'completed_at',(clock_timestamp()-interval '4 seconds')::text,
        'duration_ms',1000,'metadata',jsonb_build_object('fixture',true)
      ),
      jsonb_build_object(
        'stage','storage_upload','status','success',
        'started_at',(clock_timestamp()-interval '4 seconds')::text,
        'completed_at',(clock_timestamp()-interval '3 seconds')::text,
        'duration_ms',1000,'metadata',jsonb_build_object('fixture',true)
      ),
      jsonb_build_object(
        'stage','operation_create','status','success',
        'started_at',(clock_timestamp()-interval '3 seconds')::text,
        'completed_at',(clock_timestamp()-interval '2 seconds')::text,
        'duration_ms',1000,'metadata',jsonb_build_object('fixture',true)
      ),
      jsonb_build_object(
        'stage','qr_delivery','status','success',
        'started_at',(clock_timestamp()-interval '2 seconds')::text,
        'completed_at',(clock_timestamp()-interval '1 second')::text,
        'duration_ms',1000,'metadata',jsonb_build_object('fixture',true)
      ),
      jsonb_build_object(
        'stage','intake_total','status','success',
        'started_at',(clock_timestamp()-interval '5 seconds')::text,
        'completed_at',clock_timestamp()::text,
        'duration_ms',5000,'metadata',jsonb_build_object('fixture',true)
      )
    )
  ) then
    raise exception 'intake_completion_failed';
  end if;

  v_duplicate:=public.claim_whatsapp_operation_intake(
    v_message_id,gen_random_uuid(),'967700000001','pipeline-test-media',
    'image/png','verified','{}'::jsonb,180
  );
  if coalesce((v_duplicate->>'claimed')::boolean,true)
     or not coalesce((v_duplicate->>'duplicate')::boolean,false)
     or (v_duplicate->>'operation_id')::uuid<>v_operation_id then
    raise exception 'completed_duplicate_not_suppressed: %',v_duplicate;
  end if;
  if (
    select duplicate_claim_count
    from private.whatsapp_operation_intakes
    where source_message_id=v_message_id
  )<>1 then raise exception 'webhook_duplicate_metric_not_recorded'; end if;

  if (
    select count(*) from public.operations
    where source='whatsapp'
      and storage_metadata->>'meta_message_id'=v_message_id
  )<>1 then raise exception 'duplicate_operation_created'; end if;

  if (
    select count(*) from private.operation_analysis_jobs
    where operation_id=v_operation_id
  )<>1 then raise exception 'analysis_job_cardinality_failed'; end if;

  if (
    select count(*) from private.operation_media_preview_jobs
    where operation_id=v_operation_id
  )<>1 then raise exception 'preview_job_cardinality_failed'; end if;

  if not exists(
    select 1 from private.operation_analysis_jobs
    where operation_id=v_operation_id and status='queued'
      and pipeline_run_id=v_run_id
  ) then raise exception 'analysis_job_contract_failed'; end if;

  if not exists(
    select 1 from private.operation_media_preview_jobs
    where operation_id=v_operation_id and status='queued'
      and pipeline_run_id=v_run_id
  ) then raise exception 'preview_job_contract_failed'; end if;

  select token_value into v_preview_worker_token
  from private.sanad_worker_tokens
  where worker_name='operation_media_preview' and is_active=true;
  select * into v_preview_claim
  from public.claim_operation_media_preview_jobs(v_preview_worker_token,1);
  if v_preview_claim.operation_id is distinct from v_operation_id
     or v_preview_claim.claim_token is null then
    raise exception 'preview_claim_ownership_contract_failed';
  end if;
  if exists(
    select 1 from private.pipeline_dispatch_leases
    where queue_name='operation_media_preview' and lease_until>clock_timestamp()
  ) then raise exception 'preview_claim_did_not_release_dispatch_lease'; end if;
  v_stale_preview_claim_token:=v_preview_claim.claim_token;
  update private.operation_media_preview_jobs
  set claim_token=gen_random_uuid()
  where id=v_preview_claim.job_id;
  v_preview_state:=public.fail_operation_media_preview_job_v2(
    v_preview_worker_token,v_preview_claim.job_id,v_stale_preview_claim_token,
    true,'stale_claim_fixture','A stale preview worker must not checkpoint',null
  );
  if v_preview_state<>'not_owned' then
    raise exception 'stale_preview_claim_not_rejected: %',v_preview_state;
  end if;

  update private.operation_analysis_jobs
  set attempt_count=max_attempts,available_at=now()-interval '1 second'
  where operation_id=v_operation_id;
  select job_id into v_analysis_claim_id
  from public.claim_operation_analysis_jobs('pipeline-test-worker',1,120);
  if v_analysis_claim_id is not null or not exists(
    select 1 from private.operation_analysis_jobs
    where operation_id=v_operation_id and status='dead_letter'
      and last_error_code='analysis_attempts_exhausted'
  ) then raise exception 'analysis_retry_budget_not_enforced'; end if;

  if not exists(
    select 1 from public.operations
    where id=v_operation_id and public_token=v_public_token
      and file_bucket='operation-files'
      and file_path='pipeline-tests/'||v_message_id||'.png'
      and file_mime_type='image/png' and file_size=128
      and file_sha256=repeat('a',64)
      and original_file_status='stored' and ai_status='pending'
      and pipeline_run_id=v_run_id
  ) then raise exception 'original_document_contract_changed'; end if;

  if (
    select count(*) from public.operation_events
    where operation_id=v_operation_id and event_type='created'
  )<>1 or (
    select count(*) from public.operation_events
    where operation_id=v_operation_id and event_type='file_uploaded'
  )<>1 or (
    select count(*) from public.operation_events
    where operation_id=v_operation_id and event_type='qr_created'
      and metadata->>'fixture'='batched_completion'
      and metadata->>'pipeline_run_id'=v_run_id::text
  )<>1 then raise exception 'transactional_event_contract_failed'; end if;

  if (
    select count(*) from public.operation_pipeline_spans
    where operation_id=v_operation_id and run_id=v_run_id
      and pipeline='whatsapp_intake'
      and stage in(
        'media_lookup_download','storage_upload','operation_create',
        'qr_delivery','intake_total'
      )
      and function_name='sanad-v3-whatsapp-intake'
      and duration_ms between 0 and 3600000
  )<>5 or not exists(
    select 1 from public.operation_pipeline_spans
    where operation_id=v_operation_id and run_id=v_run_id
      and pipeline='whatsapp_intake' and stage='intake_total'
      and completed_at>=started_at
  ) then raise exception 'batched_intake_telemetry_contract_failed'; end if;
end $$;

do $$
declare
  v_message_id text:='wamid.pipeline.stale.'||replace(gen_random_uuid()::text,'-','');
  v_claim jsonb;
  v_status text;
begin
  v_claim:=public.claim_whatsapp_operation_intake(
    v_message_id,gen_random_uuid(),'967700000002','stale-media','image/jpeg',
    'verified','{}'::jsonb,60
  );
  update private.whatsapp_operation_intakes
  set lease_expires_at=now()-interval '1 second'
  where source_message_id=v_message_id;
  if public.recover_stale_whatsapp_operation_intakes()<1 then
    raise exception 'stale_intake_not_recovered';
  end if;
  select status into v_status
  from private.whatsapp_operation_intakes
  where source_message_id=v_message_id;
  if v_status<>'retry_scheduled' then
    raise exception 'stale_intake_wrong_state: %',v_status;
  end if;
end $$;

do $$
declare
  v_message_id text:='wamid.pipeline.retry.'||replace(gen_random_uuid()::text,'-','');
  v_claim jsonb;
  v_state text;
begin
  v_claim:=public.claim_whatsapp_operation_intake(
    v_message_id,gen_random_uuid(),'967700000003','retry-media','application/pdf',
    'verified','{}'::jsonb,60
  );
  v_state:=public.fail_whatsapp_operation_intake(
    v_message_id,(v_claim->>'claim_token')::uuid,true,
    'fixture_transient','Injected retryable failure'
  );
  if v_state<>'retry_scheduled' then
    raise exception 'retryable_failure_not_scheduled: %',v_state;
  end if;
  update private.whatsapp_operation_intakes
  set available_at=now()-interval '1 second'
  where source_message_id=v_message_id;
  v_claim:=public.claim_whatsapp_operation_intake(
    v_message_id,gen_random_uuid(),'967700000003','retry-media','application/pdf',
    'verified','{}'::jsonb,60
  );
  if not coalesce((v_claim->>'claimed')::boolean,false)
     or (v_claim->>'attempt_count')::integer<>2 then
    raise exception 'retry_claim_contract_failed: %',v_claim;
  end if;
end $$;

do $$
declare
  v_key text:='pipeline_contract_test_'||replace(gen_random_uuid()::text,'-','');
  v_run_id uuid:=gen_random_uuid();
  v_first uuid;
  v_second uuid;
begin
  if not private.acquire_pipeline_dispatch_lease(v_key,30,'first') then
    raise exception 'dispatch_lease_first_acquire_failed';
  end if;
  if private.acquire_pipeline_dispatch_lease(v_key,30,'duplicate') then
    raise exception 'dispatch_lease_duplicate_not_suppressed';
  end if;

  v_first:=private.enqueue_transactional_text_message(
    'operation_analysis_failed','967700000004','pipeline_fixture',v_run_id::text,
    'pipeline_fixture:'||v_run_id::text,'fixture',v_run_id,
    now()+interval '1 hour','{}'::jsonb
  );
  v_second:=private.enqueue_transactional_text_message(
    'operation_analysis_failed','967700000004','pipeline_fixture',v_run_id::text,
    'pipeline_fixture:'||v_run_id::text,'fixture',v_run_id,
    now()+interval '1 hour','{}'::jsonb
  );
  if v_first is null or v_first is distinct from v_second then
    raise exception 'outbox_dedupe_contract_failed';
  end if;
  if (
    select duplicate_suppressed_count
    from public.sanad_transactional_message_outbox
    where id=v_first
  )<>1 then raise exception 'outbox_duplicate_metric_not_recorded'; end if;
end $$;

rollback;

select 'instant_event_pipeline_integration_passed_rolled_back' as result;

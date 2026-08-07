begin;

update private.pipeline_runtime_config
set environment='failure_test',dispatch_enabled=false,updated_at=now()
where singleton=true;

select set_config('request.jwt.claim.role','service_role',true);

-- Keep this transactional test deterministic even when the shared branch contains
-- jobs left by an earlier load run. Every change below is rolled back at the end.
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

update private.operation_routing_jobs
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
  v_operation_id uuid;
  v_public_token uuid:=gen_random_uuid();
  v_job_id uuid;
  v_claim record;
  v_state text;
begin
  insert into public.operations(
    public_token,source,upload_origin,file_bucket,file_path,file_original_name,
    file_mime_type,file_size,file_sha256,storage_metadata,original_file_status,
    status,ai_status,preview_status,pipeline_run_id
  ) values(
    v_public_token,'api','failure_test','operation-files',
    'pipeline-tests/analysis-failure.png','analysis-failure.png','image/png',
    128,repeat('d',64),jsonb_build_object('fixture','analysis_failure'),
    'stored','stored','pending','not_required',gen_random_uuid()
  ) returning id into v_operation_id;

  v_job_id:=public.enqueue_operation_analysis(
    v_operation_id,100::smallint,'failure_test',null
  );
  select * into v_claim
  from public.claim_operation_analysis_jobs('failure-worker',1,120);
  if v_claim.job_id is distinct from v_job_id then
    raise exception 'analysis_failure_claim_failed';
  end if;

  v_state:=public.fail_operation_analysis_job(
    v_job_id,'failure-worker',true,'fixture_transient',
    'Injected transient analysis failure',503
  );
  if v_state<>'retry_scheduled' or not exists(
    select 1 from private.operation_analysis_jobs
    where id=v_job_id and status='retry_scheduled' and attempt_count=1
      and available_at>now() and last_error_code='fixture_transient'
  ) then
    raise exception 'analysis_retry_schedule_failed: %',v_state;
  end if;

  update private.operation_analysis_jobs
  set available_at=now()-interval '1 second'
  where id=v_job_id;
  select * into v_claim
  from public.claim_operation_analysis_jobs('failure-worker-2',1,120);
  if v_claim.job_id is distinct from v_job_id then
    raise exception 'analysis_retry_claim_failed';
  end if;
  update private.operation_analysis_jobs
  set lease_expires_at=now()-interval '1 second'
  where id=v_job_id;
  if public.recover_stale_operation_analysis_jobs()<>1 then
    raise exception 'analysis_stale_recovery_count_failed';
  end if;
  if not exists(
    select 1 from private.operation_analysis_jobs
    where id=v_job_id and status='retry_scheduled' and attempt_count=2
      and last_error_code='worker_lease_expired'
  ) then
    raise exception 'analysis_stale_recovery_state_failed';
  end if;

  if not exists(
    select 1 from public.operations
    where id=v_operation_id and public_token=v_public_token
      and file_bucket='operation-files'
      and file_path='pipeline-tests/analysis-failure.png'
      and file_sha256=repeat('d',64) and original_file_status='stored'
      and ai_status='pending'
  ) then
    raise exception 'analysis_failure_changed_original_contract';
  end if;
end $$;

do $$
declare
  v_operation_id uuid;
  v_token text;
  v_claim record;
begin
  insert into public.operations(
    public_token,source,upload_origin,file_bucket,file_path,file_original_name,
    file_mime_type,file_size,file_sha256,storage_metadata,original_file_status,
    status,ai_status,preview_status,pipeline_run_id
  ) values(
    gen_random_uuid(),'api','failure_test','operation-files',
    'pipeline-tests/preview-failure.pdf','preview-failure.pdf','application/pdf',
    512,repeat('e',64),jsonb_build_object('fixture','preview_failure'),
    'stored','stored','pending','pending',gen_random_uuid()
  ) returning id into v_operation_id;

  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='operation_media_preview' and is_active=true;
  select * into v_claim
  from public.claim_operation_media_preview_jobs(v_token,1);
  if v_claim.operation_id is distinct from v_operation_id then
    raise exception 'preview_failure_claim_failed';
  end if;
  update private.operation_media_preview_jobs
  set lease_expires_at=now()-interval '1 second'
  where id=v_claim.job_id;
  if public.recover_stale_operation_media_preview_jobs()<>1 then
    raise exception 'preview_stale_recovery_count_failed';
  end if;
  if not exists(
    select 1 from private.operation_media_preview_jobs
    where id=v_claim.job_id and status='retry_scheduled'
      and last_error_code='preview_lease_expired'
  ) or not exists(
    select 1 from public.operations
    where id=v_operation_id and preview_status='pending'
      and file_path='pipeline-tests/preview-failure.pdf'
  ) then
    raise exception 'preview_stale_recovery_state_failed';
  end if;

  update private.operation_media_preview_jobs
  set status='retry_scheduled',attempt_count=max_attempts,
      available_at=now()-interval '1 second'
  where id=v_claim.job_id;
  if public.recover_stale_operation_media_preview_jobs()<>1 then
    raise exception 'preview_exhaustion_recovery_count_failed';
  end if;
  if not exists(
    select 1 from private.operation_media_preview_jobs
    where id=v_claim.job_id and status='dead_letter'
      and last_error_code='preview_attempts_exhausted'
  ) or not exists(
    select 1 from public.operations
    where id=v_operation_id and preview_status='failed'
      and file_path='pipeline-tests/preview-failure.pdf'
  ) then
    raise exception 'preview_exhaustion_contract_failed';
  end if;
end $$;

do $$
declare
  v_identifier text:='AMB'||replace(gen_random_uuid()::text,'-','');
  v_account_id uuid;
  v_operation_id uuid;
  v_token text;
  v_claim record;
  v_result jsonb;
  v_recovered integer;
  v_recovery_state jsonb;
  i integer;
begin
  for i in 1..2 loop
    insert into public.business_financial_accounts(
      business_id,financial_entity_code,account_holder_name,routing_enabled,
      verification_status,status
    ) values(
      gen_random_uuid(),'kuraimi_yer','Ambiguous Route '||i::text,true,
      'verified','active'
    ) returning id into v_account_id;
    insert into public.business_financial_identifiers(
      financial_account_id,identifier_type,identifier_value,currency,is_primary,
      routing_enabled,verification_status,status
    ) values(
      v_account_id,'account_number',v_identifier,'YER',true,true,
      'verified','active'
    );
  end loop;

  insert into public.operations(
    public_token,source,upload_origin,storage_metadata,original_file_status,
    status,ai_status,structured_data,currency,financial_entity_code,
    credited_account,preview_status,pipeline_run_id
  ) values(
    gen_random_uuid(),'api','failure_test',
    jsonb_build_object('fixture','ambiguous_route'),'stored','stored','pending',
    jsonb_build_object('is_financial_document',true),'YER','kuraimi_yer',
    v_identifier,'not_required',gen_random_uuid()
  ) returning id into v_operation_id;
  update public.operations
  set ai_status='completed',analysis_completed_at=now(),status='ready'
  where id=v_operation_id;

  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='operation_routing' and is_active=true;
  select * into v_claim
  from public.claim_operation_routing_jobs(v_token,1,120);
  if v_claim.operation_id is distinct from v_operation_id then
    raise exception 'ambiguous_routing_claim_failed';
  end if;
  v_result:=public.execute_operation_routing_job(
    v_token,v_claim.job_id,v_claim.claim_token
  );
  if v_result->>'route_status'<>'not_routed'
     or v_result#>>'{exact_result,reason}'<>'exact_identifier_ambiguous'
     or exists(
       select 1 from public.business_payment_inbox
       where operation_id=v_operation_id
     ) then
    raise exception 'ambiguous_route_created_inbox_projection: %',v_result;
  end if;

  update private.operation_routing_jobs
  set status='processing',attempt_count=1,claim_token=gen_random_uuid(),
      lease_expires_at=now()-interval '1 second',completed_at=null
  where id=v_claim.job_id;
  v_recovered:=private.recover_stale_operation_routing_jobs();
  select to_jsonb(j) into v_recovery_state
  from private.operation_routing_jobs j
  where id=v_claim.job_id;
  if v_recovered<1 or not exists(
    select 1 from private.operation_routing_jobs
    where id=v_claim.job_id and status='retry_scheduled'
      and last_error_code='routing_lease_expired'
  ) then
    raise exception 'routing_stale_recovery_failed: count=%, state=%',
      v_recovered,v_recovery_state;
  end if;
end $$;

do $$
declare
  v_run_id uuid:=gen_random_uuid();
  v_outbox_id uuid;
  v_token text;
  v_claim record;
  v_recovered integer;
  v_recovery_state jsonb;
begin
  -- Earlier failure fixtures can legitimately enqueue transactional messages.
  -- Defer them so this block claims and recovers only its own target row.
  update public.sanad_transactional_message_outbox
  set next_attempt_at=now()+interval '1 hour',
      service_window_expires_at=case
        when delivery_kind='text' then now()+interval '2 hours'
        else service_window_expires_at
      end,
      lease_expires_at=case
        when status='processing' then now()+interval '1 hour'
        else lease_expires_at
      end
  where status in('queued','retry_scheduled','processing');

  v_outbox_id:=private.enqueue_transactional_text_message(
    'operation_analysis_failed','967700000009','failure_test',
    v_run_id::text,'outbox_stale:'||v_run_id::text,
    'fixture stale',v_run_id,now()+interval '1 hour','{}'::jsonb
  );
  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='transactional_messages' and is_active=true;
  select * into v_claim
  from public.claim_transactional_message_batch(v_token,1,120);
  if v_outbox_id is null or v_claim.id is null
     or v_claim.id is distinct from v_outbox_id then
    raise exception 'outbox_stale_claim_failed: target=%, claimed=%',
      v_outbox_id,v_claim.id;
  end if;
  update public.sanad_transactional_message_outbox
  set lease_expires_at=now()-interval '1 second'
  where id=v_outbox_id;
  v_recovered:=private.recover_stale_transactional_messages();
  select to_jsonb(o) into v_recovery_state
  from public.sanad_transactional_message_outbox o
  where id=v_outbox_id;
  if v_recovered<1 or not exists(
    select 1 from public.sanad_transactional_message_outbox
    where id=v_outbox_id and status='retry_scheduled'
      and last_error_code='outbox_lease_expired'
  ) then
    raise exception 'outbox_stale_recovery_failed: count=%, state=%',
      v_recovered,v_recovery_state;
  end if;

  update public.sanad_transactional_message_outbox
  set service_window_expires_at=now()-interval '1 second',
      next_attempt_at=now()-interval '1 second'
  where id=v_outbox_id;
  v_recovered:=private.recover_stale_transactional_messages();
  select to_jsonb(o) into v_recovery_state
  from public.sanad_transactional_message_outbox o
  where id=v_outbox_id;
  if v_recovered<1 or not exists(
    select 1 from public.sanad_transactional_message_outbox
    where id=v_outbox_id and status='failed'
      and last_error_code='whatsapp_service_window_expired'
  ) then
    raise exception 'outbox_service_window_expiry_failed: count=%, state=%',
      v_recovered,v_recovery_state;
  end if;
end $$;

rollback;

select 'operation_pipeline_failure_recovery_integration_passed_rolled_back' as result;

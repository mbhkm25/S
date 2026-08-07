begin;

-- Isolated-branch-only fixture. No HTTP dispatch or durable fixture survives.
update private.pipeline_runtime_config
set environment='integration_test',dispatch_enabled=false,updated_at=now()
where singleton=true;

select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  v_operation_id uuid;
  v_pipeline_run_id uuid:=gen_random_uuid();
  v_business_id uuid:=gen_random_uuid();
  v_account_id uuid;
  v_identifier text:='PIPE'||replace(gen_random_uuid()::text,'-','');
  v_routing_token text;
  v_routing_claim record;
  v_routing_result jsonb;
  v_replay_result jsonb;
begin
  insert into public.business_financial_accounts(
    business_id,financial_entity_code,account_holder_name,routing_enabled,
    verification_status,status
  ) values(
    v_business_id,'kuraimi_yer','Pipeline Routing Fixture',true,
    'verified','active'
  ) returning id into v_account_id;

  insert into public.business_financial_identifiers(
    financial_account_id,identifier_type,identifier_value,currency,is_primary,
    routing_enabled,verification_status,status
  ) values(
    v_account_id,'account_number',v_identifier,'YER',true,true,
    'verified','active'
  );

  insert into public.operations(
    public_token,source,upload_origin,file_bucket,storage_metadata,
    original_file_status,status,ai_status,structured_data,currency,
    financial_entity_code,credited_account,preview_status,pipeline_run_id
  ) values(
    gen_random_uuid(),'api','pipeline_integration','operation-files',
    jsonb_build_object('fixture','routing_outbox'),
    'stored','stored','pending',
    jsonb_build_object('is_financial_document',true),
    'YER','kuraimi_yer',v_identifier,'not_required',v_pipeline_run_id
  ) returning id into v_operation_id;

  update public.operations
  set ai_status='completed',analysis_completed_at=now(),status='ready',
      updated_at=now()
  where id=v_operation_id;

  if (
    select count(*) from private.operation_routing_jobs
    where operation_id=v_operation_id and status='queued'
  )<>1 then
    raise exception 'analysis_completion_did_not_enqueue_one_routing_job';
  end if;

  select token_value into v_routing_token
  from private.sanad_worker_tokens
  where worker_name='operation_routing' and is_active=true;

  select * into v_routing_claim
  from public.claim_operation_routing_jobs(v_routing_token,1,120);
  if v_routing_claim.operation_id is distinct from v_operation_id
     or v_routing_claim.claim_token is null then
    raise exception 'routing_claim_failed';
  end if;

  v_routing_result:=public.execute_operation_routing_job(
    v_routing_token,v_routing_claim.job_id,v_routing_claim.claim_token
  );
  if v_routing_result->>'route_status'<>'routed'
     or v_routing_result->>'route_source'<>'exact_identifier' then
    raise exception 'exact_first_routing_failed: %',v_routing_result;
  end if;

  if (
    select count(*) from public.business_payment_inbox
    where operation_id=v_operation_id
  )<>1 then
    raise exception 'payment_inbox_projection_cardinality_failed';
  end if;
  if not exists(
    select 1 from public.business_payment_inbox
    where operation_id=v_operation_id and business_id=v_business_id
      and financial_account_id=v_account_id and status='new'
      and source_mode='live' and match_score=1.0
      and routing_snapshot->>'pipeline_run_id'=v_pipeline_run_id::text
  ) then
    raise exception 'verified_exact_route_projection_contract_failed';
  end if;

  v_replay_result:=private.route_operation_by_exact_identifier(v_operation_id);
  if not coalesce((v_replay_result->>'ok')::boolean,false)
     or coalesce((v_replay_result->>'created')::boolean,true)
     or (
       select count(*) from public.business_payment_inbox
       where operation_id=v_operation_id
     )<>1 then
    raise exception 'routing_replay_not_idempotent: %',v_replay_result;
  end if;

  update public.operations set ai_status='pending' where id=v_operation_id;
  update public.operations set ai_status='completed' where id=v_operation_id;
  if (
    select count(*) from private.operation_routing_jobs
    where operation_id=v_operation_id
  )<>1 then
    raise exception 'routing_job_reenqueue_created_duplicate';
  end if;
end $$;

do $$
declare
  v_run_id uuid:=gen_random_uuid();
  v_outbox_id uuid;
  v_retry_id uuid;
  v_worker_token text;
  v_claim record;
  v_state text;
  v_message_id text:='wamid.pipeline.outbox.'||replace(gen_random_uuid()::text,'-','');
begin
  v_outbox_id:=private.enqueue_transactional_text_message(
    'operation_analysis_failed','967700000005','pipeline_fixture',
    v_run_id::text,'pipeline_outbox_lifecycle:'||v_run_id::text,
    'fixture lifecycle',v_run_id,now()+interval '1 hour','{}'::jsonb
  );
  if v_outbox_id is null then
    raise exception 'outbox_lifecycle_enqueue_failed';
  end if;

  select token_value into v_worker_token
  from private.sanad_worker_tokens
  where worker_name='transactional_messages' and is_active=true;

  select * into v_claim
  from public.claim_transactional_message_batch(v_worker_token,1,120);
  if v_claim.id is distinct from v_outbox_id or v_claim.claim_token is null then
    raise exception 'outbox_claim_failed';
  end if;

  v_state:=public.mark_transactional_message_result_v2(
    v_worker_token,v_claim.id,v_claim.claim_token,true,false,
    v_message_id,null,null
  );
  if v_state<>'completed' then
    raise exception 'outbox_send_completion_failed: %',v_state;
  end if;
  if not public.apply_transactional_whatsapp_delivery_status(
    v_message_id,'delivered',now(),null
  ) or not public.apply_transactional_whatsapp_delivery_status(
    v_message_id,'read',now(),null
  ) then
    raise exception 'outbox_delivery_webhook_not_applied';
  end if;
  if not exists(
    select 1 from public.sanad_transactional_message_outbox
    where id=v_outbox_id and status='completed' and delivery_status='read'
      and external_message_id=v_message_id and sent_at is not null
      and delivered_at is not null and read_at is not null
      and completed_at is not null
  ) then
    raise exception 'outbox_delivery_lifecycle_contract_failed';
  end if;

  v_retry_id:=private.enqueue_transactional_text_message(
    'operation_analysis_failed','967700000006','pipeline_fixture',
    v_run_id::text,'pipeline_outbox_retry:'||v_run_id::text,
    'fixture retry',v_run_id,now()+interval '1 hour','{}'::jsonb
  );
  select * into v_claim
  from public.claim_transactional_message_batch(v_worker_token,1,120);
  if v_claim.id is distinct from v_retry_id then
    raise exception 'outbox_retry_claim_failed';
  end if;
  v_state:=public.mark_transactional_message_result_v2(
    v_worker_token,v_claim.id,v_claim.claim_token,false,true,
    null,'fixture_retryable','Injected retryable outbox failure'
  );
  if v_state<>'retry_scheduled' or not exists(
    select 1 from public.sanad_transactional_message_outbox
    where id=v_retry_id and status='retry_scheduled' and attempt_count=1
      and next_attempt_at>now() and last_error_code='fixture_retryable'
  ) then
    raise exception 'outbox_retry_contract_failed: %',v_state;
  end if;
end $$;

do $$
declare
  v_health jsonb;
begin
  v_health:=public.get_operation_pipeline_health(24);
  if jsonb_typeof(v_health)<>'object'
     or not (v_health ? 'queues')
     or not (v_health ? 'invariants')
     or not (v_health ? 'generated_at') then
    raise exception 'pipeline_health_contract_failed: %',v_health;
  end if;
end $$;

do $$
declare
  v_denied boolean:=false;
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.get_operation_pipeline_health(24);
  exception when insufficient_privilege then
    v_denied:=true;
  end;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  if not v_denied then
    raise exception 'pipeline_health_non_admin_access_not_rejected';
  end if;
end $$;

rollback;

select 'operation_pipeline_routing_outbox_integration_passed_rolled_back' as result;

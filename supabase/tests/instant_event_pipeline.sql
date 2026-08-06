begin;

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'private.whatsapp_operation_intakes',
    'private.pipeline_runtime_config',
    'private.operation_analysis_jobs',
    'private.operation_media_preview_jobs',
    'private.operation_routing_jobs',
    'public.sanad_transactional_message_outbox'
  ] loop
    if to_regclass(v_table) is null then
      raise exception 'missing durable pipeline table: %',v_table;
    end if;
  end loop;

  foreach v_table in array array[
    'whatsapp_operation_intakes',
    'operation_analysis_jobs',
    'operation_media_preview_jobs',
    'operation_routing_jobs',
    'sanad_transactional_message_outbox'
  ] loop
    select pg_get_constraintdef(c.oid) into v_constraint
    from pg_constraint c
    join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace
    where r.relname=v_table and c.contype='c'
      and pg_get_constraintdef(c.oid) like '%queued%processing%completed%';
    if v_constraint is null
       or v_constraint not like '%retry_scheduled%'
       or v_constraint not like '%dead_letter%'
       or v_constraint like '%cancelled%' then
      raise exception 'canonical queue status constraint missing: %',v_table;
    end if;
  end loop;

  if has_table_privilege(
    'authenticated','private.whatsapp_operation_intakes','SELECT'
  ) or has_table_privilege(
    'authenticated','private.operation_routing_jobs','SELECT'
  ) then
    raise exception 'durable pipeline internals must remain private';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1 from pg_indexes
    where schemaname='public' and tablename='operations'
      and indexname='operations_whatsapp_message_id_key'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'WhatsApp message id uniqueness invariant missing';
  end if;
  if not exists(
    select 1 from pg_indexes
    where schemaname='public' and tablename='business_payment_inbox'
      and indexname='business_payment_inbox_operation_id_key'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'payment inbox operation uniqueness invariant missing';
  end if;
  if not exists(
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='sanad_transactional_outbox_dedupe_key'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'transactional outbox dedupe invariant missing';
  end if;
end $$;

do $$
declare
  v_definition text;
begin
  if exists(
    select 1 from pg_trigger
    where tgrelid='public.operations'::regclass
      and tgname in(
        'operations_exact_identifier_routing',
        'trg_run_operation_routing_shadow_v2'
      ) and not tgisinternal
  ) then
    raise exception 'competing synchronous routing trigger still active';
  end if;
  if not exists(
    select 1 from pg_trigger
    where tgrelid='public.operations'::regclass
      and tgname='operations_enqueue_routing_job' and not tgisinternal
  ) then
    raise exception 'single routing enqueue trigger missing';
  end if;

  select pg_get_functiondef('app.after_operation_insert_link_uploader()'::regprocedure)
  into v_definition;
  if v_definition like '%''qr_created''%' then
    raise exception 'operation insert trigger must not claim external QR delivery';
  end if;
end $$;

do $$
declare
  v_ai_constraint text;
begin
  select pg_get_constraintdef(oid) into v_ai_constraint
  from pg_constraint
  where conrelid='public.operations'::regclass
    and conname='operations_ai_status_check';
  if v_ai_constraint like '%queued%' then
    raise exception 'operations.ai_status must not contain queue states';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_whatsapp_operation_intake(text,uuid,text,text,text,text,jsonb,integer)',
    'EXECUTE'
  ) then
    raise exception 'service role cannot claim WhatsApp intake';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.complete_whatsapp_operation_intake(text,uuid,text,text,jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.complete_whatsapp_operation_intake(text,uuid,text,text,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'WhatsApp intake completion privilege boundary is invalid';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.claim_operation_routing_jobs(text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can claim routing jobs';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.claim_transactional_message_batch(text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can claim transactional messages';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='private'
      and table_name='operation_media_preview_jobs'
      and column_name='claim_token' and data_type='uuid'
  ) then
    raise exception 'preview queue claim ownership token missing';
  end if;
  if to_regprocedure(
    'public.complete_operation_media_preview_job_v2(text,uuid,uuid,text,text,bigint,integer,integer,text,jsonb)'
  ) is null then
    raise exception 'preview completion ownership contract missing';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='private' and table_name='whatsapp_operation_intakes'
      and column_name='duplicate_claim_count'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='sanad_transactional_message_outbox'
      and column_name='duplicate_suppressed_count'
  ) then
    raise exception 'duplicate suppression counters missing';
  end if;
end $$;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'sanad-operation-analysis-dispatch',
    'sanad-operation-media-previews',
    'sanad-operation-routing-dispatch',
    'sanad-transactional-message-dispatch',
    'sanad-whatsapp-operation-intake-recovery'
  ] loop
    if not exists(select 1 from cron.job where jobname=v_name) then
      raise exception 'pipeline recovery cron missing: %',v_name;
    end if;
  end loop;

  if to_regprocedure('public.get_operation_pipeline_health(integer)') is null then
    raise exception 'pipeline health RPC missing';
  end if;
  if to_regclass('private.pipeline_queue_observations') is null then
    raise exception 'pipeline queue observation view missing';
  end if;

  foreach v_name in array array[
    'whatsapp_intake',
    'operation_media_preview',
    'operation_routing',
    'transactional_messages'
  ] loop
    if not exists(
      select 1
      from private.sanad_worker_tokens
      where worker_name=v_name and is_active=true
        and nullif(token_value,'') is not null
    ) then
      raise exception 'active pipeline worker token missing: %',v_name;
    end if;
  end loop;
end $$;

rollback;

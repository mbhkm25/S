begin;

-- One operation can have at most one operational payment-inbox destination.
-- Existing data was audited before this migration and contains no conflicts.
create unique index if not exists business_payment_inbox_operation_id_key
  on public.business_payment_inbox(operation_id);

create or replace function private.upsert_business_payment_inbox_system(
  p_business_id uuid,
  p_operation_id uuid,
  p_shadow_run_id uuid,
  p_financial_account_id uuid,
  p_source_mode text,
  p_initial_status text,
  p_match_score numeric,
  p_match_strategy text,
  p_routing_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item public.business_payment_inbox%rowtype;
  v_created boolean:=false;
  v_pipeline_run_id uuid;
begin
  if p_business_id is null or p_operation_id is null then
    raise exception 'inbox_destination_required';
  end if;
  if p_initial_status not in ('new','review_required') then
    raise exception 'invalid_initial_inbox_status';
  end if;

  select pipeline_run_id into v_pipeline_run_id
  from public.operations
  where id=p_operation_id;
  if not found then raise exception 'operation_not_found' using errcode='P0002'; end if;

  insert into public.business_payment_inbox(
    business_id,operation_id,routing_shadow_run_id,financial_account_id,
    source_mode,status,priority,match_score,match_strategy,routing_snapshot
  ) values(
    p_business_id,p_operation_id,p_shadow_run_id,p_financial_account_id,
    p_source_mode,p_initial_status,
    case when p_initial_status='review_required' then 95 else 90 end,
    p_match_score,left(p_match_strategy,120),
    coalesce(p_routing_snapshot,'{}'::jsonb)
      || jsonb_build_object('pipeline_run_id',v_pipeline_run_id)
  )
  on conflict(operation_id) do nothing
  returning * into v_item;

  v_created:=v_item.id is not null;
  if not v_created then
    select * into v_item
    from public.business_payment_inbox
    where operation_id=p_operation_id;
  end if;

  if v_created then
    perform private.record_business_payment_inbox_event(
      v_item.id,'enqueued',null,null,p_initial_status,'routing_pipeline',
      jsonb_build_object(
        'source_mode',p_source_mode,
        'shadow_run_id',p_shadow_run_id,
        'pipeline_run_id',v_pipeline_run_id,
        'duplicate_suppressed',false
      )
    );
    if p_initial_status='review_required' then
      perform private.notify_business_payment_review_required(v_item.id);
    else
      perform private.notify_business_payment_inbox(v_item.id);
    end if;
  end if;

  return v_item.id;
end;
$function$;

revoke all on function private.upsert_business_payment_inbox_system(uuid,uuid,uuid,uuid,text,text,numeric,text,jsonb)
  from public,anon,authenticated;

create or replace function private.enqueue_business_payment_inbox_system(
  p_business_id uuid,
  p_operation_id uuid,
  p_shadow_run_id uuid,
  p_financial_account_id uuid,
  p_source_mode text,
  p_match_score numeric,
  p_match_strategy text,
  p_routing_snapshot jsonb
) returns uuid
language sql
security definer
set search_path=''
as $function$
  select private.upsert_business_payment_inbox_system(
    p_business_id,p_operation_id,p_shadow_run_id,p_financial_account_id,
    p_source_mode,'new',p_match_score,p_match_strategy,p_routing_snapshot
  );
$function$;

revoke all on function private.enqueue_business_payment_inbox_system(uuid,uuid,uuid,uuid,text,numeric,text,jsonb)
  from public,anon,authenticated;

create or replace function private.route_operation_by_exact_identifier(
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_operation public.operations%rowtype;
  v_identifier text;
  v_business_id uuid;
  v_account_id uuid;
  v_account_verified text;
  v_identifier_verified text;
  v_candidate_count integer;
  v_inbox_id uuid;
  v_status text;
  v_source_mode text;
begin
  select * into v_operation
  from public.operations
  where id=p_operation_id;
  if not found or v_operation.ai_status<>'completed' then
    return jsonb_build_object('ok',false,'reason','analysis_not_completed');
  end if;

  select id,status into v_inbox_id,v_status
  from public.business_payment_inbox
  where operation_id=p_operation_id;
  if v_inbox_id is not null then
    return jsonb_build_object(
      'ok',true,'created',false,'item_id',v_inbox_id,'status',v_status,
      'reason','operation_already_routed'
    );
  end if;

  v_identifier:=coalesce(
    nullif(v_operation.credited_account_normalized,''),
    nullif(v_operation.receiver_account_normalized,''),
    nullif(v_operation.document_account_normalized,'')
  );
  if v_identifier is null then
    return jsonb_build_object('ok',false,'reason','credited_identifier_missing');
  end if;

  with candidates as(
    select distinct on(fa.business_id)
      fa.business_id,fa.id account_id,
      fa.verification_status account_verified,
      fi.verification_status identifier_verified
    from public.business_financial_identifiers fi
    join public.business_financial_accounts fa
      on fa.id=fi.financial_account_id
    where fi.identifier_value_normalized=v_identifier
      and fi.status='active' and fi.routing_enabled=true
      and fa.status='active' and fa.routing_enabled=true
      and(fi.currency is null
        or upper(fi.currency)=upper(coalesce(v_operation.currency,'')))
    order by fa.business_id,fi.is_primary desc,fi.created_at asc
  )
  select count(*),(array_agg(business_id))[1],(array_agg(account_id))[1],
         (array_agg(account_verified))[1],(array_agg(identifier_verified))[1]
  into v_candidate_count,v_business_id,v_account_id,
       v_account_verified,v_identifier_verified
  from candidates;

  if v_candidate_count<>1 or v_business_id is null then
    return jsonb_build_object(
      'ok',false,
      'reason',case when v_candidate_count=0
        then 'exact_identifier_not_found' else 'exact_identifier_ambiguous' end,
      'candidate_count',v_candidate_count
    );
  end if;

  v_status:=case
    when v_account_verified='verified' and v_identifier_verified='verified'
      then 'new'
    else 'review_required'
  end;
  v_source_mode:=case when v_status='new' then 'live' else 'canary' end;
  v_inbox_id:=private.upsert_business_payment_inbox_system(
    v_business_id,p_operation_id,null,v_account_id,v_source_mode,v_status,1.0,
    case when v_status='new'
      then 'exact_credited_identifier'
      else 'exact_credited_identifier_unverified' end,
    jsonb_build_object(
      'identifier',v_identifier,
      'entity_code',v_operation.financial_entity_code,
      'entity_mismatch_warning',v_operation.financial_entity_code is distinct from(
        select financial_entity_code
        from public.business_financial_accounts
        where id=v_account_id
      ),
      'routing_precedence','exact_identifier_first',
      'verification_required',v_status='review_required'
    )
  );

  return jsonb_build_object(
    'ok',true,'created',true,'item_id',v_inbox_id,'status',v_status,
    'business_id',v_business_id,'financial_account_id',v_account_id,
    'route_source','exact_identifier'
  );
end;
$function$;

revoke all on function private.route_operation_by_exact_identifier(uuid)
  from public,anon,authenticated;

create table private.operation_routing_jobs(
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.operations(id) on delete cascade,
  pipeline_run_id uuid,
  source text not null default 'analysis_completed',
  status text not null default 'queued'
    check(status in(
      'queued','processing','completed','retry_scheduled','failed','dead_letter'
    )),
  attempt_count integer not null default 0 check(attempt_count>=0),
  max_attempts integer not null default 4 check(max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  claim_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb check(jsonb_typeof(result)='object'),
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.operation_routing_jobs enable row level security;
revoke all on table private.operation_routing_jobs from public,anon,authenticated;

create index operation_routing_jobs_due_idx
  on private.operation_routing_jobs(status,available_at,created_at)
  where status in('queued','retry_scheduled');
create index operation_routing_jobs_lease_idx
  on private.operation_routing_jobs(lease_expires_at)
  where status='processing';
create index operation_routing_jobs_pipeline_run_idx
  on private.operation_routing_jobs(pipeline_run_id)
  where pipeline_run_id is not null;

insert into private.sanad_worker_tokens(
  worker_name,token_value,is_active,created_at,updated_at
) values(
  'operation_routing',encode(gen_random_bytes(32),'hex'),true,now(),now()
)
on conflict(worker_name) do update
set is_active=true,updated_at=now();

create or replace function private.request_operation_routing_dispatch(
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
    select 1 from private.operation_routing_jobs
    where status in('queued','retry_scheduled')
      and available_at<=now() and attempt_count<max_attempts
  ) then return null; end if;

  if not private.acquire_pipeline_dispatch_lease('operation_routing',5,p_reason) then
    return null;
  end if;

  v_url:=private.pipeline_edge_function_url('sanad-operation-routing-worker');
  if v_url is null then return null; end if;

  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='operation_routing' and is_active=true;
  if v_token is null then
    update private.pipeline_dispatch_leases
    set last_error='worker_token_missing',updated_at=now()
    where queue_name='operation_routing';
    return null;
  end if;

  begin
    select net.http_post(
      url:=v_url,
      headers:=jsonb_build_object(
        'content-type','application/json','x-sanad-worker-token',v_token
      ),
      body:=jsonb_build_object(
        'limit',5,'source','immediate_dispatch','reason',p_reason
      ),
      timeout_milliseconds:=55000
    ) into v_request_id;
    update private.pipeline_dispatch_leases
    set last_request_id=v_request_id,updated_at=now()
    where queue_name='operation_routing';
    return v_request_id;
  exception when others then
    update private.pipeline_dispatch_leases
    set last_error=left(sqlerrm,1000),lease_until=clock_timestamp(),updated_at=now()
    where queue_name='operation_routing';
    return null;
  end;
end;
$function$;

revoke all on function private.request_operation_routing_dispatch(text)
  from public,anon,authenticated;

create or replace function private.enqueue_operation_routing_job(
  p_operation_id uuid,
  p_pipeline_run_id uuid,
  p_source text default 'analysis_completed'
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job_id uuid;
begin
  insert into private.operation_routing_jobs(
    operation_id,pipeline_run_id,source,status,attempt_count,max_attempts,
    available_at,claim_token,lease_expires_at,started_at,completed_at,result,
    last_error_code,last_error_message,updated_at
  ) values(
    p_operation_id,p_pipeline_run_id,left(coalesce(p_source,'analysis_completed'),80),
    'queued',0,4,now(),null,null,null,null,'{}'::jsonb,null,null,now()
  )
  on conflict(operation_id) do update set
    pipeline_run_id=coalesce(excluded.pipeline_run_id,
      private.operation_routing_jobs.pipeline_run_id),
    source=excluded.source,status='queued',attempt_count=0,max_attempts=4,
    available_at=now(),claim_token=null,lease_expires_at=null,started_at=null,
    completed_at=null,result='{}'::jsonb,last_error_code=null,
    last_error_message=null,updated_at=now()
  returning id into v_job_id;

  perform private.request_operation_routing_dispatch('analysis_completed');
  return v_job_id;
end;
$function$;

revoke all on function private.enqueue_operation_routing_job(uuid,uuid,text)
  from public,anon,authenticated;

create or replace function private.enqueue_operation_routing_after_analysis()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.ai_status<>'completed' then
    return new;
  end if;
  if tg_op='INSERT' then
    perform private.enqueue_operation_routing_job(
      new.id,new.pipeline_run_id,'analysis_completed'
    );
  elsif old.ai_status is distinct from new.ai_status then
    perform private.enqueue_operation_routing_job(
      new.id,new.pipeline_run_id,'analysis_completed'
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists operations_exact_identifier_routing on public.operations;
drop trigger if exists trg_run_operation_routing_shadow_v2 on public.operations;
drop trigger if exists operations_enqueue_routing_job on public.operations;
create trigger operations_enqueue_routing_job
after insert or update of ai_status on public.operations
for each row
execute function private.enqueue_operation_routing_after_analysis();

revoke all on function private.enqueue_operation_routing_after_analysis()
  from public,anon,authenticated;

create or replace function private.recover_stale_operation_routing_jobs()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer:=0;
  v_exhausted integer:=0;
begin
  with recovered as(
    update private.operation_routing_jobs
    set status=case when attempt_count<max_attempts
          then 'retry_scheduled' else 'dead_letter' end,
        available_at=case when attempt_count<max_attempts
          then now()+make_interval(
            secs=>least(300,10*(power(2,greatest(attempt_count-1,0)))::integer)
              +floor(random()*6)::integer
          ) else available_at end,
        claim_token=null,lease_expires_at=null,
        last_error_code='routing_lease_expired',
        last_error_message='Routing worker lease expired before completion',
        updated_at=now()
    where status='processing' and lease_expires_at<now()
    returning id
  ) select count(*) into v_count from recovered;

  with exhausted as(
    update private.operation_routing_jobs
    set status='dead_letter',claim_token=null,lease_expires_at=null,
        last_error_code='routing_attempts_exhausted',
        last_error_message='Routing retry budget exhausted',updated_at=now()
    where status in('queued','retry_scheduled')
      and available_at<=now() and attempt_count>=max_attempts
    returning id
  ) select count(*) into v_exhausted from exhausted;

  return v_count+v_exhausted;
end;
$function$;

revoke all on function private.recover_stale_operation_routing_jobs()
  from public,anon,authenticated;

create or replace function public.claim_operation_routing_jobs(
  p_worker_token text,
  p_limit integer default 5,
  p_lease_seconds integer default 120
) returns table(
  job_id uuid,
  operation_id uuid,
  claim_token uuid,
  attempt_count integer,
  max_attempts integer,
  pipeline_run_id uuid,
  source text
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from private.sanad_worker_tokens
    where worker_name='operation_routing' and is_active=true
      and token_value=p_worker_token
  ) then raise exception 'invalid_worker_token' using errcode='42501'; end if;

  perform private.recover_stale_operation_routing_jobs();
  perform private.release_pipeline_dispatch_lease_on_claim('operation_routing');

  return query
  with picked as(
    select j.id
    from private.operation_routing_jobs j
    where j.status in('queued','retry_scheduled')
      and j.available_at<=now() and j.attempt_count<j.max_attempts
    order by j.available_at,j.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),10))
  ),claimed as(
    update private.operation_routing_jobs j
    set status='processing',claim_token=gen_random_uuid(),
        attempt_count=j.attempt_count+1,
        lease_expires_at=now()+make_interval(
          secs=>greatest(30,least(coalesce(p_lease_seconds,120),300))
        ),
        started_at=now(),last_error_code=null,last_error_message=null,
        updated_at=now()
    from picked
    where j.id=picked.id
    returning j.*
  )
  select c.id,c.operation_id,c.claim_token,c.attempt_count,c.max_attempts,
         c.pipeline_run_id,c.source
  from claimed c;
end;
$function$;

create or replace function public.execute_operation_routing_job(
  p_worker_token text,
  p_job_id uuid,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job private.operation_routing_jobs%rowtype;
  v_operation public.operations%rowtype;
  v_exact jsonb;
  v_shadow jsonb;
  v_result jsonb;
begin
  if not exists(
    select 1 from private.sanad_worker_tokens
    where worker_name='operation_routing' and is_active=true
      and token_value=p_worker_token
  ) then raise exception 'invalid_worker_token' using errcode='42501'; end if;

  select * into v_job
  from private.operation_routing_jobs
  where id=p_job_id and status='processing' and claim_token=p_claim_token
  for update;
  if not found then return jsonb_build_object('ok',false,'state','not_owned'); end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_job.operation_id::text,0)
  );
  select * into v_operation
  from public.operations
  where id=v_job.operation_id;
  if not found then raise exception 'operation_not_found' using errcode='P0002'; end if;

  if v_operation.ai_status<>'completed' then
    v_result:=jsonb_build_object(
      'ok',true,'route_status','skipped_quality_gate',
      'reasons',jsonb_build_array('analysis_not_completed')
    );
  elsif coalesce(v_operation.possible_fraud,false) then
    v_result:=jsonb_build_object(
      'ok',true,'route_status','skipped_quality_gate',
      'reasons',jsonb_build_array('possible_fraud')
    );
  elsif coalesce(v_operation.structured_data->>'is_financial_document','true')='false' then
    v_result:=jsonb_build_object(
      'ok',true,'route_status','skipped_quality_gate',
      'reasons',jsonb_build_array('non_financial_document')
    );
  else
    v_exact:=private.route_operation_by_exact_identifier(v_job.operation_id);
    if coalesce((v_exact->>'ok')::boolean,false) then
      v_result:=jsonb_build_object(
        'ok',true,'route_status','routed','route_source','exact_identifier',
        'exact_result',v_exact
      );
    else
      v_shadow:=public.evaluate_operation_financial_routing_shadow(v_job.operation_id);
      v_result:=jsonb_build_object(
        'ok',true,
        'route_status',case when exists(
          select 1 from public.business_payment_inbox
          where operation_id=v_job.operation_id
        ) then 'routed' else 'not_routed' end,
        'route_source','routing_shadow',
        'exact_result',v_exact,'shadow_result',v_shadow
      );
    end if;
  end if;

  update private.operation_routing_jobs
  set status='completed',result=v_result,claim_token=null,lease_expires_at=null,
      completed_at=now(),last_error_code=null,last_error_message=null,
      updated_at=now()
  where id=v_job.id;
  return v_result||jsonb_build_object('job_id',v_job.id,'operation_id',v_job.operation_id);
end;
$function$;

create or replace function public.fail_operation_routing_job(
  p_worker_token text,
  p_job_id uuid,
  p_claim_token uuid,
  p_retryable boolean,
  p_error_code text,
  p_error_message text
) returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job private.operation_routing_jobs%rowtype;
  v_status text;
  v_delay integer:=0;
begin
  if not exists(
    select 1 from private.sanad_worker_tokens
    where worker_name='operation_routing' and is_active=true
      and token_value=p_worker_token
  ) then raise exception 'invalid_worker_token' using errcode='42501'; end if;

  select * into v_job
  from private.operation_routing_jobs
  where id=p_job_id and status='processing' and claim_token=p_claim_token
  for update;
  if not found then return 'not_owned'; end if;

  if p_retryable and v_job.attempt_count<v_job.max_attempts then
    v_status:='retry_scheduled';
    v_delay:=least(
      300,
      10*(power(2,greatest(v_job.attempt_count-1,0)))::integer
        +floor(random()*6)::integer
    );
  elsif p_retryable then v_status:='dead_letter';
  else v_status:='failed';
  end if;

  update private.operation_routing_jobs
  set status=v_status,
      available_at=case when v_status='retry_scheduled'
        then now()+make_interval(secs=>v_delay) else available_at end,
      claim_token=null,lease_expires_at=null,
      last_error_code=left(coalesce(p_error_code,'routing_error'),120),
      last_error_message=left(coalesce(p_error_message,'Routing failed'),2000),
      updated_at=now()
  where id=v_job.id;
  return v_status;
end;
$function$;

create or replace function public.request_operation_routing_dispatch(
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
  return private.request_operation_routing_dispatch(p_reason);
end;
$function$;

revoke all on function public.claim_operation_routing_jobs(text,integer,integer)
  from public,anon,authenticated;
revoke all on function public.execute_operation_routing_job(text,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.fail_operation_routing_job(text,uuid,uuid,boolean,text,text)
  from public,anon,authenticated;
revoke all on function public.request_operation_routing_dispatch(text)
  from public,anon,authenticated;
grant execute on function public.claim_operation_routing_jobs(text,integer,integer)
  to service_role;
grant execute on function public.execute_operation_routing_job(text,uuid,uuid)
  to service_role;
grant execute on function public.fail_operation_routing_job(text,uuid,uuid,boolean,text,text)
  to service_role;
grant execute on function public.request_operation_routing_dispatch(text)
  to service_role;

create or replace function private.dispatch_operation_routing_jobs()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.recover_stale_operation_routing_jobs();
  return private.request_operation_routing_dispatch('cron_backstop');
end;
$function$;

revoke all on function private.dispatch_operation_routing_jobs()
  from public,anon,authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='sanad-operation-routing-dispatch';
select cron.schedule(
  'sanad-operation-routing-dispatch','*/2 * * * *',
  'select private.dispatch_operation_routing_jobs();'
);

comment on table private.operation_routing_jobs is
'Single routing queue from analysis completion through quality gate to the idempotent payment inbox writer. No document download or re-analysis occurs here.';

commit;

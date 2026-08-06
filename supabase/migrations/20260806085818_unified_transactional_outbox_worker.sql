begin;

alter table public.sanad_transactional_message_rules
  drop constraint if exists sanad_transactional_rule_event_check;
alter table public.sanad_transactional_message_rules
  add constraint sanad_transactional_rule_event_check
  check(event_type in(
    'report_requested','report_ready','report_failed',
    'pro_payment_submitted','pro_payment_approved','pro_payment_rejected',
    'subscription_expiring','subscription_expired',
    'business_review_approved','business_review_rejected',
    'payment_inbox_new','payment_inbox_review_required',
    'operation_analysis_failed','operation_unmatched'
  ));

alter table public.sanad_transactional_message_rules
  add column if not exists delivery_kind text not null default 'template',
  add column if not exists body_template text;
alter table public.sanad_transactional_message_rules
  drop constraint if exists sanad_transactional_rule_delivery_kind_check;
alter table public.sanad_transactional_message_rules
  add constraint sanad_transactional_rule_delivery_kind_check
  check(delivery_kind in('template','text'));
alter table public.sanad_transactional_message_rules
  drop constraint if exists sanad_transactional_rule_delivery_content_check;
alter table public.sanad_transactional_message_rules
  add constraint sanad_transactional_rule_delivery_content_check
  check(
    not enabled
    or(delivery_kind='template' and template_name is not null)
    or(delivery_kind='text' and body_template is not null)
  );

insert into public.sanad_transactional_message_rules(
  event_type,display_name,description,enabled,delivery_kind,body_template,
  template_name,parameter_keys,max_attempts,created_at,updated_at
) values
(
  'operation_analysis_failed','تعذر تحليل إشعار واتساب',
  'رسالة خدمية داخل نافذة واتساب تؤكد بقاء الأصل والرابط.',true,'text',
  'تم استلام إشعارك وحفظه في سند ✅\n\nتعذر تحليل بياناته آليًا بوضوح، لكن الملف الأصلي ورابط التحقق ما زالا متاحين:\n{{verification_url}}\n\nسند لا يدّعي تحققًا بنكيًا.',
  null,'[]'::jsonb,4,now(),now()
),
(
  'operation_unmatched','لم تُطابق العملية نشاطًا',
  'رسالة خدمية داخل نافذة واتساب بعد اكتمال التحليل دون تطابق.',true,'text',
  'تم استلام إشعارك وتحليله في سند ✅\n\nلم نجد حسابًا ماليًا مسجلًا ومطابقًا تلقائيًا. يمكنك مشاركة الرابط أو عرض QR على الطرف الآخر لمراجعة المستند الأصلي:\n{{verification_url}}\n\nسند لا يدّعي تحققًا بنكيًا.',
  null,'[]'::jsonb,4,now(),now()
),
(
  'payment_inbox_new','عملية جديدة في وارد المدفوعات',
  'قالب واتساب اختياري بعد اعتماد القالب رسميًا.',false,'template',null,
  null,jsonb_build_array('full_name'),5,now(),now()
),
(
  'payment_inbox_review_required','عملية تحتاج مراجعة في وارد المدفوعات',
  'قالب واتساب اختياري بعد اعتماد القالب رسميًا.',false,'template',null,
  null,jsonb_build_array('full_name'),5,now(),now()
)
on conflict(event_type) do update set
  display_name=excluded.display_name,
  description=excluded.description,
  delivery_kind=excluded.delivery_kind,
  body_template=excluded.body_template,
  updated_at=now();

alter table public.sanad_transactional_message_outbox
  add column if not exists delivery_kind text not null default 'template',
  add column if not exists text_body text,
  add column if not exists dedupe_key text,
  add column if not exists duplicate_suppressed_count bigint not null default 0,
  add column if not exists pipeline_run_id uuid,
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists service_window_expires_at timestamptz,
  add column if not exists delivery_status text,
  add column if not exists last_error_code text;

alter table public.sanad_transactional_message_outbox
  alter column recipient_user_id drop not null,
  alter column template_name drop not null;

update public.sanad_transactional_message_outbox
set delivery_status=case status
  when 'sent' then 'sent'
  when 'delivered' then 'delivered'
  when 'read' then 'read'
  when 'failed' then 'failed'
  else delivery_status
end,
dedupe_key=coalesce(
  dedupe_key,
  event_type||':'||coalesce(recipient_user_id::text,phone_normalized)
    ||':'||source_type||':'||source_id
);

alter table public.sanad_transactional_message_outbox
  alter column dedupe_key set not null;

alter table public.sanad_transactional_message_outbox
  drop constraint if exists sanad_transactional_message_outbox_status_check;

update public.sanad_transactional_message_outbox
set status=case status
  when 'pending' then 'queued'
  when 'sent' then 'completed'
  when 'delivered' then 'completed'
  when 'read' then 'completed'
  when 'cancelled' then 'failed'
  else status
end,
completed_at=case when status in('sent','delivered','read')
  then coalesce(completed_at,sent_at,updated_at) else completed_at end;

alter table public.sanad_transactional_message_outbox
  add constraint sanad_transactional_message_outbox_status_check
  check(status in(
    'queued','processing','completed','retry_scheduled','failed','dead_letter'
  ));
alter table public.sanad_transactional_message_outbox
  drop constraint if exists sanad_transactional_message_outbox_delivery_kind_check;
alter table public.sanad_transactional_message_outbox
  add constraint sanad_transactional_message_outbox_delivery_kind_check
  check(delivery_kind in('template','text'));
alter table public.sanad_transactional_message_outbox
  drop constraint if exists sanad_transactional_message_outbox_delivery_content_check;
alter table public.sanad_transactional_message_outbox
  add constraint sanad_transactional_message_outbox_delivery_content_check
  check(
    (delivery_kind='template' and template_name is not null)
    or(delivery_kind='text' and text_body is not null)
  );
alter table public.sanad_transactional_message_outbox
  drop constraint if exists sanad_transactional_message_outbox_delivery_status_check;
alter table public.sanad_transactional_message_outbox
  add constraint sanad_transactional_message_outbox_delivery_status_check
  check(delivery_status is null or delivery_status in('sent','delivered','read','failed'));

create unique index if not exists sanad_transactional_outbox_dedupe_key
  on public.sanad_transactional_message_outbox(dedupe_key);
drop index if exists public.sanad_transactional_outbox_claim_idx;
create index sanad_transactional_outbox_claim_idx
  on public.sanad_transactional_message_outbox(status,next_attempt_at,created_at)
  where status in('queued','retry_scheduled');
create index if not exists sanad_transactional_outbox_lease_idx
  on public.sanad_transactional_message_outbox(lease_expires_at)
  where status='processing';
create index if not exists sanad_transactional_outbox_pipeline_run_idx
  on public.sanad_transactional_message_outbox(pipeline_run_id)
  where pipeline_run_id is not null;

insert into private.sanad_worker_tokens(
  worker_name,token_value,is_active,created_at,updated_at
) values(
  'transactional_messages',encode(gen_random_bytes(32),'hex'),true,now(),now()
)
on conflict(worker_name) do update
set is_active=true,updated_at=now();

create or replace function private.request_transactional_message_dispatch(
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
    select 1 from public.sanad_transactional_message_outbox
    where status in('queued','retry_scheduled')
      and next_attempt_at<=now() and attempt_count<max_attempts
      and(delivery_kind<>'text' or service_window_expires_at>now())
  ) then return null; end if;

  if not private.acquire_pipeline_dispatch_lease(
    'transactional_messages',5,p_reason
  ) then return null; end if;

  v_url:=private.pipeline_edge_function_url(
    'sanad-v3-transactional-message-worker'
  );
  if v_url is null then return null; end if;

  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='transactional_messages' and is_active=true;
  if v_token is null then
    update private.pipeline_dispatch_leases
    set last_error='worker_token_missing',updated_at=now()
    where queue_name='transactional_messages';
    return null;
  end if;

  begin
    select net.http_post(
      url:=v_url,
      headers:=jsonb_build_object(
        'content-type','application/json','x-sanad-worker-token',v_token
      ),
      body:=jsonb_build_object(
        'limit',25,'source','immediate_dispatch','reason',p_reason
      ),
      timeout_milliseconds:=55000
    ) into v_request_id;
    update private.pipeline_dispatch_leases
    set last_request_id=v_request_id,updated_at=now()
    where queue_name='transactional_messages';
    return v_request_id;
  exception when others then
    update private.pipeline_dispatch_leases
    set last_error=left(sqlerrm,1000),lease_until=clock_timestamp(),updated_at=now()
    where queue_name='transactional_messages';
    return null;
  end;
end;
$function$;

revoke all on function private.request_transactional_message_dispatch(text)
  from public,anon,authenticated;

create or replace function private.enqueue_transactional_text_message(
  p_event_type text,
  p_phone text,
  p_source_type text,
  p_source_id text,
  p_dedupe_key text,
  p_text_body text,
  p_pipeline_run_id uuid,
  p_service_window_expires_at timestamptz,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rule public.sanad_transactional_message_rules%rowtype;
  v_phone text;
  v_id uuid;
begin
  select * into v_rule
  from public.sanad_transactional_message_rules
  where event_type=p_event_type and enabled=true and delivery_kind='text';
  if not found then return null; end if;

  v_phone:=private.normalize_yemen_phone(p_phone);
  if v_phone is null then return null; end if;
  if p_service_window_expires_at is null
     or p_service_window_expires_at<=now() then return null; end if;

  insert into public.sanad_transactional_message_outbox(
    event_type,recipient_user_id,phone_normalized,source_type,source_id,
    notification_id,template_name,template_language,template_parameters,
    payload,status,attempt_count,max_attempts,next_attempt_at,delivery_kind,
    text_body,dedupe_key,pipeline_run_id,service_window_expires_at
  ) values(
    p_event_type,null,v_phone,left(coalesce(p_source_type,'operation'),100),
    left(p_source_id,255),null,null,'ar','[]'::jsonb,
    coalesce(p_payload,'{}'::jsonb),'queued',0,v_rule.max_attempts,now(),
    'text',p_text_body,left(p_dedupe_key,500),p_pipeline_run_id,
    p_service_window_expires_at
  )
  on conflict(dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    update public.sanad_transactional_message_outbox
    set duplicate_suppressed_count=duplicate_suppressed_count+1,
        updated_at=now()
    where dedupe_key=left(p_dedupe_key,500)
    returning id into v_id;
  else
    perform private.request_transactional_message_dispatch('text_message_enqueued');
  end if;
  return v_id;
end;
$function$;

revoke all on function private.enqueue_transactional_text_message(text,text,text,text,text,text,uuid,timestamptz,jsonb)
  from public,anon,authenticated;

create or replace function private.operation_sender_service_window(
  p_operation public.operations
) returns timestamptz
language plpgsql
stable
set search_path=''
as $function$
declare
  v_timestamp text;
begin
  v_timestamp:=nullif(p_operation.storage_metadata->>'whatsapp_timestamp','');
  if v_timestamp~'^[0-9]{9,13}$' then
    return to_timestamp(
      case when length(v_timestamp)>10
        then v_timestamp::numeric/1000 else v_timestamp::numeric end
    )+interval '24 hours';
  end if;
  return p_operation.created_at+interval '24 hours';
exception when others then
  return p_operation.created_at+interval '24 hours';
end;
$function$;

revoke all on function private.operation_sender_service_window(public.operations)
  from public,anon,authenticated;

create or replace function private.enqueue_failed_analysis_sender_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_url text;
  v_body text;
begin
  if new.source<>'whatsapp' or new.submitted_by_phone is null
     or new.public_token is null or new.ai_status<>'failed' then
    return new;
  end if;
  if tg_op='INSERT' then
    v_url:='https://app.sanadflow.com/v/'||new.public_token::text;
    select replace(body_template,'{{verification_url}}',v_url) into v_body
    from public.sanad_transactional_message_rules
    where event_type='operation_analysis_failed';
    perform private.enqueue_transactional_text_message(
      'operation_analysis_failed',new.submitted_by_phone,'operation',new.id::text,
      'operation_analysis_failed:'||new.id::text,v_body,new.pipeline_run_id,
      private.operation_sender_service_window(new),
      jsonb_build_object('operation_id',new.id,'public_token',new.public_token)
    );
  elsif old.ai_status is distinct from new.ai_status then
    v_url:='https://app.sanadflow.com/v/'||new.public_token::text;
    select replace(body_template,'{{verification_url}}',v_url) into v_body
    from public.sanad_transactional_message_rules
    where event_type='operation_analysis_failed';
    perform private.enqueue_transactional_text_message(
      'operation_analysis_failed',new.submitted_by_phone,'operation',new.id::text,
      'operation_analysis_failed:'||new.id::text,v_body,new.pipeline_run_id,
      private.operation_sender_service_window(new),
      jsonb_build_object('operation_id',new.id,'public_token',new.public_token)
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists operations_enqueue_failed_analysis_sender_message
  on public.operations;
create trigger operations_enqueue_failed_analysis_sender_message
after insert or update of ai_status on public.operations
for each row execute function private.enqueue_failed_analysis_sender_message();

revoke all on function private.enqueue_failed_analysis_sender_message()
  from public,anon,authenticated;

create or replace function private.enqueue_unmatched_operation_sender_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_operation public.operations%rowtype;
  v_url text;
  v_body text;
begin
  if new.status='completed'
     and old.status is distinct from new.status
     and new.result->>'route_status'='not_routed' then
    select * into v_operation
    from public.operations
    where id=new.operation_id;
    if v_operation.source='whatsapp'
       and v_operation.submitted_by_phone is not null
       and v_operation.public_token is not null then
      v_url:='https://app.sanadflow.com/v/'||v_operation.public_token::text;
      select replace(body_template,'{{verification_url}}',v_url) into v_body
      from public.sanad_transactional_message_rules
      where event_type='operation_unmatched';
      perform private.enqueue_transactional_text_message(
        'operation_unmatched',v_operation.submitted_by_phone,'operation',
        v_operation.id::text,'operation_unmatched:'||v_operation.id::text,
        v_body,v_operation.pipeline_run_id,
        private.operation_sender_service_window(v_operation),
        jsonb_build_object(
          'operation_id',v_operation.id,'public_token',v_operation.public_token,
          'routing_result',new.result
        )
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists routing_jobs_enqueue_unmatched_sender_message
  on private.operation_routing_jobs;
create trigger routing_jobs_enqueue_unmatched_sender_message
after update of status on private.operation_routing_jobs
for each row execute function private.enqueue_unmatched_operation_sender_message();

revoke all on function private.enqueue_unmatched_operation_sender_message()
  from public,anon,authenticated;

create or replace function private.enqueue_transactional_message_from_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rule public.sanad_transactional_message_rules%rowtype;
  v_profile public.profiles%rowtype;
  v_phone text;
  v_contact_status text;
  v_dedupe_key text;
  v_id uuid;
begin
  select * into v_rule
  from public.sanad_transactional_message_rules
  where event_type=new.notification_type and enabled=true;
  if not found then return new; end if;

  select * into v_profile
  from public.profiles
  where id=new.recipient_user_id and status='active';
  if not found then return new; end if;
  v_phone:=private.normalize_yemen_phone(v_profile.phone);
  if v_phone is null then return new; end if;
  select transactional_status into v_contact_status
  from public.sanad_whatsapp_contacts
  where phone_normalized=v_phone
  limit 1;
  if coalesce(v_contact_status,'active')<>'active' then return new; end if;

  if v_rule.delivery_kind='template' and v_rule.template_name is null then
    return new;
  end if;
  -- Free-form notification rules are intentionally not sent without an
  -- explicit service-window timestamp. Sender guidance uses the dedicated
  -- operation enqueue function above.
  if v_rule.delivery_kind='text' then return new; end if;

  v_dedupe_key:=new.notification_type||':'||new.recipient_user_id::text||':'
    ||coalesce(new.source_event_type,'notification')||':'
    ||coalesce(new.source_event_id,new.id::text);
  insert into public.sanad_transactional_message_outbox(
    event_type,recipient_user_id,phone_normalized,source_type,source_id,
    notification_id,template_name,template_language,template_parameters,
    payload,status,max_attempts,delivery_kind,dedupe_key,pipeline_run_id
  ) values(
    new.notification_type,new.recipient_user_id,v_phone,
    coalesce(new.source_event_type,'notification'),
    coalesce(new.source_event_id,new.id::text),new.id,v_rule.template_name,
    v_rule.template_language,
    private.render_transactional_parameters(v_rule.parameter_keys,v_profile,new),
    jsonb_build_object('title',new.title,'body',new.body,'data',new.data),
    'queued',v_rule.max_attempts,'template',v_dedupe_key,
    nullif(new.data->>'pipeline_run_id','')::uuid
  )
  on conflict(dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    update public.sanad_transactional_message_outbox
    set duplicate_suppressed_count=duplicate_suppressed_count+1,
        updated_at=now()
    where dedupe_key=v_dedupe_key;
  else
    perform private.request_transactional_message_dispatch('notification_enqueued');
  end if;
  return new;
exception when invalid_text_representation then
  return new;
end;
$function$;

revoke all on function private.enqueue_transactional_message_from_notification()
  from public,anon,authenticated;

drop trigger if exists trg_notifications_transactional_whatsapp
  on public.notifications;
create trigger trg_notifications_transactional_whatsapp
after insert on public.notifications
for each row execute function private.enqueue_transactional_message_from_notification();

create or replace function private.recover_stale_transactional_messages()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer:=0;
  v_expired integer:=0;
begin
  with recovered as(
    update public.sanad_transactional_message_outbox
    set status=case when attempt_count<max_attempts
          then 'retry_scheduled' else 'dead_letter' end,
        next_attempt_at=case when attempt_count<max_attempts
          then now()+make_interval(
            secs=>least(1800,30*(power(2,greatest(attempt_count-1,0)))::integer)
              +floor(random()*16)::integer
          ) else next_attempt_at end,
        claim_token=null,lease_expires_at=null,
        last_error_code='outbox_lease_expired',
        last_error='Transactional message worker lease expired',updated_at=now()
    where status='processing' and lease_expires_at<now()
    returning id
  ) select count(*) into v_count from recovered;

  with expired as(
    update public.sanad_transactional_message_outbox
    set status='failed',last_error_code='whatsapp_service_window_expired',
        last_error='Free-form WhatsApp service window expired before delivery',
        failed_at=now(),updated_at=now()
    where status in('queued','retry_scheduled') and delivery_kind='text'
      and service_window_expires_at<=now()
    returning id
  ) select count(*) into v_expired from expired;
  return v_count+v_expired;
end;
$function$;

revoke all on function private.recover_stale_transactional_messages()
  from public,anon,authenticated;

drop function if exists public.claim_transactional_message_batch(integer);
create function public.claim_transactional_message_batch(
  p_worker_token text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
) returns table(
  id uuid,
  claim_token uuid,
  phone text,
  delivery_kind text,
  template_name text,
  template_language text,
  template_parameters jsonb,
  text_body text,
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
    select 1 from private.sanad_worker_tokens
    where worker_name='transactional_messages' and is_active=true
      and token_value=p_worker_token
  ) then raise exception 'invalid_worker_token' using errcode='42501'; end if;

  perform private.recover_stale_transactional_messages();
  perform private.release_pipeline_dispatch_lease_on_claim(
    'transactional_messages'
  );
  return query
  with candidates as(
    select o.id
    from public.sanad_transactional_message_outbox o
    where o.status in('queued','retry_scheduled')
      and o.next_attempt_at<=now() and o.attempt_count<o.max_attempts
      and(o.delivery_kind<>'text' or o.service_window_expires_at>now())
    order by o.next_attempt_at,o.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ),claimed as(
    update public.sanad_transactional_message_outbox o
    set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),
        lease_expires_at=now()+make_interval(
          secs=>greatest(30,least(coalesce(p_lease_seconds,120),300))
        ),
        started_at=now(),attempt_count=o.attempt_count+1,
        last_error_code=null,updated_at=now()
    from candidates c
    where o.id=c.id
    returning o.*
  )
  select c.id,c.claim_token,c.phone_normalized,c.delivery_kind,c.template_name,
         c.template_language,c.template_parameters,c.text_body,
         c.attempt_count,c.max_attempts,c.pipeline_run_id
  from claimed c;
end;
$function$;

create or replace function public.mark_transactional_message_result_v2(
  p_worker_token text,
  p_id uuid,
  p_claim_token uuid,
  p_sent boolean,
  p_retryable boolean,
  p_message_id text default null,
  p_error_code text default null,
  p_error text default null
) returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item public.sanad_transactional_message_outbox%rowtype;
  v_status text;
  v_delay integer:=0;
begin
  if not exists(
    select 1 from private.sanad_worker_tokens
    where worker_name='transactional_messages' and is_active=true
      and token_value=p_worker_token
  ) then raise exception 'invalid_worker_token' using errcode='42501'; end if;

  select * into v_item
  from public.sanad_transactional_message_outbox
  where id=p_id and status='processing' and claim_token=p_claim_token
  for update;
  if not found then return 'not_owned'; end if;

  if p_sent then
    update public.sanad_transactional_message_outbox
    set status='completed',delivery_status='sent',external_message_id=p_message_id,
        sent_at=now(),completed_at=now(),claim_token=null,lease_expires_at=null,
        last_error=null,last_error_code=null,updated_at=now()
    where id=v_item.id;
    return 'completed';
  end if;

  if p_retryable and v_item.attempt_count<v_item.max_attempts
     and(v_item.delivery_kind<>'text'
       or v_item.service_window_expires_at>now()+interval '30 seconds') then
    v_status:='retry_scheduled';
    v_delay:=least(
      1800,
      30*(power(2,greatest(v_item.attempt_count-1,0)))::integer
        +floor(random()*16)::integer
    );
  elsif p_retryable then v_status:='dead_letter';
  else v_status:='failed';
  end if;

  update public.sanad_transactional_message_outbox
  set status=v_status,
      next_attempt_at=case when v_status='retry_scheduled'
        then now()+make_interval(secs=>v_delay) else next_attempt_at end,
      claim_token=null,lease_expires_at=null,delivery_status='failed',
      last_error_code=left(coalesce(p_error_code,'message_delivery_failed'),120),
      last_error=left(coalesce(p_error,'Message delivery failed'),1000),
      failed_at=case when v_status in('failed','dead_letter') then now() else failed_at end,
      updated_at=now()
  where id=v_item.id;
  return v_status;
end;
$function$;

create or replace function public.mark_transactional_message_result(
  p_id uuid,
  p_status text,
  p_message_id text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item public.sanad_transactional_message_outbox%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'forbidden'; end if;
  select * into v_item
  from public.sanad_transactional_message_outbox
  where id=p_id
  for update;
  if not found then raise exception 'message_not_found'; end if;
  if p_status='sent' then
    update public.sanad_transactional_message_outbox
    set status='completed',delivery_status='sent',external_message_id=p_message_id,
        sent_at=now(),completed_at=now(),claim_token=null,lease_expires_at=null,
        last_error=null,last_error_code=null,updated_at=now()
    where id=p_id;
  else
    update public.sanad_transactional_message_outbox
    set status=case when attempt_count>=max_attempts
          then 'dead_letter' else 'retry_scheduled' end,
        next_attempt_at=now()+make_interval(
          secs=>least(1800,30*(power(2,greatest(attempt_count-1,0)))::integer)
        ),
        claim_token=null,lease_expires_at=null,delivery_status='failed',
        last_error=left(coalesce(p_error,'unknown_error'),1000),
        last_error_code='legacy_worker_failure',updated_at=now()
    where id=p_id;
  end if;
end;
$function$;

create or replace function public.apply_transactional_whatsapp_delivery_status(
  p_message_id text,
  p_status text,
  p_event_at timestamptz default now(),
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_count integer;
begin
  update public.sanad_transactional_message_outbox
  set delivery_status=case when v_status in('sent','delivered','read','failed')
        then v_status else delivery_status end,
      delivered_at=case when v_status='delivered'
        then coalesce(delivered_at,p_event_at,now()) else delivered_at end,
      read_at=case when v_status='read'
        then coalesce(read_at,p_event_at,now()) else read_at end,
      failed_at=case when v_status='failed'
        then coalesce(failed_at,p_event_at,now()) else failed_at end,
      last_error=case when v_status='failed'
        then left(coalesce(p_error,last_error),1000) else last_error end,
      updated_at=now()
  where external_message_id=p_message_id;
  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$;

create or replace function public.request_transactional_message_dispatch(
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
  return private.request_transactional_message_dispatch(p_reason);
end;
$function$;

create or replace function public.get_transactional_worker_token_for_admin(
  p_user_id uuid
) returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_user_id is null or not public.is_platform_admin(p_user_id) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  select token_value into v_token
  from private.sanad_worker_tokens
  where worker_name='transactional_messages' and is_active=true;
  if v_token is null then raise exception 'worker_token_unavailable'; end if;
  return v_token;
end;
$function$;

revoke all on function public.claim_transactional_message_batch(text,integer,integer)
  from public,anon,authenticated;
revoke all on function public.mark_transactional_message_result_v2(text,uuid,uuid,boolean,boolean,text,text,text)
  from public,anon,authenticated;
revoke all on function public.mark_transactional_message_result(uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.apply_transactional_whatsapp_delivery_status(text,text,timestamptz,text)
  from public,anon,authenticated;
revoke all on function public.request_transactional_message_dispatch(text)
  from public,anon,authenticated;
revoke all on function public.get_transactional_worker_token_for_admin(uuid)
  from public,anon,authenticated;
grant execute on function public.claim_transactional_message_batch(text,integer,integer)
  to service_role;
grant execute on function public.mark_transactional_message_result_v2(text,uuid,uuid,boolean,boolean,text,text,text)
  to service_role;
grant execute on function public.mark_transactional_message_result(uuid,text,text,text)
  to service_role;
grant execute on function public.apply_transactional_whatsapp_delivery_status(text,text,timestamptz,text)
  to service_role;
grant execute on function public.request_transactional_message_dispatch(text)
  to service_role;
grant execute on function public.get_transactional_worker_token_for_admin(uuid)
  to service_role;

create or replace function public.platform_admin_retry_transactional_message(
  p_message_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then
    raise exception 'admin_reason_required';
  end if;
  update public.sanad_transactional_message_outbox
  set status='queued',attempt_count=0,next_attempt_at=now(),claimed_at=null,
      claim_token=null,lease_expires_at=null,last_error=null,last_error_code=null,
      updated_at=now()
  where id=p_message_id and status in('failed','dead_letter');
  if not found then raise exception 'failed_message_not_found'; end if;
  insert into public.platform_admin_audit_log(
    actor_user_id,action,target_type,target_id,reason
  ) values(
    auth.uid(),'transactional_message_retried','transactional_message',
    p_message_id::text,trim(p_reason)
  );
  perform private.request_transactional_message_dispatch('admin_retry');
end;
$function$;

revoke all on function public.platform_admin_retry_transactional_message(uuid,text)
  from public,anon;
grant execute on function public.platform_admin_retry_transactional_message(uuid,text)
  to authenticated,service_role;

create or replace function public.platform_admin_get_transactional_messages(
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'rules',(
      select coalesce(jsonb_agg(to_jsonb(r) order by r.event_type),'[]'::jsonb)
      from public.sanad_transactional_message_rules r
    ),
    'stats',jsonb_build_object(
      'queued',(select count(*) from public.sanad_transactional_message_outbox where status in('queued','retry_scheduled')),
      'processing',(select count(*) from public.sanad_transactional_message_outbox where status='processing'),
      'completed',(select count(*) from public.sanad_transactional_message_outbox where status='completed'),
      'failed',(select count(*) from public.sanad_transactional_message_outbox where status in('failed','dead_letter')),
      'delivered',(select count(*) from public.sanad_transactional_message_outbox where delivery_status in('delivered','read'))
    ),
    'messages',(
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
      from(
        select o.*,p.full_name
        from public.sanad_transactional_message_outbox o
        left join public.profiles p on p.id=o.recipient_user_id
        order by o.created_at desc
        limit greatest(1,least(coalesce(p_limit,100),300))
      ) x
    )
  );
end;
$function$;

revoke all on function public.platform_admin_get_transactional_messages(integer)
  from public,anon;
grant execute on function public.platform_admin_get_transactional_messages(integer)
  to authenticated,service_role;

create or replace function public.platform_admin_update_transactional_message_rule(
  p_event_type text,
  p_enabled boolean,
  p_template_name text,
  p_template_language text,
  p_parameter_keys jsonb,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rule public.sanad_transactional_message_rules%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then
    raise exception 'admin_reason_required';
  end if;
  if jsonb_typeof(coalesce(p_parameter_keys,'[]'::jsonb))<>'array' then
    raise exception 'invalid_parameter_keys';
  end if;

  select * into v_rule
  from public.sanad_transactional_message_rules
  where event_type=p_event_type
  for update;
  if not found then raise exception 'rule_not_found'; end if;
  if p_enabled and v_rule.delivery_kind='template'
     and trim(coalesce(p_template_name,''))!~'^[a-z0-9_]{1,512}$' then
    raise exception 'approved_template_required';
  end if;
  if p_enabled and v_rule.delivery_kind='text'
     and nullif(trim(coalesce(v_rule.body_template,'')),'') is null then
    raise exception 'text_body_required';
  end if;

  v_before:=to_jsonb(v_rule);
  update public.sanad_transactional_message_rules
  set enabled=coalesce(p_enabled,false),
      template_name=case when delivery_kind='template'
        then nullif(trim(p_template_name),'') else null end,
      template_language=coalesce(nullif(trim(p_template_language),''),'ar'),
      parameter_keys=coalesce(p_parameter_keys,'[]'::jsonb),
      updated_by=auth.uid(),updated_at=now()
  where event_type=p_event_type
  returning to_jsonb(public.sanad_transactional_message_rules.*) into v_after;

  insert into public.platform_admin_audit_log(
    actor_user_id,action,target_type,target_id,reason,before_data,after_data
  ) values(
    auth.uid(),'transactional_message_rule_updated',
    'transactional_message_rule',p_event_type,trim(p_reason),v_before,v_after
  );
end;
$function$;

revoke all on function public.platform_admin_update_transactional_message_rule(text,boolean,text,text,jsonb,text)
  from public,anon;
grant execute on function public.platform_admin_update_transactional_message_rule(text,boolean,text,text,jsonb,text)
  to authenticated,service_role;

create or replace function private.dispatch_transactional_messages()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.recover_stale_transactional_messages();
  return private.request_transactional_message_dispatch('cron_backstop');
end;
$function$;

revoke all on function private.dispatch_transactional_messages()
  from public,anon,authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='sanad-transactional-message-dispatch';
select cron.schedule(
  'sanad-transactional-message-dispatch','*/2 * * * *',
  'select private.dispatch_transactional_messages();'
);

comment on table public.sanad_transactional_message_outbox is
'Unified durable WhatsApp transactional outbox. Queue status is separate from Meta delivery status; free-form text is restricted to an explicit service window.';

commit;

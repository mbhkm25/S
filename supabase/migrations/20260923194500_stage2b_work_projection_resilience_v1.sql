-- Stage 2B Data Train D3 / Projection Resilience v1
-- Operational projections and realtime delivery must never make the canonical source transaction fail.
-- Manual task lifecycle events keep unique transition identities across reopen/recomplete cycles.

create or replace function public.complete_my_sanad_task_v1(
  p_work_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_work_items%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  update public.sanad_work_items
  set status='done',resolved_at=coalesce(resolved_at,now()),updated_at=now()
  where id=p_work_item_id
    and recipient_user_id=v_uid
    and source_type='manual_task'
    and item_kind='task'
    and status in ('open','in_progress')
  returning * into v_row;

  if not found then
    raise exception 'manual_task_not_completable' using errcode='22023';
  end if;

  perform private.emit_sanad_domain_event_v1(
    'work.task.completed','sanad_work_item',v_row.id::text,v_uid,v_row.business_id,v_uid,
    'sanad_work_item',v_row.id::text,'{}'::jsonb,'private',
    'work_task_completed:'||v_row.id::text||':'||md5(v_row.updated_at::text),now()
  );

  return jsonb_build_object('item',to_jsonb(v_row),'contract_version',1);
end;
$function$;

create or replace function public.reopen_my_sanad_task_v1(
  p_work_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_work_items%rowtype;
  v_event_key text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  update public.sanad_work_items
  set status='open',resolved_at=null,updated_at=now()
  where id=p_work_item_id
    and recipient_user_id=v_uid
    and source_type='manual_task'
    and item_kind='task'
    and status in ('done','dismissed')
  returning * into v_row;

  if not found then
    raise exception 'manual_task_not_reopenable' using errcode='22023';
  end if;

  v_event_key := 'work_task_reopened:'||v_row.id::text||':'||md5(v_row.updated_at::text);
  perform private.emit_sanad_domain_event_v1(
    'work.task.reopened','sanad_work_item',v_row.id::text,v_uid,v_row.business_id,v_uid,
    'sanad_work_item',v_row.id::text,'{}'::jsonb,'private',v_event_key,now()
  );

  return jsonb_build_object('item',to_jsonb(v_row),'contract_version',1);
end;
$function$;

create or replace function private.broadcast_sanad_work_item_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.sanad_work_items%rowtype;
begin
  v_row := coalesce(new,old);

  begin
    perform realtime.send(
    jsonb_build_object(
      'work_item_id',v_row.id,
      'item_kind',v_row.item_kind,
      'status',v_row.status,
      'priority',v_row.priority,
      'business_id',v_row.business_id,
      'updated_at',v_row.updated_at
    ),
    'work_item.changed',
    'user:'||v_row.recipient_user_id::text,
    true
  );

  exception when others then
    raise warning 'sanad_work_item_realtime_broadcast_failed: %', sqlerrm;
  end;

  return coalesce(new,old);
end;
$function$;

create or replace function private.project_sanad_agent_action_event_to_work_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_action public.sanad_agent_actions%rowtype;
  v_title text;
  v_summary text;
begin
  select * into v_action
  from public.sanad_agent_actions
  where id=new.action_id;

  if not found then
    return new;
  end if;

  perform private.emit_sanad_domain_event_v1(
    case new.event_type
      when 'created' then 'agent.action.review_requested'
      else 'agent.action.'||new.event_type
    end,
    'sanad_agent_action_event',new.id::text,
    v_action.user_id,v_action.business_id,new.user_id,
    'sanad_agent_action',v_action.id::text,
    jsonb_build_object(
      'action_type',v_action.action_type,
      'status',v_action.status,
      'thread_id',v_action.thread_id,
      'event',new.data
    ),
    case when v_action.business_id is null then 'private' else 'financial' end,
    'agent_action_event:'||new.id::text,
    new.created_at
  );

  v_title := coalesce(nullif(v_action.review->>'title',''),'إجراء ينتظر اعتمادك');
  v_summary := coalesce(nullif(v_action.review->>'summary',''),'راجع تفاصيل الإجراء قبل اعتماده.');

  if new.event_type='created' then
    perform private.upsert_sanad_work_item_v1(
      v_action.user_id,v_action.business_id,'approval','open',80,
      'sanad_agent_action',v_action.id::text,v_title,v_summary,null,
      'agent_action_review',
      jsonb_build_object('action_id',v_action.id,'thread_id',v_action.thread_id),
      'agent_action_review:'||v_action.id::text,
      jsonb_build_object('action_type',v_action.action_type,'source_event_id',new.id)
    );
  elsif new.event_type='approved' then
    perform private.upsert_sanad_work_item_v1(
      v_action.user_id,v_action.business_id,'approval','done',80,
      'sanad_agent_action',v_action.id::text,v_title,v_summary,null,
      'agent_action_review',
      jsonb_build_object('action_id',v_action.id,'thread_id',v_action.thread_id),
      'agent_action_review:'||v_action.id::text,
      jsonb_build_object('action_type',v_action.action_type,'approved',true,'source_event_id',new.id)
    );
  elsif new.event_type='cancelled' then
    perform private.upsert_sanad_work_item_v1(
      v_action.user_id,v_action.business_id,'approval','cancelled',80,
      'sanad_agent_action',v_action.id::text,v_title,v_summary,null,
      'agent_action_review',
      jsonb_build_object('action_id',v_action.id,'thread_id',v_action.thread_id),
      'agent_action_review:'||v_action.id::text,
      jsonb_build_object('action_type',v_action.action_type,'source_event_id',new.id)
    );
  elsif new.event_type='completed' then
    update public.sanad_work_items
    set status='done',resolved_at=coalesce(resolved_at,now()),updated_at=now()
    where recipient_user_id=v_action.user_id
      and dedupe_key='agent_action_review:'||v_action.id::text
      and status in ('open','in_progress');
  elsif new.event_type='failed' then
    update public.sanad_work_items
    set status='done',resolved_at=coalesce(resolved_at,now()),updated_at=now()
    where recipient_user_id=v_action.user_id
      and dedupe_key='agent_action_review:'||v_action.id::text
      and status in ('open','in_progress');

    perform private.upsert_sanad_work_item_v1(
      v_action.user_id,v_action.business_id,'attention','open',95,
      'sanad_agent_action',v_action.id::text,'تعذر تنفيذ إجراء سند',
      coalesce(nullif(v_action.error_code,''),'تعذر تنفيذ الإجراء بعد الاعتماد. راجع التفاصيل وحاول من جديد.'),
      null,'agent_action_failure',
      jsonb_build_object('action_id',v_action.id,'thread_id',v_action.thread_id),
      'agent_action_failure:'||v_action.id::text,
      jsonb_build_object('action_type',v_action.action_type,'source_event_id',new.id)
    );
  end if;

  return new;
exception when others then
  raise warning 'sanad_agent_action_work_projection_failed: %', sqlerrm;
  return new;
end;
$function$;

create or replace function private.project_payment_inbox_event_to_work_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_inbox public.business_payment_inbox%rowtype;
  v_owner uuid;
  v_status text;
  v_priority integer;
  v_title text;
  v_summary text;
begin
  select * into v_inbox
  from public.business_payment_inbox
  where id=new.inbox_id;

  if not found then
    return new;
  end if;

  select owner_user_id into v_owner
  from public.business_profiles
  where id=v_inbox.business_id;

  if v_owner is null then
    return new;
  end if;

  perform private.emit_sanad_domain_event_v1(
    'payment.inbox.'||replace(new.event_type,'_','.'),
    'business_payment_inbox_event',new.id::text,
    v_owner,v_inbox.business_id,new.actor_user_id,
    'business_payment_inbox',v_inbox.id::text,
    jsonb_build_object(
      'operation_id',v_inbox.operation_id,
      'from_status',new.from_status,
      'to_status',new.to_status,
      'priority',v_inbox.priority,
      'reason',new.reason
    ),
    'financial',
    'payment_inbox_event:'||new.id::text,
    new.created_at
  );

  v_priority := greatest(v_inbox.priority,
    case new.event_type when 'review_required' then 90 else 70 end);

  v_title := case
    when new.event_type='review_required' then 'دفعة تحتاج مراجعة'
    when new.event_type in ('claimed','reassigned','claim_renewed') then 'دفعة قيد المعالجة'
    else 'دفعة تحتاج متابعة'
  end;

  v_summary := case
    when new.event_type='review_required'
      then coalesce(nullif(new.reason,''),'تحتاج هذه الدفعة إلى مراجعة قبل إكمال المعالجة.')
    else 'توجد عملية في صندوق الدفعات تحتاج إلى متابعة.'
  end;

  v_status := case
    when new.event_type in ('enqueued','released','review_required','review_resumed','expired_claim_released')
      then 'open'
    when new.event_type in ('claimed','claim_renewed','reassigned')
      then 'in_progress'
    when new.event_type='completed'
      then 'done'
    when new.event_type in ('rejected','cancelled')
      then 'cancelled'
    else null
  end;

  if v_status is not null then
    perform private.upsert_sanad_work_item_v1(
      v_owner,v_inbox.business_id,'attention',v_status,v_priority,
      'business_payment_inbox',v_inbox.id::text,v_title,v_summary,null,
      'payment_inbox_review',
      jsonb_build_object(
        'inbox_id',v_inbox.id,
        'operation_id',v_inbox.operation_id,
        'business_id',v_inbox.business_id
      ),
      'payment_inbox:'||v_inbox.id::text,
      jsonb_build_object('source_event_id',new.id,'source_event_type',new.event_type)
    );
  end if;

  return new;
exception when others then
  raise warning 'payment_inbox_work_projection_failed: %', sqlerrm;
  return new;
end;
$function$;

create or replace function private.project_sanad_connection_to_work_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_recipient uuid;
  v_changed boolean;
  v_priority integer;
  v_title text;
  v_summary text;
  v_event_key text;
begin
  if new.scope_kind='user' then
    v_recipient := new.user_id;
  else
    select owner_user_id into v_recipient
    from public.business_profiles
    where id=new.business_id;
  end if;

  if v_recipient is null then
    return new;
  end if;

  v_changed := tg_op='INSERT'
    or new.status is distinct from old.status
    or new.health_status is distinct from old.health_status
    or new.last_error_code is distinct from old.last_error_code
    or new.last_error_at is distinct from old.last_error_at;

  if not v_changed then
    return new;
  end if;

  v_event_key := 'connection_state:'||new.id::text||':'||
    md5(concat_ws('|',new.status,new.health_status,coalesce(new.last_error_code,''),coalesce(new.last_error_at::text,'')));

  perform private.emit_sanad_domain_event_v1(
    'connection.state.'||new.status,
    'sanad_connection',new.id::text,
    v_recipient,new.business_id,null,
    'sanad_connection',new.id::text,
    jsonb_build_object(
      'provider_code',new.provider_code,
      'connection_kind',new.connection_kind,
      'status',new.status,
      'health_status',new.health_status,
      'last_error_code',new.last_error_code
    ),
    'private',v_event_key,now()
  );

  if new.status in ('degraded','attention_required','disconnected')
     or new.health_status in ('degraded','attention_required','disconnected') then
    v_priority := case
      when new.status='disconnected' or new.health_status='disconnected' then 95
      when new.status='attention_required' or new.health_status='attention_required' then 90
      else 80
    end;
    v_title := case
      when new.status='disconnected' or new.health_status='disconnected' then 'اتصال سند يحتاج إلى إعادة ربط'
      when new.status='attention_required' or new.health_status='attention_required' then 'اتصال سند يحتاج إلى تدخل'
      else 'اتصال سند يعمل بصورة متدهورة'
    end;
    v_summary := coalesce(
      nullif(new.last_error_code,''),
      'راجع حالة الاتصال وآخر مزامنة وأصلح المشكلة من مركز الاتصالات.'
    );

    perform private.upsert_sanad_work_item_v1(
      v_recipient,new.business_id,'connection_issue','open',v_priority,
      'sanad_connection',new.id::text,v_title,v_summary,null,
      'connection_repair',
      jsonb_build_object('connection_id',new.id,'provider_code',new.provider_code),
      'connection_issue:'||new.id::text,
      jsonb_build_object('status',new.status,'health_status',new.health_status)
    );
  elsif new.status='connected' and new.health_status='connected' then
    update public.sanad_work_items
    set status='done',resolved_at=coalesce(resolved_at,now()),updated_at=now(),
        metadata=metadata || jsonb_build_object('resolved_by_connection_health',true)
    where recipient_user_id=v_recipient
      and dedupe_key='connection_issue:'||new.id::text
      and status in ('open','in_progress');
  end if;

  return new;
exception when others then
  raise warning 'sanad_connection_work_projection_failed: %', sqlerrm;
  return new;
end;
$function$;

comment on function private.broadcast_sanad_work_item_v1() is
'Best-effort private Realtime delivery for Work Item changes. Delivery failure never rolls back the Work Item.';
comment on function private.project_sanad_agent_action_event_to_work_v1() is
'Best-effort cross-domain projection from durable agent action events. Projection failure never rolls back the canonical source event.';
comment on function private.project_payment_inbox_event_to_work_v1() is
'Best-effort cross-domain projection from durable payment inbox events. Projection failure never rolls back the canonical financial workflow event.';
comment on function private.project_sanad_connection_to_work_v1() is
'Best-effort cross-domain projection from connection state. Projection failure never rolls back the canonical connection update.';

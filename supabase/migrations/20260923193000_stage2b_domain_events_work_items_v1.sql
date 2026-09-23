-- Stage 2B Data Train D3 / Domain Events + Work Items v1
-- Cross-domain integration events are append-only routing envelopes, never financial truth.
-- Work Items are actionable projections; canonical source state must be revalidated before source mutation.

create table if not exists public.sanad_domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type ~ '^[a-z0-9_.]{3,120}$'),
  event_version integer not null default 1
    check (event_version > 0),
  source_type text not null
    check (source_type ~ '^[a-z0-9_]{2,80}$'),
  source_id text not null
    check (length(btrim(source_id)) between 1 and 255),
  user_id uuid null references auth.users(id) on delete set null,
  business_id uuid null references public.business_profiles(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  subject_type text not null
    check (subject_type ~ '^[a-z0-9_]{2,80}$'),
  subject_id text not null
    check (length(btrim(subject_id)) between 1 and 255),
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload)='object'),
  sensitivity text not null default 'normal'
    check (sensitivity in ('normal','private','financial','security')),
  dedupe_key text not null
    check (length(btrim(dedupe_key)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint sanad_domain_events_dedupe_key_key unique (dedupe_key)
);

create index if not exists sanad_domain_events_business_time_idx
  on public.sanad_domain_events(business_id,occurred_at desc)
  where business_id is not null;

create index if not exists sanad_domain_events_user_time_idx
  on public.sanad_domain_events(user_id,occurred_at desc)
  where user_id is not null;

create index if not exists sanad_domain_events_type_time_idx
  on public.sanad_domain_events(event_type,occurred_at desc);

alter table public.sanad_domain_events enable row level security;
revoke all on table public.sanad_domain_events from anon,authenticated;
grant select,insert,update,delete on table public.sanad_domain_events to service_role;

comment on table public.sanad_domain_events is
'Append-only cross-domain integration envelope. It references canonical domain records and must never be treated as financial/accounting truth.';

create table if not exists public.sanad_work_items (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid null references public.business_profiles(id) on delete cascade,
  item_kind text not null
    check (item_kind in ('task','approval','attention','follow_up','connection_issue')),
  status text not null default 'open'
    check (status in ('open','in_progress','done','dismissed','cancelled')),
  priority smallint not null default 50
    check (priority between 0 and 100),
  source_type text not null
    check (source_type ~ '^[a-z0-9_]{2,80}$'),
  source_id text not null
    check (length(btrim(source_id)) between 1 and 255),
  title text not null
    check (length(btrim(title)) between 1 and 160),
  summary text null
    check (summary is null or length(summary) <= 1000),
  due_at timestamptz null,
  action_type text not null default 'none'
    check (action_type ~ '^[a-z0-9_]{2,80}$'),
  action_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(action_payload)='object'),
  dedupe_key text not null
    check (length(btrim(dedupe_key)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanad_work_items_recipient_dedupe_key
    unique (recipient_user_id,dedupe_key),
  constraint sanad_work_items_resolution_check check (
    (status in ('done','dismissed','cancelled') and resolved_at is not null)
    or
    (status in ('open','in_progress') and resolved_at is null)
  )
);

create index if not exists sanad_work_items_recipient_open_idx
  on public.sanad_work_items(recipient_user_id,status,priority desc,created_at desc)
  where status in ('open','in_progress');

create index if not exists sanad_work_items_recipient_due_idx
  on public.sanad_work_items(recipient_user_id,due_at,priority desc)
  where status in ('open','in_progress') and due_at is not null;

create index if not exists sanad_work_items_business_open_idx
  on public.sanad_work_items(business_id,status,priority desc,created_at desc)
  where business_id is not null and status in ('open','in_progress');

create index if not exists sanad_work_items_source_idx
  on public.sanad_work_items(source_type,source_id);

alter table public.sanad_work_items enable row level security;
revoke all on table public.sanad_work_items from anon,authenticated;
grant select on table public.sanad_work_items to authenticated;
grant select,insert,update,delete on table public.sanad_work_items to service_role;

drop policy if exists sanad_work_items_select_own_v1 on public.sanad_work_items;
create policy sanad_work_items_select_own_v1
on public.sanad_work_items
for select
to authenticated
using (recipient_user_id=(select auth.uid()));

comment on table public.sanad_work_items is
'Cross-domain actionable projection used by Today/Tasks/Approvals/attention. Source-domain state remains canonical.';

create or replace function private.emit_sanad_domain_event_v1(
  p_event_type text,
  p_source_type text,
  p_source_id text,
  p_user_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_subject_type text,
  p_subject_id text,
  p_payload jsonb,
  p_sensitivity text,
  p_dedupe_key text,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if p_event_type is null or p_source_type is null or p_source_id is null
     or p_subject_type is null or p_subject_id is null or p_dedupe_key is null then
    raise exception 'domain_event_identity_required' using errcode='22023';
  end if;

  insert into public.sanad_domain_events(
    event_type,event_version,source_type,source_id,user_id,business_id,actor_user_id,
    subject_type,subject_id,occurred_at,payload,sensitivity,dedupe_key
  ) values (
    lower(btrim(p_event_type)),1,lower(btrim(p_source_type)),btrim(p_source_id),
    p_user_id,p_business_id,p_actor_user_id,lower(btrim(p_subject_type)),btrim(p_subject_id),
    coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),
    coalesce(nullif(lower(btrim(p_sensitivity)),''),'normal'),
    btrim(p_dedupe_key)
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.sanad_domain_events
    where dedupe_key=btrim(p_dedupe_key);
  end if;

  return v_id;
end;
$function$;

create or replace function private.upsert_sanad_work_item_v1(
  p_recipient_user_id uuid,
  p_business_id uuid,
  p_item_kind text,
  p_status text,
  p_priority integer,
  p_source_type text,
  p_source_id text,
  p_title text,
  p_summary text,
  p_due_at timestamptz,
  p_action_type text,
  p_action_payload jsonb,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_status text := lower(btrim(coalesce(p_status,'open')));
begin
  if p_recipient_user_id is null then
    raise exception 'work_item_recipient_required' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id=p_recipient_user_id and status='active'
  ) then
    raise exception 'work_item_recipient_inactive' using errcode='22023';
  end if;

  insert into public.sanad_work_items(
    recipient_user_id,business_id,item_kind,status,priority,source_type,source_id,
    title,summary,due_at,action_type,action_payload,dedupe_key,metadata,resolved_at
  ) values (
    p_recipient_user_id,p_business_id,lower(btrim(p_item_kind)),v_status,
    greatest(0,least(coalesce(p_priority,50),100)),
    lower(btrim(p_source_type)),btrim(p_source_id),left(btrim(p_title),160),
    nullif(left(btrim(coalesce(p_summary,'')),1000),''),
    p_due_at,coalesce(nullif(lower(btrim(p_action_type)),''),'none'),
    coalesce(p_action_payload,'{}'::jsonb),btrim(p_dedupe_key),
    coalesce(p_metadata,'{}'::jsonb),
    case when v_status in ('done','dismissed','cancelled') then now() else null end
  )
  on conflict (recipient_user_id,dedupe_key) do update
  set business_id=excluded.business_id,
      item_kind=excluded.item_kind,
      status=excluded.status,
      priority=excluded.priority,
      source_type=excluded.source_type,
      source_id=excluded.source_id,
      title=excluded.title,
      summary=excluded.summary,
      due_at=excluded.due_at,
      action_type=excluded.action_type,
      action_payload=excluded.action_payload,
      metadata=public.sanad_work_items.metadata || excluded.metadata,
      resolved_at=case
        when excluded.status in ('done','dismissed','cancelled')
          then coalesce(public.sanad_work_items.resolved_at,now())
        else null
      end,
      updated_at=now()
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.emit_sanad_domain_event_v1(text,text,text,uuid,uuid,uuid,text,text,jsonb,text,text,timestamptz)
  from public,anon,authenticated;
revoke all on function private.upsert_sanad_work_item_v1(uuid,uuid,text,text,integer,text,text,text,text,timestamptz,text,jsonb,text,jsonb)
  from public,anon,authenticated;

create or replace function public.list_my_sanad_work_items_v1(
  p_view text default 'open',
  p_business_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_view text := lower(btrim(coalesce(p_view,'open')));
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if v_view not in ('open','today','tasks','approvals','attention','all') then
    raise exception 'invalid_work_item_view' using errcode='22023';
  end if;
  if p_business_id is not null and not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  return jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.rank_group,x.priority desc,x.due_at nulls last,x.created_at desc)
      from (
        select
          w.id,w.recipient_user_id,w.business_id,w.item_kind,w.status,w.priority,
          w.source_type,w.source_id,w.title,w.summary,w.due_at,w.action_type,
          w.action_payload,w.metadata,w.resolved_at,w.created_at,w.updated_at,
          case when w.item_kind in ('approval','attention','connection_issue') then 0 else 1 end as rank_group
        from public.sanad_work_items w
        where w.recipient_user_id=v_uid
          and (p_business_id is null or w.business_id=p_business_id)
          and (
            v_view='all'
            or (v_view='open' and w.status in ('open','in_progress'))
            or (v_view='today' and w.status in ('open','in_progress') and (
              w.item_kind in ('approval','attention','connection_issue')
              or w.due_at is null
              or w.due_at < date_trunc('day',now()) + interval '1 day'
            ))
            or (v_view='tasks' and w.item_kind='task' and w.status in ('open','in_progress'))
            or (v_view='approvals' and w.item_kind='approval' and w.status in ('open','in_progress'))
            or (v_view='attention' and w.item_kind in ('attention','connection_issue') and w.status in ('open','in_progress'))
          )
        order by
          case when w.item_kind in ('approval','attention','connection_issue') then 0 else 1 end,
          w.priority desc,w.due_at nulls last,w.created_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'view',v_view,
    'contract_version',1
  );
end;
$function$;

create or replace function public.get_my_sanad_today_v1(
  p_business_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if p_business_id is not null and not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank_group,x.priority desc,x.due_at nulls last,x.created_at desc),'[]'::jsonb)
  into v_items
  from (
    select
      w.id,w.business_id,w.item_kind,w.status,w.priority,w.source_type,w.source_id,
      w.title,w.summary,w.due_at,w.action_type,w.action_payload,w.metadata,
      w.created_at,w.updated_at,
      case when w.item_kind in ('approval','attention','connection_issue') then 0 else 1 end rank_group
    from public.sanad_work_items w
    where w.recipient_user_id=v_uid
      and w.status in ('open','in_progress')
      and (p_business_id is null or w.business_id=p_business_id)
      and (
        w.item_kind in ('approval','attention','connection_issue')
        or w.due_at is null
        or w.due_at < date_trunc('day',now()) + interval '1 day'
      )
    order by rank_group,w.priority desc,w.due_at nulls last,w.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'items',v_items,
    'counts',jsonb_build_object(
      'total',(select count(*) from public.sanad_work_items w
        where w.recipient_user_id=v_uid and w.status in ('open','in_progress')
          and (p_business_id is null or w.business_id=p_business_id)),
      'approvals',(select count(*) from public.sanad_work_items w
        where w.recipient_user_id=v_uid and w.status in ('open','in_progress')
          and w.item_kind='approval' and (p_business_id is null or w.business_id=p_business_id)),
      'attention',(select count(*) from public.sanad_work_items w
        where w.recipient_user_id=v_uid and w.status in ('open','in_progress')
          and w.item_kind in ('attention','connection_issue')
          and (p_business_id is null or w.business_id=p_business_id)),
      'tasks',(select count(*) from public.sanad_work_items w
        where w.recipient_user_id=v_uid and w.status in ('open','in_progress')
          and w.item_kind='task' and (p_business_id is null or w.business_id=p_business_id))
    ),
    'generated_at',now(),
    'contract_version',1
  );
end;
$function$;

create or replace function public.get_my_sanad_work_item_v1(
  p_work_item_id uuid
)
returns jsonb
language plpgsql
stable
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

  select * into v_row
  from public.sanad_work_items
  where id=p_work_item_id and recipient_user_id=v_uid;

  if not found then
    raise exception 'work_item_not_found' using errcode='P0002';
  end if;

  return jsonb_build_object('item',to_jsonb(v_row),'contract_version',1);
end;
$function$;

create or replace function public.create_my_sanad_task_v1(
  p_title text,
  p_summary text default null,
  p_due_at timestamptz default null,
  p_priority integer default 50,
  p_business_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_row public.sanad_work_items%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if p_title is null or length(btrim(p_title))<1 or length(p_title)>160 then
    raise exception 'invalid_task_title' using errcode='22023';
  end if;
  if p_summary is not null and length(p_summary)>1000 then
    raise exception 'task_summary_too_long' using errcode='22023';
  end if;
  if p_business_id is not null and not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  insert into public.sanad_work_items(
    id,recipient_user_id,business_id,item_kind,status,priority,source_type,source_id,
    title,summary,due_at,action_type,action_payload,dedupe_key,metadata,resolved_at
  ) values (
    v_id,v_uid,p_business_id,'task','open',greatest(0,least(coalesce(p_priority,50),100)),
    'manual_task',v_id::text,btrim(p_title),nullif(btrim(coalesce(p_summary,'')),''),
    p_due_at,'manual_task',jsonb_build_object('work_item_id',v_id),
    'manual_task:'||v_id::text,jsonb_build_object('created_by_user_id',v_uid),null
  )
  returning * into v_row;

  perform private.emit_sanad_domain_event_v1(
    'work.task.created','sanad_work_item',v_id::text,v_uid,p_business_id,v_uid,
    'sanad_work_item',v_id::text,
    jsonb_build_object('item_kind','task','priority',v_row.priority,'due_at',p_due_at),
    'private','work_task_created:'||v_id::text,now()
  );

  return jsonb_build_object('item',to_jsonb(v_row),'contract_version',1);
end;
$function$;

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
    'work_task_completed:'||v_row.id::text,now()
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

  v_event_key := 'work_task_reopened:'||v_row.id::text||':'||extract(epoch from v_row.updated_at)::bigint::text;
  perform private.emit_sanad_domain_event_v1(
    'work.task.reopened','sanad_work_item',v_row.id::text,v_uid,v_row.business_id,v_uid,
    'sanad_work_item',v_row.id::text,'{}'::jsonb,'private',v_event_key,now()
  );

  return jsonb_build_object('item',to_jsonb(v_row),'contract_version',1);
end;
$function$;

revoke all on function public.list_my_sanad_work_items_v1(text,uuid,integer) from public,anon;
revoke all on function public.get_my_sanad_today_v1(uuid,integer) from public,anon;
revoke all on function public.get_my_sanad_work_item_v1(uuid) from public,anon;
revoke all on function public.create_my_sanad_task_v1(text,text,timestamptz,integer,uuid) from public,anon;
revoke all on function public.complete_my_sanad_task_v1(uuid) from public,anon;
revoke all on function public.reopen_my_sanad_task_v1(uuid) from public,anon;

grant execute on function public.list_my_sanad_work_items_v1(text,uuid,integer) to authenticated;
grant execute on function public.get_my_sanad_today_v1(uuid,integer) to authenticated;
grant execute on function public.get_my_sanad_work_item_v1(uuid) to authenticated;
grant execute on function public.create_my_sanad_task_v1(text,text,timestamptz,integer,uuid) to authenticated;
grant execute on function public.complete_my_sanad_task_v1(uuid) to authenticated;
grant execute on function public.reopen_my_sanad_task_v1(uuid) to authenticated;

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

  return coalesce(new,old);
end;
$function$;

revoke all on function private.broadcast_sanad_work_item_v1() from public,anon,authenticated;

drop trigger if exists sanad_work_items_private_broadcast_v1 on public.sanad_work_items;
create trigger sanad_work_items_private_broadcast_v1
after insert or update on public.sanad_work_items
for each row
execute function private.broadcast_sanad_work_item_v1();

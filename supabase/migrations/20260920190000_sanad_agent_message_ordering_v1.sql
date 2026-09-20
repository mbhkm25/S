-- SANAD Agent deterministic message ordering v1
-- Stage 1A: make semantic conversation order explicit and independent from timestamps/UUIDs.
--
-- Contract:
--   * sequence_no is strictly positive and unique within each thread.
--   * next_message_sequence is allocated while the thread row is locked FOR UPDATE.
--   * created_at remains presentation/audit time only.
--   * historical backfill aborts if a same-timestamp collision cannot be proven.

alter table public.sanad_agent_threads
  add column if not exists next_message_sequence bigint;

alter table public.sanad_agent_messages
  add column if not exists sequence_no bigint;

-- The pre-v1 persistence contract creates one user + one assistant row per request_id
-- with the same created_at. Do not guess if Production has drifted beyond that shape.
do $$
begin
  if exists (
    select 1
    from (
      select
        thread_id,
        created_at,
        count(*) as message_count,
        count(distinct request_id) filter (where request_id is not null) as request_count,
        count(*) filter (where request_id is null) as null_request_count,
        count(*) filter (where role='user') as user_count,
        count(*) filter (where role='assistant') as assistant_count
      from public.sanad_agent_messages
      where sequence_no is null
      group by thread_id, created_at
      having count(*) > 1
    ) c
    where c.message_count <> 2
       or c.request_count <> 1
       or c.null_request_count <> 0
       or c.user_count <> 1
       or c.assistant_count <> 1
  ) then
    raise exception 'sanad_agent_message_ordering_backfill_ambiguous_timestamp_collision'
      using errcode='22023';
  end if;

  if exists (
    select 1
    from (
      select
        thread_id,
        request_id,
        count(*) as message_count,
        count(*) filter (where role='user') as user_count,
        count(*) filter (where role='assistant') as assistant_count,
        count(distinct created_at) as timestamp_count
      from public.sanad_agent_messages
      where sequence_no is null
        and request_id is not null
      group by thread_id, request_id
    ) r
    where r.message_count <> 2
       or r.user_count <> 1
       or r.assistant_count <> 1
       or r.timestamp_count <> 1
  ) then
    raise exception 'sanad_agent_message_ordering_backfill_ambiguous_request_boundary'
      using errcode='22023';
  end if;
end;
$$;

-- Existing rows are ordered only after the guards above prove every timestamp tie.
-- No UUID participates in the historical semantic order.
with ranked as (
  select
    id,
    row_number() over (
      partition by thread_id
      order by
        created_at,
        case role when 'user' then 0 when 'assistant' then 1 else 2 end
    )::bigint as sequence_no
  from public.sanad_agent_messages
  where sequence_no is null
)
update public.sanad_agent_messages m
set sequence_no = r.sequence_no
from ranked r
where r.id = m.id;

update public.sanad_agent_threads t
set next_message_sequence = coalesce((
  select max(m.sequence_no) + 1
  from public.sanad_agent_messages m
  where m.thread_id=t.id
),1)
where t.next_message_sequence is null;

alter table public.sanad_agent_threads
  alter column next_message_sequence set default 1,
  alter column next_message_sequence set not null;

alter table public.sanad_agent_messages
  alter column sequence_no set not null;

alter table public.sanad_agent_threads
  drop constraint if exists sanad_agent_threads_next_message_sequence_positive;
alter table public.sanad_agent_threads
  add constraint sanad_agent_threads_next_message_sequence_positive
  check (next_message_sequence >= 1);

alter table public.sanad_agent_messages
  drop constraint if exists sanad_agent_messages_sequence_no_positive;
alter table public.sanad_agent_messages
  add constraint sanad_agent_messages_sequence_no_positive
  check (sequence_no >= 1);

create unique index if not exists sanad_agent_messages_thread_sequence_uidx
  on public.sanad_agent_messages(thread_id, sequence_no);

drop index if exists public.sanad_agent_messages_thread_time_idx;

-- Legacy service-role persistence remains compatible while all callers move on v2.
create or replace function public.save_sanad_agent_turn_v1(
  p_user_id uuid,
  p_thread_id uuid,
  p_user_message text,
  p_assistant_message text,
  p_response jsonb,
  p_tool_trace jsonb,
  p_request_id uuid,
  p_model text,
  p_thinking_level text,
  p_business_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.sanad_agent_threads%rowtype;
  v_user_message_id uuid := gen_random_uuid();
  v_assistant_message_id uuid := gen_random_uuid();
  v_user_sequence bigint;
  v_assistant_sequence bigint;
  v_title text;
begin
  if p_user_id is null or p_thread_id is null then
    raise exception 'user_and_thread_required' using errcode='22023';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=p_user_id
  for update;

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  if v_thread.status <> 'active' then
    raise exception 'agent_thread_archived' using errcode='22023';
  end if;

  v_user_sequence := v_thread.next_message_sequence;
  v_assistant_sequence := v_user_sequence + 1;

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,sequence_no,role,content,request_id
  )
  values(
    v_user_message_id,p_thread_id,p_user_id,v_user_sequence,'user',
    left(coalesce(p_user_message,''),20000),p_request_id
  );

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,sequence_no,role,content,response,tool_trace,request_id,model,thinking_level
  )
  values(
    v_assistant_message_id,p_thread_id,p_user_id,v_assistant_sequence,'assistant',
    left(coalesce(p_assistant_message,''),30000),
    coalesce(p_response,'{}'::jsonb),
    coalesce(p_tool_trace,'[]'::jsonb),
    p_request_id,
    left(nullif(coalesce(p_model,''),''),120),
    case when p_thinking_level in ('low','medium','high') then p_thinking_level else null end
  );

  v_title := case
    when v_thread.title='محادثة جديدة' and v_thread.message_count=0
      then left(regexp_replace(coalesce(nullif(btrim(p_user_message),''),'محادثة جديدة'),E'\\s+',' ','g'),64)
    else v_thread.title
  end;

  update public.sanad_agent_threads
  set title=v_title,
      business_id=coalesce(p_business_id,business_id),
      last_message_at=now(),
      message_count=message_count+2,
      next_message_sequence=v_assistant_sequence+1,
      updated_at=now()
  where id=p_thread_id;

  return jsonb_build_object(
    'thread_id',p_thread_id,
    'user_message_id',v_user_message_id,
    'assistant_message_id',v_assistant_message_id,
    'user_sequence_no',v_user_sequence,
    'assistant_sequence_no',v_assistant_sequence,
    'title',v_title
  );
end;
$$;

create or replace function public.save_sanad_agent_turn_v2(
  p_user_id uuid,
  p_thread_id uuid,
  p_user_message text,
  p_assistant_message text,
  p_response jsonb,
  p_tool_trace jsonb,
  p_request_id uuid,
  p_model text,
  p_thinking_level text,
  p_business_id uuid default null,
  p_attachment_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_thread public.sanad_agent_threads%rowtype;
  v_user_message_id uuid := gen_random_uuid();
  v_assistant_message_id uuid := gen_random_uuid();
  v_user_sequence bigint;
  v_assistant_sequence bigint;
  v_title text;
  v_attachment_ids uuid[] := coalesce(p_attachment_ids,'{}'::uuid[]);
begin
  if p_user_id is null or p_thread_id is null then
    raise exception 'user_and_thread_required' using errcode='22023';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=p_user_id
  for update;

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  if v_thread.status <> 'active' then
    raise exception 'agent_thread_archived' using errcode='22023';
  end if;

  if cardinality(v_attachment_ids) > 5 then
    raise exception 'too_many_attachments' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(v_attachment_ids) x(id)
    left join public.sanad_agent_attachments a
      on a.id=x.id
     and a.user_id=p_user_id
     and a.thread_id=p_thread_id
     and a.status='ready'
    where a.id is null
  ) then
    raise exception 'attachment_not_ready_or_not_owned' using errcode='22023';
  end if;

  v_user_sequence := v_thread.next_message_sequence;
  v_assistant_sequence := v_user_sequence + 1;

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,sequence_no,role,content,request_id,attachment_ids
  ) values (
    v_user_message_id,p_thread_id,p_user_id,v_user_sequence,'user',
    left(coalesce(p_user_message,''),20000),p_request_id,v_attachment_ids
  );

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,sequence_no,role,content,response,tool_trace,request_id,model,thinking_level
  ) values (
    v_assistant_message_id,p_thread_id,p_user_id,v_assistant_sequence,'assistant',
    left(coalesce(p_assistant_message,''),30000),
    coalesce(p_response,'{}'::jsonb),
    coalesce(p_tool_trace,'[]'::jsonb),
    p_request_id,
    left(nullif(coalesce(p_model,''),''),120),
    case when p_thinking_level in ('low','medium','high') then p_thinking_level else null end
  );

  v_title := case
    when v_thread.title='محادثة جديدة' and v_thread.message_count=0
      then left(regexp_replace(coalesce(nullif(btrim(p_user_message),''),'محادثة جديدة'),E'\\s+',' ','g'),64)
    else v_thread.title
  end;

  update public.sanad_agent_threads
  set title=v_title,
      business_id=coalesce(p_business_id,business_id),
      last_message_at=now(),
      message_count=message_count+2,
      next_message_sequence=v_assistant_sequence+1,
      updated_at=now()
  where id=p_thread_id;

  return jsonb_build_object(
    'thread_id',p_thread_id,
    'user_message_id',v_user_message_id,
    'assistant_message_id',v_assistant_message_id,
    'user_sequence_no',v_user_sequence,
    'assistant_sequence_no',v_assistant_sequence,
    'title',v_title,
    'attachment_ids',to_jsonb(v_attachment_ids)
  );
end;
$$;

create or replace function public.get_my_sanad_agent_thread_v1(
  p_thread_id uuid,
  p_message_limit integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_limit integer := greatest(1,least(coalesce(p_message_limit,120),300));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=v_uid;

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'thread',jsonb_build_object(
      'id',v_thread.id,
      'business_id',v_thread.business_id,
      'title',v_thread.title,
      'status',v_thread.status,
      'summary',v_thread.summary,
      'last_message_at',v_thread.last_message_at,
      'message_count',v_thread.message_count,
      'created_at',v_thread.created_at,
      'updated_at',v_thread.updated_at
    ),
    'messages',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',m.id,
          'sequence_no',m.sequence_no,
          'role',m.role,
          'content',m.content,
          'response',m.response,
          'tool_trace',m.tool_trace,
          'request_id',m.request_id,
          'model',m.model,
          'thinking_level',m.thinking_level,
          'is_starred',m.is_starred,
          'rating',m.rating,
          'rating_updated_at',m.rating_updated_at,
          'attachment_ids',to_jsonb(m.attachment_ids),
          'created_at',m.created_at
        )
        order by m.sequence_no
      )
      from (
        select *
        from public.sanad_agent_messages
        where thread_id=v_thread.id and user_id=v_uid
        order by sequence_no desc
        limit v_limit
      ) m
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_my_sanad_agent_context_v1(
  p_thread_id uuid,
  p_recent_limit integer default 24,
  p_memory_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_recent integer := greatest(1,least(coalesce(p_recent_limit,24),60));
  v_memories integer := greatest(1,least(coalesce(p_memory_limit,30),60));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=v_uid and status='active';

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'thread',jsonb_build_object(
      'id',v_thread.id,
      'business_id',v_thread.business_id,
      'title',v_thread.title,
      'summary',v_thread.summary,
      'message_count',v_thread.message_count
    ),
    'recent_messages',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sequence_no',m.sequence_no,
          'role',m.role,
          'content',m.content,
          'created_at',m.created_at
        )
        order by m.sequence_no
      )
      from (
        select *
        from public.sanad_agent_messages
        where thread_id=v_thread.id and user_id=v_uid
        order by sequence_no desc
        limit v_recent
      ) m
    ),'[]'::jsonb),
    'memories',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',mm.id,
          'memory_key',mm.memory_key,
          'category',mm.category,
          'value_text',mm.value_text,
          'confidence',mm.confidence,
          'updated_at',mm.updated_at
        )
        order by mm.updated_at desc
      )
      from (
        select *
        from public.sanad_agent_memories
        where user_id=v_uid
          and status='active'
          and (expires_at is null or expires_at > now())
        order by updated_at desc
        limit v_memories
      ) mm
    ),'[]'::jsonb),
    'preferences',coalesce((
      select to_jsonb(p)
      from public.sanad_agent_preferences p
      where p.user_id=v_uid
    ),jsonb_build_object(
      'save_history_enabled',true,
      'memory_enabled',true,
      'proactive_insights_enabled',true,
      'response_cards_enabled',true
    ))
  );
end;
$$;

-- Reassert least-privilege grants after replacing functions.
revoke all on function public.save_sanad_agent_turn_v1(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.save_sanad_agent_turn_v2(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.save_sanad_agent_turn_v1(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid) to service_role;
grant execute on function public.save_sanad_agent_turn_v2(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,uuid[]) to service_role;

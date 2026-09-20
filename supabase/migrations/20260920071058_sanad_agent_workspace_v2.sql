-- SANAD Agent Workspace v2
-- Cloud conversations, long-lived memory foundation, user preferences,
-- and service-role turn persistence for the authenticated in-app Agent.

create table if not exists public.sanad_agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid null,
  title text not null default 'محادثة جديدة',
  status text not null default 'active' check (status in ('active','archived')),
  summary text null,
  summary_updated_at timestamptz null,
  last_message_at timestamptz null,
  message_count integer not null default 0 check (message_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sanad_agent_threads_user_last_message_idx
  on public.sanad_agent_threads(user_id, status, last_message_at desc nulls last, created_at desc);

create index if not exists sanad_agent_threads_business_idx
  on public.sanad_agent_threads(user_id, business_id, last_message_at desc nulls last)
  where business_id is not null;

create table if not exists public.sanad_agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.sanad_agent_threads(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  response jsonb null,
  tool_trace jsonb not null default '[]'::jsonb,
  request_id uuid null,
  model text null,
  thinking_level text null check (thinking_level is null or thinking_level in ('low','medium','high')),
  created_at timestamptz not null default now()
);

create index if not exists sanad_agent_messages_thread_time_idx
  on public.sanad_agent_messages(thread_id, created_at, id);

create index if not exists sanad_agent_messages_user_time_idx
  on public.sanad_agent_messages(user_id, created_at desc);

create table if not exists public.sanad_agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  memory_key text not null,
  category text not null check (category in ('preference','entity_alias','working_context','communication_style','explicit_note')),
  value_text text not null,
  confidence numeric(5,4) not null default 1 check (confidence >= 0 and confidence <= 1),
  source_thread_id uuid null references public.sanad_agent_threads(id) on delete set null,
  source_message_id uuid null references public.sanad_agent_messages(id) on delete set null,
  status text not null default 'active' check (status in ('active','forgotten')),
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, memory_key)
);

create index if not exists sanad_agent_memories_user_status_idx
  on public.sanad_agent_memories(user_id, status, updated_at desc);

create table if not exists public.sanad_agent_preferences (
  user_id uuid primary key,
  save_history_enabled boolean not null default true,
  memory_enabled boolean not null default true,
  proactive_insights_enabled boolean not null default true,
  response_cards_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sanad_agent_threads enable row level security;
alter table public.sanad_agent_messages enable row level security;
alter table public.sanad_agent_memories enable row level security;
alter table public.sanad_agent_preferences enable row level security;

drop policy if exists sanad_agent_threads_own on public.sanad_agent_threads;
create policy sanad_agent_threads_own
on public.sanad_agent_threads
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists sanad_agent_messages_own on public.sanad_agent_messages;
create policy sanad_agent_messages_own
on public.sanad_agent_messages
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists sanad_agent_memories_own on public.sanad_agent_memories;
create policy sanad_agent_memories_own
on public.sanad_agent_memories
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists sanad_agent_preferences_own on public.sanad_agent_preferences;
create policy sanad_agent_preferences_own
on public.sanad_agent_preferences
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.sanad_agent_threads from public, anon, authenticated;
revoke all on table public.sanad_agent_messages from public, anon, authenticated;
revoke all on table public.sanad_agent_memories from public, anon, authenticated;
revoke all on table public.sanad_agent_preferences from public, anon, authenticated;

grant select, insert, update, delete on table public.sanad_agent_threads to service_role;
grant select, insert, update, delete on table public.sanad_agent_messages to service_role;
grant select, insert, update, delete on table public.sanad_agent_memories to service_role;
grant select, insert, update, delete on table public.sanad_agent_preferences to service_role;

create or replace function public.create_my_sanad_agent_thread_v1(
  p_business_id uuid default null,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_title text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if p_business_id is not null and not (
    private.user_is_business_owner(p_business_id, v_uid)
    or private.user_is_active_business_member(p_business_id, v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  v_title := left(
    regexp_replace(coalesce(nullif(btrim(p_title),''),'محادثة جديدة'), E'\\s+', ' ', 'g'),
    80
  );

  insert into public.sanad_agent_threads(id,user_id,business_id,title)
  values(v_id,v_uid,p_business_id,v_title);

  insert into public.sanad_agent_preferences(user_id)
  values(v_uid)
  on conflict (user_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.list_my_sanad_agent_threads_v1(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,50),100));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',x.id,
        'business_id',x.business_id,
        'title',x.title,
        'status',x.status,
        'summary',x.summary,
        'last_message_at',x.last_message_at,
        'message_count',x.message_count,
        'created_at',x.created_at,
        'updated_at',x.updated_at
      )
      order by x.last_message_at desc nulls last, x.created_at desc
    )
    from (
      select *
      from public.sanad_agent_threads
      where user_id=v_uid
      order by last_message_at desc nulls last, created_at desc
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_my_sanad_agent_thread_v1(
  p_thread_id uuid,
  p_message_limit integer default 120
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
  v_limit integer := greatest(1, least(coalesce(p_message_limit,120),300));
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
          'role',m.role,
          'content',m.content,
          'response',m.response,
          'tool_trace',m.tool_trace,
          'request_id',m.request_id,
          'model',m.model,
          'thinking_level',m.thinking_level,
          'created_at',m.created_at
        )
        order by m.created_at,m.id
      )
      from (
        select *
        from public.sanad_agent_messages
        where thread_id=v_thread.id and user_id=v_uid
        order by created_at desc,id desc
        limit v_limit
      ) m
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.update_my_sanad_agent_thread_v1(
  p_thread_id uuid,
  p_title text default null,
  p_status text default null,
  p_business_id uuid default null,
  p_change_business boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_status text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=v_uid
  for update;

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  v_status := coalesce(nullif(btrim(p_status),''),v_thread.status);
  if v_status not in ('active','archived') then
    raise exception 'invalid_thread_status' using errcode='22023';
  end if;

  if p_change_business and p_business_id is not null and not (
    private.user_is_business_owner(p_business_id, v_uid)
    or private.user_is_active_business_member(p_business_id, v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  update public.sanad_agent_threads
  set title=case
        when p_title is null then title
        else left(regexp_replace(coalesce(nullif(btrim(p_title),''),'محادثة جديدة'), E'\\s+', ' ', 'g'),80)
      end,
      status=v_status,
      business_id=case when p_change_business then p_business_id else business_id end,
      updated_at=now()
  where id=p_thread_id
  returning * into v_thread;

  return to_jsonb(v_thread);
end;
$$;

create or replace function public.get_my_sanad_agent_preferences_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_preferences%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  insert into public.sanad_agent_preferences(user_id)
  values(v_uid)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.sanad_agent_preferences
  where user_id=v_uid;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_my_sanad_agent_preferences_v1(
  p_save_history_enabled boolean default null,
  p_memory_enabled boolean default null,
  p_proactive_insights_enabled boolean default null,
  p_response_cards_enabled boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_preferences%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  insert into public.sanad_agent_preferences(
    user_id,save_history_enabled,memory_enabled,proactive_insights_enabled,response_cards_enabled
  )
  values(
    v_uid,
    coalesce(p_save_history_enabled,true),
    coalesce(p_memory_enabled,true),
    coalesce(p_proactive_insights_enabled,true),
    coalesce(p_response_cards_enabled,true)
  )
  on conflict (user_id) do update set
    save_history_enabled=coalesce(p_save_history_enabled,public.sanad_agent_preferences.save_history_enabled),
    memory_enabled=coalesce(p_memory_enabled,public.sanad_agent_preferences.memory_enabled),
    proactive_insights_enabled=coalesce(p_proactive_insights_enabled,public.sanad_agent_preferences.proactive_insights_enabled),
    response_cards_enabled=coalesce(p_response_cards_enabled,public.sanad_agent_preferences.response_cards_enabled),
    updated_at=now()
  returning * into v_row;

  return to_jsonb(v_row);
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
        jsonb_build_object('role',m.role,'content',m.content,'created_at',m.created_at)
        order by m.created_at,m.id
      )
      from (
        select *
        from public.sanad_agent_messages
        where thread_id=v_thread.id and user_id=v_uid
        order by created_at desc,id desc
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

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,role,content,request_id
  )
  values(
    v_user_message_id,p_thread_id,p_user_id,'user',left(coalesce(p_user_message,''),20000),p_request_id
  );

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,role,content,response,tool_trace,request_id,model,thinking_level
  )
  values(
    v_assistant_message_id,p_thread_id,p_user_id,'assistant',
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
      updated_at=now()
  where id=p_thread_id;

  return jsonb_build_object(
    'thread_id',p_thread_id,
    'user_message_id',v_user_message_id,
    'assistant_message_id',v_assistant_message_id,
    'title',v_title
  );
end;
$$;

create or replace function public.upsert_sanad_agent_memory_v1(
  p_user_id uuid,
  p_memory_key text,
  p_category text,
  p_value_text text,
  p_confidence numeric default 1,
  p_source_thread_id uuid default null,
  p_source_message_id uuid default null,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_key text := left(lower(regexp_replace(coalesce(p_memory_key,''),E'\\s+',' ','g')),160);
  v_category text := coalesce(nullif(btrim(p_category),''),'explicit_note');
begin
  if p_user_id is null or v_key='' or nullif(btrim(p_value_text),'') is null then
    raise exception 'invalid_memory' using errcode='22023';
  end if;
  if v_category not in ('preference','entity_alias','working_context','communication_style','explicit_note') then
    raise exception 'invalid_memory_category' using errcode='22023';
  end if;

  insert into public.sanad_agent_memories(
    user_id,memory_key,category,value_text,confidence,source_thread_id,source_message_id,status,expires_at,metadata
  )
  values(
    p_user_id,v_key,v_category,left(btrim(p_value_text),2000),greatest(0,least(coalesce(p_confidence,1),1)),
    p_source_thread_id,p_source_message_id,'active',p_expires_at,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (user_id,memory_key) do update set
    category=excluded.category,
    value_text=excluded.value_text,
    confidence=excluded.confidence,
    source_thread_id=coalesce(excluded.source_thread_id,public.sanad_agent_memories.source_thread_id),
    source_message_id=coalesce(excluded.source_message_id,public.sanad_agent_memories.source_message_id),
    status='active',
    expires_at=excluded.expires_at,
    metadata=excluded.metadata,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.forget_my_sanad_agent_memory_v1(
  p_memory_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  update public.sanad_agent_memories
  set status='forgotten',updated_at=now()
  where id=p_memory_id and user_id=v_uid;

  return found;
end;
$$;

revoke all on function public.create_my_sanad_agent_thread_v1(uuid,text) from public,anon;
revoke all on function public.list_my_sanad_agent_threads_v1(integer) from public,anon;
revoke all on function public.get_my_sanad_agent_thread_v1(uuid,integer) from public,anon;
revoke all on function public.update_my_sanad_agent_thread_v1(uuid,text,text,uuid,boolean) from public,anon;
revoke all on function public.get_my_sanad_agent_preferences_v1() from public,anon;
revoke all on function public.update_my_sanad_agent_preferences_v1(boolean,boolean,boolean,boolean) from public,anon;
revoke all on function public.get_my_sanad_agent_context_v1(uuid,integer,integer) from public,anon;
revoke all on function public.forget_my_sanad_agent_memory_v1(uuid) from public,anon;

grant execute on function public.create_my_sanad_agent_thread_v1(uuid,text) to authenticated;
grant execute on function public.list_my_sanad_agent_threads_v1(integer) to authenticated;
grant execute on function public.get_my_sanad_agent_thread_v1(uuid,integer) to authenticated;
grant execute on function public.update_my_sanad_agent_thread_v1(uuid,text,text,uuid,boolean) to authenticated;
grant execute on function public.get_my_sanad_agent_preferences_v1() to authenticated;
grant execute on function public.update_my_sanad_agent_preferences_v1(boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.get_my_sanad_agent_context_v1(uuid,integer,integer) to authenticated;
grant execute on function public.forget_my_sanad_agent_memory_v1(uuid) to authenticated;

revoke all on function public.save_sanad_agent_turn_v1(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.upsert_sanad_agent_memory_v1(uuid,text,text,text,numeric,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;

grant execute on function public.save_sanad_agent_turn_v1(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid) to service_role;
grant execute on function public.upsert_sanad_agent_memory_v1(uuid,text,text,text,numeric,uuid,uuid,timestamptz,jsonb) to service_role;

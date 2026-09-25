-- Stage 2C.1: additive project-scoped conversation, per-user pin and immutable origin.
-- Do not deploy until a separately approved database release gate with rollback.
-- Scope: preserve all legacy chats; business_id NULL alone never implies personal.

create table if not exists public.sanad_agent_thread_pins (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.sanad_agent_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);
create index if not exists sanad_agent_thread_pins_thread_idx
  on public.sanad_agent_thread_pins(thread_id);
alter table public.sanad_agent_thread_pins enable row level security;
revoke all on public.sanad_agent_thread_pins from anon, authenticated;

-- Create typed project threads using the existing owner/member-checked v1 RPC.
-- Explicit scope is recorded server-side so old NULL-business threads remain
-- unclassified and are never silently exposed in the personal project.
create or replace function public.create_my_sanad_project_thread_v1(
  p_project_kind text,
  p_business_id uuid default null,
  p_title text default null
)
returns uuid language plpgsql security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_thread_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_project_kind not in ('personal','business')
      or (p_project_kind = 'personal' and p_business_id is not null)
      or (p_project_kind = 'business' and p_business_id is null) then
    raise exception 'invalid_project_context' using errcode = '22023';
  end if;
  v_thread_id := public.create_my_sanad_agent_thread_v1(p_business_id, p_title);
  update public.sanad_agent_threads
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('sanad_project_kind', p_project_kind,
                                          'sanad_project_version', 1)
   where id = v_thread_id and user_id = v_uid;
  if not found then
    raise exception 'project_thread_creation_failed' using errcode = '42501';
  end if;
  return v_thread_id;
end;
$fn$;
revoke all on function public.create_my_sanad_project_thread_v1(text,uuid,text) from public, anon;
grant execute on function public.create_my_sanad_project_thread_v1(text,uuid,text) to authenticated;

-- Existing owner-only rebinding can currently change a conversation business
-- after a financial draft exists, leaving action.business_id unchanged.
-- Keep the legacy RPC signature, but reject cross-scope changes on typed
-- project threads or once any messages, actions, attachments, linked memories,
-- or other active participant exist. Empty legacy owner-only threads retain
-- their previous explicit move behavior until they are classified.
create or replace function public.update_my_sanad_agent_thread_v1(
  p_thread_id uuid,
  p_title text default null,
  p_status text default null,
  p_business_id uuid default null,
  p_change_business boolean default false
)
returns jsonb language plpgsql security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_status text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_thread
  from public.sanad_agent_threads
  where id = p_thread_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'agent_thread_not_found' using errcode = 'P0002';
  end if;

  v_status := coalesce(nullif(btrim(p_status),''),v_thread.status);
  if v_status not in ('active','archived') then
    raise exception 'invalid_thread_status' using errcode = '22023';
  end if;
  if p_change_business and p_business_id is distinct from v_thread.business_id then
    if coalesce(v_thread.metadata, '{}'::jsonb) ? 'sanad_project_kind'
       or exists(select 1 from public.sanad_agent_messages where thread_id = p_thread_id)
       or exists(select 1 from public.sanad_agent_actions where thread_id = p_thread_id)
       or exists(select 1 from public.sanad_agent_attachments where thread_id = p_thread_id)
       or exists(select 1 from public.sanad_agent_memories where source_thread_id = p_thread_id)
       or exists(select 1 from public.sanad_agent_thread_participants
                 where thread_id = p_thread_id and user_id <> v_uid and status = 'active')
    then
      raise exception 'thread_origin_immutable' using errcode = '42501';
    end if;
    if p_business_id is not null and not (
      private.user_is_business_owner(p_business_id, v_uid)
      or private.user_is_active_business_member(p_business_id, v_uid)
    ) then
      raise exception 'business_access_denied' using errcode = '42501';
    end if;
  end if;

  update public.sanad_agent_threads
     set title = case when p_title is null then title
                      else left(regexp_replace(
                        coalesce(nullif(btrim(p_title),''),'محادثة جديدة'),
                        E'\\s+', ' ', 'g'),80) end,
         status = v_status,
         business_id = case when p_change_business then p_business_id else business_id end,
         updated_at = now()
   where id = p_thread_id
   returning * into v_thread;
  return to_jsonb(v_thread);
end;
$fn$;
revoke all on function public.update_my_sanad_agent_thread_v1(uuid,text,text,uuid,boolean) from public, anon;
grant execute on function public.update_my_sanad_agent_thread_v1(uuid,text,text,uuid,boolean) to authenticated;

-- Opt-in classification only: the owner reviews an unclassified legacy chat
-- before adopting it as personal. Block if it ever carried financial actions,
-- uploaded attachments, scoped memory or non-owner participants.
create or replace function public.classify_my_sanad_legacy_thread_v1(p_thread_id uuid)
returns boolean language plpgsql security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into v_thread from public.sanad_agent_threads
   where id = p_thread_id and user_id = v_uid for update;
  if not found or v_thread.business_id is not null
       or coalesce(v_thread.metadata, '{}'::jsonb) ? 'sanad_project_kind'
       or exists(select 1 from public.sanad_agent_actions where thread_id = p_thread_id)
       or exists(select 1 from public.sanad_agent_attachments where thread_id = p_thread_id)
       or exists(select 1 from public.sanad_agent_memories where source_thread_id = p_thread_id)
       or exists(select 1 from public.sanad_agent_thread_participants
                 where thread_id = p_thread_id and user_id <> v_uid)
  then
    raise exception 'legacy_thread_classification_requires_review' using errcode = '42501';
  end if;
  update public.sanad_agent_threads
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('sanad_project_kind','personal',
                                           'sanad_project_version',1),
         updated_at = now()
   where id = p_thread_id and user_id = v_uid;
  return true;
end;
$fn$;
revoke all on function public.classify_my_sanad_legacy_thread_v1(uuid) from public, anon;
grant execute on function public.classify_my_sanad_legacy_thread_v1(uuid) to authenticated;

-- Pinning belongs to a user, never to a shared thread's global metadata.
create or replace function public.set_my_sanad_agent_thread_pin_v1(
  p_thread_id uuid, p_pin boolean
)
returns boolean language plpgsql security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into v_thread from public.sanad_agent_threads where id = p_thread_id;
  if not found or not private.can_access_sanad_agent_thread_v2(p_thread_id, v_uid)
     or v_thread.status <> 'active'
     or (v_thread.business_id is null
         and coalesce(v_thread.metadata, '{}'::jsonb)->>'sanad_project_kind' <> 'personal')
  then
    raise exception 'project_thread_access_denied' using errcode = '42501';
  end if;
  if coalesce(p_pin,false) then
    insert into public.sanad_agent_thread_pins(user_id,thread_id)
    values(v_uid,p_thread_id) on conflict do nothing;
  else
    delete from public.sanad_agent_thread_pins
     where user_id = v_uid and thread_id = p_thread_id;
  end if;
  return true;
end;
$fn$;
revoke all on function public.set_my_sanad_agent_thread_pin_v1(uuid,boolean) from public, anon;
grant execute on function public.set_my_sanad_agent_thread_pin_v1(uuid,boolean) to authenticated;

-- Project-specific participant-authorized pagination + independent pins.
-- The existing v2 latest-50 RPC is preserved for old clients during rollout.
create or replace function public.list_my_sanad_project_threads_v1(
  p_project_kind text,
  p_business_id uuid default null,
  p_limit integer default 35,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,35),60));
  v_items jsonb := '[]'::jsonb;
  v_pinned jsonb := '[]'::jsonb;
  v_next jsonb := null;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_project_kind not in ('personal','business')
      or (p_project_kind = 'personal' and p_business_id is not null)
      or (p_project_kind = 'business' and p_business_id is null)
      or ((p_cursor_at is null) <> (p_cursor_id is null)) then
    raise exception 'invalid_project_query' using errcode = '22023';
  end if;
  if p_project_kind = 'business' and not (
     private.user_is_business_owner(p_business_id, v_uid)
     or private.user_is_active_business_member(p_business_id, v_uid)
  ) then
    raise exception 'business_access_denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
       'id',t.id,'business_id',t.business_id,'project_kind',p_project_kind,
       'title',t.title,'status',t.status,'summary',t.summary,
       'last_message_at',t.last_message_at,'message_count',t.message_count,
       'created_at',t.created_at,'updated_at',t.updated_at,'is_pinned',true,
       'my_role',p.participant_role
  ) order by pin.created_at desc),'[]'::jsonb)
  into v_pinned
  from public.sanad_agent_thread_pins pin
  join public.sanad_agent_threads t on t.id = pin.thread_id
  join public.sanad_agent_thread_participants p
    on p.thread_id = t.id and p.user_id = v_uid and p.status = 'active'
  where pin.user_id = v_uid
    and t.status = 'active'
    and private.can_access_sanad_agent_thread_v2(t.id,v_uid)
    and ((p_project_kind='business' and t.business_id=p_business_id)
         or (p_project_kind='personal' and t.business_id is null
             and t.metadata->>'sanad_project_kind'='personal'));

  select coalesce(jsonb_agg(jsonb_build_object(
       'id',x.id,'business_id',x.business_id,'project_kind',p_project_kind,
       'title',x.title,'status',x.status,'summary',x.summary,
       'last_message_at',x.last_message_at,'message_count',x.message_count,
       'created_at',x.created_at,'updated_at',x.updated_at,
       'is_pinned',x.is_pinned,'my_role',x.participant_role,
       'activity_at',x.activity_at
  ) order by x.activity_at desc,x.id desc),'[]'::jsonb)
  into v_items
  from (
    select t.*, p.participant_role, (pin.thread_id is not null) is_pinned,
           coalesce(t.last_message_at,t.created_at) activity_at
      from public.sanad_agent_threads t
      join public.sanad_agent_thread_participants p
        on p.thread_id=t.id and p.user_id=v_uid and p.status='active'
      left join public.sanad_agent_thread_pins pin
        on pin.thread_id=t.id and pin.user_id=v_uid
     where private.can_access_sanad_agent_thread_v2(t.id,v_uid)
       and ((p_project_kind='business' and t.business_id=p_business_id)
          or (p_project_kind='personal' and t.business_id is null
              and t.metadata->>'sanad_project_kind'='personal'))
       and (p_cursor_at is null
         or (coalesce(t.last_message_at,t.created_at),t.id) < (p_cursor_at,p_cursor_id))
     order by activity_at desc,t.id desc
     limit v_limit+1
  ) x;

  if jsonb_array_length(v_items) > v_limit then
    v_next := jsonb_build_object('at',v_items->(v_limit-1)->>'activity_at',
                                 'id',v_items->(v_limit-1)->>'id');
    v_items := v_items - v_limit;
  end if;
  return jsonb_build_object('items',v_items,'pinned',v_pinned,'next_cursor',v_next);
end;
$fn$;
revoke all on function public.list_my_sanad_project_threads_v1(text,uuid,integer,timestamptz,uuid) from public, anon;
grant execute on function public.list_my_sanad_project_threads_v1(text,uuid,integer,timestamptz,uuid) to authenticated;

create index if not exists sanad_agent_threads_project_activity_v1_idx
  on public.sanad_agent_threads(business_id, (coalesce(last_message_at, created_at)) desc, id desc);
create index if not exists sanad_agent_threads_personal_project_v1_idx
  on public.sanad_agent_threads((coalesce(last_message_at, created_at)) desc, id desc)
  where business_id is null and metadata->>'sanad_project_kind'='personal';

comment on function public.create_my_sanad_project_thread_v1(text,uuid,text)
  is 'Creates a typed personal or authorized business conversation; null legacy threads stay unclassified.';
comment on table public.sanad_agent_thread_pins
  is 'Private per-user thread pin preference, read/written only via participant-checked RPCs.';

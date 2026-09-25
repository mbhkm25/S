-- Stage 2C Package 1 / Project-scoped conversations, pin preferences and immutable thread scope.
-- Adds project classification without creating a duplicate Projects ledger.
-- Existing business_id remains the canonical business identity; legacy null-business
-- threads are deliberately NOT auto-classified as personal.

alter table public.sanad_agent_threads
  add column if not exists project_kind text;

update public.sanad_agent_threads
set project_kind = case when business_id is null then 'legacy_unclassified' else 'business' end
where project_kind is null;

alter table public.sanad_agent_threads
  alter column project_kind set default 'personal',
  alter column project_kind set not null;

alter table public.sanad_agent_threads
  drop constraint if exists sanad_agent_threads_project_kind_check;
alter table public.sanad_agent_threads
  add constraint sanad_agent_threads_project_kind_check
  check (project_kind in ('personal','business','legacy_unclassified'));

alter table public.sanad_agent_threads
  drop constraint if exists sanad_agent_threads_project_scope_consistency;
alter table public.sanad_agent_threads
  add constraint sanad_agent_threads_project_scope_consistency
  check (
    (project_kind='business' and business_id is not null)
    or (project_kind in ('personal','legacy_unclassified') and business_id is null)
  );

create index if not exists sanad_agent_threads_project_recent_idx
  on public.sanad_agent_threads(project_kind,business_id,status,last_message_at desc,created_at desc);

create table if not exists public.sanad_agent_thread_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.sanad_agent_threads(id) on delete cascade,
  is_pinned boolean not null default false,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,thread_id)
);

alter table public.sanad_agent_thread_preferences enable row level security;
revoke all on public.sanad_agent_thread_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.sanad_agent_thread_preferences to service_role;

create index if not exists sanad_agent_thread_preferences_user_pin_idx
  on public.sanad_agent_thread_preferences(user_id,is_pinned,pinned_at desc)
  where is_pinned=true;

create or replace function public.create_my_sanad_agent_thread_v2(
  p_project_kind text,
  p_business_id uuid default null,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_kind text := lower(btrim(coalesce(p_project_kind,'')));
  v_title text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if v_kind not in ('personal','business') then
    raise exception 'invalid_project_kind' using errcode='22023';
  end if;

  if v_kind='personal' and p_business_id is not null then
    raise exception 'personal_project_business_forbidden' using errcode='22023';
  end if;

  if v_kind='business' then
    if p_business_id is null then
      raise exception 'business_project_required' using errcode='22023';
    end if;
    if not (
      private.user_is_business_owner(p_business_id,v_uid)
      or private.user_is_active_business_member(p_business_id,v_uid)
    ) then
      raise exception 'business_access_denied' using errcode='42501';
    end if;
  end if;

  v_title := left(
    regexp_replace(coalesce(nullif(btrim(p_title),''),'محادثة جديدة'), E'\\s+', ' ', 'g'),
    80
  );

  insert into public.sanad_agent_threads(
    id,user_id,business_id,project_kind,title
  ) values (
    v_id,v_uid,case when v_kind='business' then p_business_id else null end,v_kind,v_title
  );

  insert into public.sanad_agent_thread_participants(
    thread_id,user_id,participant_role,status,joined_at,last_read_sequence_no,notification_level,metadata
  ) values (
    v_id,v_uid,'owner','active',now(),0,'all',jsonb_build_object('added_via','project_thread_v2')
  )
  on conflict (thread_id,user_id) do update
    set participant_role='owner',
        status='active',
        left_at=null,
        updated_at=now();

  insert into public.sanad_agent_preferences(user_id)
  values(v_uid)
  on conflict (user_id) do nothing;

  return v_id;
end;
$function$;

create or replace function public.create_my_sanad_agent_thread_v1(
  p_business_id uuid default null,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return public.create_my_sanad_agent_thread_v2(
    case when p_business_id is null then 'personal' else 'business' end,
    p_business_id,
    p_title
  );
end;
$function$;

create or replace function public.list_my_sanad_project_threads_v1(
  p_project_kind text,
  p_business_id uuid default null,
  p_status text default 'active',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_kind text := lower(btrim(coalesce(p_project_kind,'')));
  v_status text := lower(btrim(coalesce(p_status,'active')));
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if v_kind not in ('personal','business','legacy_unclassified') then
    raise exception 'invalid_project_kind' using errcode='22023';
  end if;
  if v_status not in ('active','archived') then
    raise exception 'invalid_thread_status' using errcode='22023';
  end if;
  if v_kind='business' then
    if p_business_id is null then
      raise exception 'business_project_required' using errcode='22023';
    end if;
    if not (
      private.user_is_business_owner(p_business_id,v_uid)
      or private.user_is_active_business_member(p_business_id,v_uid)
    ) then
      raise exception 'business_access_denied' using errcode='42501';
    end if;
  elsif p_business_id is not null then
    raise exception 'project_business_mismatch' using errcode='22023';
  end if;

  with eligible as (
    select
      t.*,
      p.participant_role,
      p.last_read_sequence_no,
      coalesce(pref.is_pinned,false) as is_pinned,
      pref.pinned_at,
      (
        select count(*)::integer
        from public.sanad_agent_messages m
        where m.thread_id=t.id
          and m.sequence_no > p.last_read_sequence_no
      ) as unread_count
    from public.sanad_agent_threads t
    join public.sanad_agent_thread_participants p
      on p.thread_id=t.id
     and p.user_id=v_uid
     and p.status='active'
    left join public.sanad_agent_thread_preferences pref
      on pref.thread_id=t.id and pref.user_id=v_uid
    where private.can_access_sanad_agent_thread_v2(t.id,v_uid)
      and t.project_kind=v_kind
      and (v_kind<>'business' or t.business_id=p_business_id)
      and t.status=v_status
      and (
        v_search is null
        or t.title ilike '%'||replace(replace(v_search,'%','\\%'),'_','\\_')||'%' escape '\\'
        or coalesce(t.summary,'') ilike '%'||replace(replace(v_search,'%','\\%'),'_','\\_')||'%' escape '\\'
      )
  )
  select count(*) into v_total from eligible;

  with eligible as (
    select
      t.*,
      p.participant_role,
      p.last_read_sequence_no,
      coalesce(pref.is_pinned,false) as is_pinned,
      pref.pinned_at,
      (
        select count(*)::integer
        from public.sanad_agent_messages m
        where m.thread_id=t.id
          and m.sequence_no > p.last_read_sequence_no
      ) as unread_count
    from public.sanad_agent_threads t
    join public.sanad_agent_thread_participants p
      on p.thread_id=t.id
     and p.user_id=v_uid
     and p.status='active'
    left join public.sanad_agent_thread_preferences pref
      on pref.thread_id=t.id and pref.user_id=v_uid
    where private.can_access_sanad_agent_thread_v2(t.id,v_uid)
      and t.project_kind=v_kind
      and (v_kind<>'business' or t.business_id=p_business_id)
      and t.status=v_status
      and (
        v_search is null
        or t.title ilike '%'||replace(replace(v_search,'%','\\%'),'_','\\_')||'%' escape '\\'
        or coalesce(t.summary,'') ilike '%'||replace(replace(v_search,'%','\\%'),'_','\\_')||'%' escape '\\'
      )
    order by coalesce(pref.is_pinned,false) desc,
             pref.pinned_at desc nulls last,
             t.last_message_at desc nulls last,
             t.created_at desc
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'owner_user_id',e.user_id,
    'business_id',e.business_id,
    'project_kind',e.project_kind,
    'title',e.title,
    'status',e.status,
    'summary',e.summary,
    'last_message_at',e.last_message_at,
    'message_count',e.message_count,
    'created_at',e.created_at,
    'updated_at',e.updated_at,
    'my_role',e.participant_role,
    'last_read_sequence_no',e.last_read_sequence_no,
    'unread_count',e.unread_count,
    'is_pinned',e.is_pinned,
    'pinned_at',e.pinned_at
  ) order by e.is_pinned desc,e.pinned_at desc nulls last,e.last_message_at desc nulls last,e.created_at desc),'[]'::jsonb)
  into v_items
  from eligible e;

  return jsonb_build_object(
    'items',v_items,
    'total',v_total,
    'limit',v_limit,
    'offset',v_offset,
    'project_kind',v_kind,
    'business_id',case when v_kind='business' then p_business_id else null end
  );
end;
$function$;

create or replace function public.set_my_sanad_agent_thread_pin_v1(
  p_thread_id uuid,
  p_pinned boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_pinned boolean := coalesce(p_pinned,false);
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.can_access_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  insert into public.sanad_agent_thread_preferences(user_id,thread_id,is_pinned,pinned_at)
  values(v_uid,p_thread_id,v_pinned,case when v_pinned then now() else null end)
  on conflict (user_id,thread_id) do update
    set is_pinned=excluded.is_pinned,
        pinned_at=case
          when excluded.is_pinned and public.sanad_agent_thread_preferences.is_pinned=false then now()
          when excluded.is_pinned then public.sanad_agent_thread_preferences.pinned_at
          else null
        end,
        updated_at=now();

  return jsonb_build_object('thread_id',p_thread_id,'is_pinned',v_pinned);
end;
$function$;

create or replace function public.classify_my_legacy_sanad_agent_thread_v1(
  p_thread_id uuid,
  p_project_kind text,
  p_business_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_kind text := lower(btrim(coalesce(p_project_kind,'')));
  v_thread public.sanad_agent_threads%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if v_kind not in ('personal','business') then
    raise exception 'invalid_project_kind' using errcode='22023';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=v_uid
  for update;

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;
  if v_thread.project_kind<>'legacy_unclassified' then
    raise exception 'thread_already_classified' using errcode='22023';
  end if;
  if exists(select 1 from public.sanad_agent_actions a where a.thread_id=p_thread_id)
     or exists(select 1 from public.sanad_agent_attachments a where a.thread_id=p_thread_id and a.status<>'deleted')
     or exists(select 1 from public.sanad_agent_thread_participants p where p.thread_id=p_thread_id and p.user_id<>v_uid and p.status='active') then
    raise exception 'legacy_thread_requires_manual_review' using errcode='22023';
  end if;

  if v_kind='business' then
    if p_business_id is null then
      raise exception 'business_project_required' using errcode='22023';
    end if;
    if not (
      private.user_is_business_owner(p_business_id,v_uid)
      or private.user_is_active_business_member(p_business_id,v_uid)
    ) then
      raise exception 'business_access_denied' using errcode='42501';
    end if;
  elsif p_business_id is not null then
    raise exception 'personal_project_business_forbidden' using errcode='22023';
  end if;

  update public.sanad_agent_threads
  set project_kind=v_kind,
      business_id=case when v_kind='business' then p_business_id else null end,
      updated_at=now()
  where id=p_thread_id
  returning * into v_thread;

  return jsonb_build_object(
    'id',v_thread.id,
    'project_kind',v_thread.project_kind,
    'business_id',v_thread.business_id
  );
end;
$function$;

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
set search_path to ''
as $function$
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

  if p_change_business then
    if v_thread.project_kind='legacy_unclassified' then
      raise exception 'use_legacy_thread_classification_contract' using errcode='22023';
    end if;
    if p_business_id is distinct from v_thread.business_id then
      raise exception 'thread_project_rebind_not_allowed' using errcode='22023';
    end if;
  end if;

  update public.sanad_agent_threads
  set title=case
        when p_title is null then title
        else left(regexp_replace(coalesce(nullif(btrim(p_title),''),'محادثة جديدة'), E'\\s+', ' ', 'g'),80)
      end,
      status=v_status,
      updated_at=now()
  where id=p_thread_id
  returning * into v_thread;

  return to_jsonb(v_thread);
end;
$function$;

-- Include project classification in the current participant-aware thread detail.
create or replace function public.get_my_sanad_agent_thread_v2(
  p_thread_id uuid,
  p_message_limit integer default 120
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_participant public.sanad_agent_thread_participants%rowtype;
  v_limit integer := greatest(1,least(coalesce(p_message_limit,120),300));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if not private.can_access_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  select * into v_thread from public.sanad_agent_threads where id=p_thread_id;
  select * into v_participant
  from public.sanad_agent_thread_participants
  where thread_id=p_thread_id and user_id=v_uid and status='active';

  return jsonb_build_object(
    'thread',jsonb_build_object(
      'id',v_thread.id,
      'owner_user_id',v_thread.user_id,
      'business_id',v_thread.business_id,
      'project_kind',v_thread.project_kind,
      'title',v_thread.title,
      'status',v_thread.status,
      'summary',v_thread.summary,
      'last_message_at',v_thread.last_message_at,
      'message_count',v_thread.message_count,
      'created_at',v_thread.created_at,
      'updated_at',v_thread.updated_at,
      'my_role',v_participant.participant_role,
      'last_read_sequence_no',v_participant.last_read_sequence_no
    ),
    'messages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'sequence_no',m.sequence_no,'role',m.role,'content',m.content,
        'response',m.response,'tool_trace',m.tool_trace,'request_id',m.request_id,
        'model',m.model,'thinking_level',m.thinking_level,'is_starred',m.is_starred,
        'rating',m.rating,'rating_updated_at',m.rating_updated_at,
        'attachment_ids',to_jsonb(m.attachment_ids),'author_user_id',m.author_user_id,
        'author_name',ap.full_name,'author_avatar_path',ap.avatar_path,'created_at',m.created_at
      ) order by m.sequence_no)
      from (
        select * from public.sanad_agent_messages
        where thread_id=v_thread.id
        order by sequence_no desc
        limit v_limit
      ) m
      left join public.profiles ap on ap.id=m.author_user_id
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.create_my_sanad_agent_thread_v2(text,uuid,text) from public,anon;
revoke all on function public.list_my_sanad_project_threads_v1(text,uuid,text,text,integer,integer) from public,anon;
revoke all on function public.set_my_sanad_agent_thread_pin_v1(uuid,boolean) from public,anon;
revoke all on function public.classify_my_legacy_sanad_agent_thread_v1(uuid,text,uuid) from public,anon;
grant execute on function public.create_my_sanad_agent_thread_v2(text,uuid,text) to authenticated;
grant execute on function public.list_my_sanad_project_threads_v1(text,uuid,text,text,integer,integer) to authenticated;
grant execute on function public.set_my_sanad_agent_thread_pin_v1(uuid,boolean) to authenticated;
grant execute on function public.classify_my_legacy_sanad_agent_thread_v1(uuid,text,uuid) to authenticated;

comment on column public.sanad_agent_threads.project_kind is
'Conversation project classification. business_id remains canonical for business scope. legacy_unclassified preserves pre-2C null-business threads without guessing personal intent.';
comment on table public.sanad_agent_thread_preferences is
'Per-user conversation presentation preferences. Pinning never changes thread ownership, participant permissions, or business/project scope.';
comment on function public.update_my_sanad_agent_thread_v1(uuid,text,text,uuid,boolean) is
'Owner title/archive compatibility contract. Project/business reassignment is immutable after 2C; legacy scope classification uses classify_my_legacy_sanad_agent_thread_v1.';

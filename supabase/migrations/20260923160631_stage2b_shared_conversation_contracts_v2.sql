-- Stage 2B Data Train D2 / Collaboration v2
-- Participant-aware read/write contracts, read state, and private Realtime authorization.
-- Legacy v1 RPCs and Stage 1 sequence ordering remain intact.

create or replace function private.can_access_sanad_agent_thread_v2(
  p_thread_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.sanad_agent_thread_participants p
    join public.sanad_agent_threads t on t.id=p.thread_id
    where p.thread_id=p_thread_id
      and p.user_id=p_user_id
      and p.status='active'
      and (
        t.business_id is null
        or private.user_is_business_owner(t.business_id,p_user_id)
        or private.user_is_active_business_member(t.business_id,p_user_id)
      )
  );
$function$;

create or replace function private.can_write_sanad_agent_thread_v2(
  p_thread_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.sanad_agent_thread_participants p
    join public.sanad_agent_threads t on t.id=p.thread_id
    where p.thread_id=p_thread_id
      and p.user_id=p_user_id
      and p.status='active'
      and p.participant_role in ('owner','member')
      and (
        t.business_id is null
        or private.user_is_business_owner(t.business_id,p_user_id)
        or private.user_is_active_business_member(t.business_id,p_user_id)
      )
  );
$function$;

create or replace function private.can_manage_sanad_agent_thread_v2(
  p_thread_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.sanad_agent_thread_participants p
    where p.thread_id=p_thread_id
      and p.user_id=p_user_id
      and p.status='active'
      and p.participant_role='owner'
  );
$function$;

revoke all on function private.can_access_sanad_agent_thread_v2(uuid,uuid) from public,anon;
revoke all on function private.can_write_sanad_agent_thread_v2(uuid,uuid) from public,anon;
revoke all on function private.can_manage_sanad_agent_thread_v2(uuid,uuid) from public,anon;
grant usage on schema private to authenticated,service_role;
grant execute on function private.can_access_sanad_agent_thread_v2(uuid,uuid) to authenticated,service_role;
grant execute on function private.can_write_sanad_agent_thread_v2(uuid,uuid) to authenticated,service_role;
grant execute on function private.can_manage_sanad_agent_thread_v2(uuid,uuid) to authenticated,service_role;

drop policy if exists sanad_agent_threads_participant_read_v2 on public.sanad_agent_threads;
create policy sanad_agent_threads_participant_read_v2
on public.sanad_agent_threads
for select
to authenticated
using (private.can_access_sanad_agent_thread_v2(id,(select auth.uid())));

drop policy if exists sanad_agent_messages_participant_read_v2 on public.sanad_agent_messages;
create policy sanad_agent_messages_participant_read_v2
on public.sanad_agent_messages
for select
to authenticated
using (private.can_access_sanad_agent_thread_v2(thread_id,(select auth.uid())));

grant select on public.sanad_agent_threads to authenticated;
grant select on public.sanad_agent_messages to authenticated;

create or replace function public.list_my_sanad_agent_threads_v2(
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
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',x.id,
        'owner_user_id',x.user_id,
        'business_id',x.business_id,
        'title',x.title,
        'status',x.status,
        'summary',x.summary,
        'last_message_at',x.last_message_at,
        'message_count',x.message_count,
        'created_at',x.created_at,
        'updated_at',x.updated_at,
        'my_role',x.participant_role,
        'last_read_sequence_no',x.last_read_sequence_no,
        'unread_count',x.unread_count
      )
      order by x.last_message_at desc nulls last,x.created_at desc
    )
    from (
      select
        t.*,
        p.participant_role,
        p.last_read_sequence_no,
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
      where private.can_access_sanad_agent_thread_v2(t.id,v_uid)
      order by t.last_message_at desc nulls last,t.created_at desc
      limit v_limit
    ) x
  ),'[]'::jsonb);
end;
$function$;

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
          'author_user_id',m.author_user_id,
          'author_name',ap.full_name,
          'author_avatar_path',ap.avatar_path,
          'created_at',m.created_at
        )
        order by m.sequence_no
      )
      from (
        select *
        from public.sanad_agent_messages
        where thread_id=v_thread.id
        order by sequence_no desc
        limit v_limit
      ) m
      left join public.profiles ap on ap.id=m.author_user_id
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.get_my_sanad_agent_context_v2(
  p_thread_id uuid,
  p_recent_limit integer default 24,
  p_memory_limit integer default 30
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
  v_role text;
  v_recent integer := greatest(1,least(coalesce(p_recent_limit,24),60));
  v_memories integer := greatest(1,least(coalesce(p_memory_limit,30),60));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.can_access_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  select * into v_thread from public.sanad_agent_threads where id=p_thread_id;
  select participant_role into v_role
  from public.sanad_agent_thread_participants
  where thread_id=p_thread_id and user_id=v_uid and status='active';

  return jsonb_build_object(
    'thread',jsonb_build_object(
      'id',v_thread.id,
      'owner_user_id',v_thread.user_id,
      'business_id',v_thread.business_id,
      'title',v_thread.title,
      'summary',v_thread.summary,
      'message_count',v_thread.message_count,
      'my_role',v_role
    ),
    'recent_messages',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sequence_no',m.sequence_no,
          'role',m.role,
          'content',m.content,
          'author_user_id',m.author_user_id,
          'created_at',m.created_at
        )
        order by m.sequence_no
      )
      from (
        select *
        from public.sanad_agent_messages
        where thread_id=v_thread.id
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
$function$;

create or replace function public.list_my_sanad_agent_thread_participants_v1(
  p_thread_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if not private.can_access_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id',p.user_id,
        'role',p.participant_role,
        'status',p.status,
        'joined_at',p.joined_at,
        'left_at',p.left_at,
        'last_read_sequence_no',p.last_read_sequence_no,
        'notification_level',p.notification_level,
        'full_name',pr.full_name,
        'avatar_path',pr.avatar_path
      )
      order by case p.participant_role when 'owner' then 0 when 'member' then 1 else 2 end,
               p.joined_at,p.user_id
    )
    from public.sanad_agent_thread_participants p
    left join public.profiles pr on pr.id=p.user_id
    where p.thread_id=p_thread_id
  ),'[]'::jsonb);
end;
$function$;

create or replace function public.add_my_sanad_agent_thread_participant_v1(
  p_thread_id uuid,
  p_user_id uuid,
  p_role text default 'member'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_role text := lower(btrim(coalesce(p_role,'member')));
  v_row public.sanad_agent_thread_participants%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if not private.can_manage_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'thread_management_required' using errcode='42501';
  end if;
  if p_user_id is null then
    raise exception 'participant_user_required' using errcode='22023';
  end if;
  if v_role not in ('member','viewer') then
    raise exception 'invalid_participant_role' using errcode='22023';
  end if;

  select * into v_thread from public.sanad_agent_threads where id=p_thread_id for update;

  if p_user_id=v_thread.user_id then
    select * into v_row
    from public.sanad_agent_thread_participants
    where thread_id=p_thread_id and user_id=p_user_id;
    return to_jsonb(v_row);
  end if;

  if not exists (
    select 1 from public.profiles
    where id=p_user_id and status='active'
  ) then
    raise exception 'participant_profile_not_found' using errcode='P0002';
  end if;

  if v_thread.business_id is not null and not (
    private.user_is_business_owner(v_thread.business_id,p_user_id)
    or private.user_is_active_business_member(v_thread.business_id,p_user_id)
  ) then
    raise exception 'participant_business_access_required' using errcode='42501';
  end if;

  insert into public.sanad_agent_thread_participants(
    thread_id,user_id,participant_role,status,joined_at,left_at,
    added_by_user_id,last_read_sequence_no,notification_level,metadata
  ) values (
    p_thread_id,p_user_id,v_role,'active',now(),null,
    v_uid,0,'all',jsonb_build_object('added_via','shared_thread_v1')
  )
  on conflict (thread_id,user_id) do update
    set participant_role=excluded.participant_role,
        status='active',
        joined_at=case
          when public.sanad_agent_thread_participants.status='active'
            then public.sanad_agent_thread_participants.joined_at
          else now()
        end,
        left_at=null,
        added_by_user_id=v_uid,
        updated_at=now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

create or replace function public.remove_my_sanad_agent_thread_participant_v1(
  p_thread_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_row public.sanad_agent_thread_participants%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if not private.can_manage_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'thread_management_required' using errcode='42501';
  end if;

  select user_id into v_owner from public.sanad_agent_threads where id=p_thread_id;
  if v_owner is null then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;
  if p_user_id=v_owner then
    raise exception 'thread_owner_cannot_be_removed' using errcode='22023';
  end if;

  update public.sanad_agent_thread_participants
  set status='removed',left_at=now(),updated_at=now()
  where thread_id=p_thread_id
    and user_id=p_user_id
    and status='active'
  returning * into v_row;

  if not found then
    raise exception 'participant_not_found' using errcode='P0002';
  end if;

  return to_jsonb(v_row);
end;
$function$;

create or replace function public.mark_my_sanad_agent_thread_read_v1(
  p_thread_id uuid,
  p_sequence_no bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_max bigint;
  v_target bigint;
  v_row public.sanad_agent_thread_participants%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if not private.can_access_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  select greatest(next_message_sequence-1,0)
  into v_max
  from public.sanad_agent_threads
  where id=p_thread_id;

  v_target := least(greatest(coalesce(p_sequence_no,v_max),0),v_max);

  update public.sanad_agent_thread_participants
  set last_read_sequence_no=greatest(last_read_sequence_no,v_target),
      updated_at=now()
  where thread_id=p_thread_id and user_id=v_uid and status='active'
  returning * into v_row;

  return jsonb_build_object(
    'thread_id',p_thread_id,
    'last_read_sequence_no',v_row.last_read_sequence_no
  );
end;
$function$;

create or replace function public.save_sanad_agent_turn_v3(
  p_actor_user_id uuid,
  p_thread_id uuid,
  p_user_message text,
  p_assistant_message text,
  p_response jsonb,
  p_tool_trace jsonb,
  p_request_id uuid,
  p_model text,
  p_thinking_level text,
  p_business_id uuid default null::uuid,
  p_attachment_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_thread public.sanad_agent_threads%rowtype;
  v_user_message_id uuid := gen_random_uuid();
  v_assistant_message_id uuid := gen_random_uuid();
  v_user_sequence bigint;
  v_assistant_sequence bigint;
  v_title text;
  v_attachment_ids uuid[] := coalesce(p_attachment_ids,'{}'::uuid[]);
begin
  if p_actor_user_id is null or p_thread_id is null then
    raise exception 'actor_and_thread_required' using errcode='22023';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id
  for update;

  if not found or not private.can_write_sanad_agent_thread_v2(p_thread_id,p_actor_user_id) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;
  if v_thread.status <> 'active' then
    raise exception 'agent_thread_archived' using errcode='22023';
  end if;
  if p_business_id is distinct from v_thread.business_id and p_business_id is not null then
    raise exception 'thread_business_context_mismatch' using errcode='22023';
  end if;
  if cardinality(v_attachment_ids) > 5 then
    raise exception 'too_many_attachments' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(v_attachment_ids) x(id)
    left join public.sanad_agent_attachments a
      on a.id=x.id
     and a.user_id=p_actor_user_id
     and a.thread_id=p_thread_id
     and a.status='ready'
    where a.id is null
  ) then
    raise exception 'attachment_not_ready_or_not_owned' using errcode='22023';
  end if;

  v_user_sequence := v_thread.next_message_sequence;
  v_assistant_sequence := v_user_sequence+1;

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,author_user_id,sequence_no,role,content,request_id,attachment_ids
  ) values (
    v_user_message_id,p_thread_id,v_thread.user_id,p_actor_user_id,v_user_sequence,'user',
    left(coalesce(p_user_message,''),20000),p_request_id,v_attachment_ids
  );

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,author_user_id,sequence_no,role,content,response,tool_trace,
    request_id,model,thinking_level
  ) values (
    v_assistant_message_id,p_thread_id,v_thread.user_id,null,v_assistant_sequence,'assistant',
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

  update public.sanad_agent_thread_participants
  set last_read_sequence_no=greatest(last_read_sequence_no,v_assistant_sequence),
      updated_at=now()
  where thread_id=p_thread_id and user_id=p_actor_user_id and status='active';

  return jsonb_build_object(
    'thread_id',p_thread_id,
    'actor_user_id',p_actor_user_id,
    'owner_user_id',v_thread.user_id,
    'user_message_id',v_user_message_id,
    'assistant_message_id',v_assistant_message_id,
    'user_sequence_no',v_user_sequence,
    'assistant_sequence_no',v_assistant_sequence,
    'title',v_title,
    'attachment_ids',to_jsonb(v_attachment_ids)
  );
end;
$function$;

revoke all on function public.list_my_sanad_agent_threads_v2(integer) from public,anon;
revoke all on function public.get_my_sanad_agent_thread_v2(uuid,integer) from public,anon;
revoke all on function public.get_my_sanad_agent_context_v2(uuid,integer,integer) from public,anon;
revoke all on function public.list_my_sanad_agent_thread_participants_v1(uuid) from public,anon;
revoke all on function public.add_my_sanad_agent_thread_participant_v1(uuid,uuid,text) from public,anon;
revoke all on function public.remove_my_sanad_agent_thread_participant_v1(uuid,uuid) from public,anon;
revoke all on function public.mark_my_sanad_agent_thread_read_v1(uuid,bigint) from public,anon;
revoke all on function public.save_sanad_agent_turn_v3(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,uuid[]) from public,anon,authenticated;

grant execute on function public.list_my_sanad_agent_threads_v2(integer) to authenticated;
grant execute on function public.get_my_sanad_agent_thread_v2(uuid,integer) to authenticated;
grant execute on function public.get_my_sanad_agent_context_v2(uuid,integer,integer) to authenticated;
grant execute on function public.list_my_sanad_agent_thread_participants_v1(uuid) to authenticated;
grant execute on function public.add_my_sanad_agent_thread_participant_v1(uuid,uuid,text) to authenticated;
grant execute on function public.remove_my_sanad_agent_thread_participant_v1(uuid,uuid) to authenticated;
grant execute on function public.mark_my_sanad_agent_thread_read_v1(uuid,bigint) to authenticated;
grant execute on function public.save_sanad_agent_turn_v3(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,uuid[]) to service_role;

create or replace function private.sanad_thread_id_from_realtime_topic_v1(
  p_topic text
)
returns uuid
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_text text;
begin
  if p_topic is null or p_topic !~ '^sanad-thread:[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  v_text := split_part(p_topic,':',2);
  return v_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$function$;

revoke all on function private.sanad_thread_id_from_realtime_topic_v1(text) from public,anon;
grant execute on function private.sanad_thread_id_from_realtime_topic_v1(text) to authenticated,service_role;

drop policy if exists "sanad thread participants receive private collaboration" on realtime.messages;
create policy "sanad thread participants receive private collaboration"
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast','presence')
  and private.can_access_sanad_agent_thread_v2(
    private.sanad_thread_id_from_realtime_topic_v1((select realtime.topic())),
    (select auth.uid())
  )
);

drop policy if exists "sanad thread members send private collaboration" on realtime.messages;
create policy "sanad thread members send private collaboration"
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast','presence')
  and private.can_write_sanad_agent_thread_v2(
    private.sanad_thread_id_from_realtime_topic_v1((select realtime.topic())),
    (select auth.uid())
  )
);

comment on function public.get_my_sanad_agent_context_v2(uuid,integer,integer) is
'Participant-aware shared-thread context. Conversation history is shared; preferences and memories remain scoped to the authenticated actor.';
comment on function public.save_sanad_agent_turn_v3(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,uuid[]) is
'Service-only participant-aware turn persistence. Legacy message.user_id remains the thread owner for compatibility while author_user_id records the human actor.';

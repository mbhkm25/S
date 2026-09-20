-- SANAD Agent Visual v3 message actions
-- Persist only user-owned UI feedback. Copy/share remain client-side actions.

alter table public.sanad_agent_messages
  add column if not exists is_starred boolean not null default false,
  add column if not exists rating smallint null
    check (rating is null or rating in (-1, 1)),
  add column if not exists rating_updated_at timestamptz null;

create index if not exists sanad_agent_messages_user_starred_idx
  on public.sanad_agent_messages(user_id, created_at desc)
  where is_starred = true;

create or replace function public.update_my_sanad_agent_message_feedback_v1(
  p_message_id uuid,
  p_is_starred boolean default null,
  p_rating smallint default null,
  p_clear_rating boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if p_rating is not null and p_rating not in (-1,1) then
    raise exception 'invalid_rating' using errcode='22023';
  end if;

  select * into v_row
  from public.sanad_agent_messages
  where id=p_message_id and user_id=v_uid
  for update;

  if not found then
    raise exception 'agent_message_not_found' using errcode='P0002';
  end if;

  update public.sanad_agent_messages
  set
    is_starred=coalesce(p_is_starred,is_starred),
    rating=case
      when p_clear_rating then null
      when p_rating is not null then p_rating
      else rating
    end,
    rating_updated_at=case
      when p_clear_rating or p_rating is not null then now()
      else rating_updated_at
    end
  where id=p_message_id
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'is_starred',v_row.is_starred,
    'rating',v_row.rating,
    'rating_updated_at',v_row.rating_updated_at
  );
end;
$$;

revoke all on function public.update_my_sanad_agent_message_feedback_v1(uuid,boolean,smallint,boolean)
  from public,anon;
grant execute on function public.update_my_sanad_agent_message_feedback_v1(uuid,boolean,smallint,boolean)
  to authenticated;


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
          'is_starred',m.is_starred,
          'rating',m.rating,
          'rating_updated_at',m.rating_updated_at,
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

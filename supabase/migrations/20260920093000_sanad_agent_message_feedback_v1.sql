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

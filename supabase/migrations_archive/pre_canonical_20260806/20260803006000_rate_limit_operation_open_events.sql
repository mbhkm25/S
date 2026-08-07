begin;

create or replace function public.log_operation_opened(
  p_token uuid,
  p_event_type text default 'opened'
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_operation public.operations%rowtype;
  v_uid uuid := auth.uid();
  v_phone text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_event_type not in ('opened','file_opened') then
    raise exception 'invalid_event_type';
  end if;

  select p.phone into v_phone
  from public.profiles p
  where p.id = v_uid;

  select * into v_operation
  from public.operations
  where public_token = p_token
    and token_status = 'active'
    and (token_expires_at is null or token_expires_at > now());

  if not found then
    raise exception 'operation_not_found_or_token_expired';
  end if;

  -- Opening the same resource repeatedly during one UI session must not create
  -- an unbounded audit stream. The access itself remains unaffected.
  if exists (
    select 1
    from public.operation_events e
    where e.operation_id = v_operation.id
      and e.event_type = p_event_type
      and e.actor_user_id = v_uid
      and e.created_at >= now() - interval '1 minute'
  ) then
    return;
  end if;

  insert into public.operation_events(
    operation_id, event_type, actor_user_id, actor_phone, source, metadata
  ) values (
    v_operation.id, p_event_type, v_uid, v_phone, 'authenticated_token',
    jsonb_build_object('dedupe_window_seconds', 60)
  );
end;
$function$;

revoke execute on function public.log_operation_opened(uuid, text) from public, anon;
grant execute on function public.log_operation_opened(uuid, text) to authenticated, service_role;

comment on function public.log_operation_opened(uuid, text) is
  'Authenticated token-access audit event with a one-minute per-user/event deduplication window.';

commit;

-- SANAD unified operation workflow.
-- The operation is the source entity; business links and payment inbox rows are
-- projections of the same lifecycle. Every action is mirrored to operation_events.

alter table public.business_payment_inbox
  add column if not exists claimed_source text,
  add column if not exists completed_source text,
  add column if not exists last_action_source text;

comment on column public.business_payment_inbox.claimed_source is
  'Entry point that claimed the operation, such as payment_inbox or qr_details.';
comment on column public.business_payment_inbox.completed_source is
  'Entry point that completed the operational review.';
comment on column public.business_payment_inbox.last_action_source is
  'Most recent command entry point affecting this operational projection.';

create or replace function private.mirror_business_payment_event_to_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := coalesce(nullif(new.metadata ->> 'source', ''), 'payment_inbox');
begin
  update public.business_payment_inbox
  set last_action_source = v_source,
      claimed_source = case
        when new.event_type in ('claimed','reassigned','claim_renewed') then coalesce(claimed_source,v_source)
        else claimed_source
      end,
      completed_source = case
        when new.event_type = 'completed' then coalesce(completed_source,v_source)
        else completed_source
      end
  where id = new.inbox_id;

  insert into public.operation_events(
    operation_id,
    event_type,
    actor_user_id,
    metadata,
    source
  ) values (
    new.operation_id,
    'business_payment_' || new.event_type,
    new.actor_user_id,
    jsonb_build_object(
      'inbox_event_id', new.id,
      'inbox_id', new.inbox_id,
      'business_id', new.business_id,
      'from_status', new.from_status,
      'to_status', new.to_status,
      'reason', new.reason,
      'details', coalesce(new.metadata, '{}'::jsonb)
    ),
    v_source
  );
  return new;
end;
$$;

drop trigger if exists trg_mirror_business_payment_event_to_operation
  on public.business_payment_inbox_events;
create trigger trg_mirror_business_payment_event_to_operation
after insert on public.business_payment_inbox_events
for each row execute function private.mirror_business_payment_event_to_operation();

create or replace function public.complete_operation_workflow(
  p_operation_id uuid default null,
  p_token uuid default null,
  p_business_id uuid default null,
  p_inbox_id uuid default null,
  p_note text default null,
  p_source text default 'operation_details'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_operation public.operations%rowtype;
  v_inbox public.business_payment_inbox%rowtype;
  v_link public.business_operation_links%rowtype;
  v_business_id uuid := p_business_id;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_source text := lower(trim(coalesce(p_source, 'operation_details')));
  v_from text;
  v_previous_claimant uuid;
  v_idempotent boolean := false;
  v_existing_verification boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_operation_id is null and p_token is null and p_inbox_id is null then
    raise exception 'operation_identifier_required';
  end if;
  if v_source not in (
    'payment_inbox','qr_details','direct_link','operation_details',
    'business_link_after_verification','notification','admin','system'
  ) then
    raise exception 'invalid_operation_action_source';
  end if;

  select phone into v_phone from public.profiles where id = v_uid;

  if p_inbox_id is not null then
    select o.* into v_operation
    from public.business_payment_inbox i
    join public.operations o on o.id = i.operation_id
    where i.id = p_inbox_id
    for update of o;
  else
    select * into v_operation
    from public.operations
    where (p_operation_id is not null and id = p_operation_id)
       or (p_operation_id is null and public_token = p_token
           and token_status = 'active'
           and (token_expires_at is null or token_expires_at > now()))
    order by case when id = p_operation_id then 0 else 1 end
    limit 1
    for update;
  end if;

  if not found then
    raise exception 'operation_not_found_or_token_expired';
  end if;
  if p_token is not null and v_operation.public_token <> p_token then
    raise exception 'operation_token_mismatch' using errcode = '42501';
  end if;

  -- Lock and validate the operational projection before recording a verifier.
  if p_inbox_id is not null then
    select * into v_inbox from public.business_payment_inbox where id = p_inbox_id for update;
    if not found then raise exception 'payment_inbox_item_not_found'; end if;
    if v_business_id is not null and v_business_id <> v_inbox.business_id then
      raise exception 'payment_inbox_business_mismatch';
    end if;
    v_business_id := v_inbox.business_id;
  elsif v_business_id is not null then
    select * into v_inbox
    from public.business_payment_inbox
    where business_id = v_business_id and operation_id = v_operation.id
    for update;
  end if;

  if v_business_id is not null then
    if not private.has_business_payment_permission(v_business_id, 'complete', v_uid) then
      raise exception 'payment_inbox_complete_required' using errcode = '42501';
    end if;
    if v_inbox.id is not null and v_inbox.status = 'completed' then
      if v_inbox.completed_by_user_id is distinct from v_uid then
        raise exception 'operation_already_completed_by_another_user' using errcode = '42501';
      end if;
      v_idempotent := true;
    elsif v_inbox.id is not null and v_inbox.status in ('rejected','cancelled','review_required') then
      raise exception 'payment_inbox_item_not_completable';
    elsif v_inbox.id is not null
          and v_inbox.status = 'claimed'
          and v_inbox.claimed_by_user_id <> v_uid
          and not private.has_business_payment_permission(v_business_id,'reassign',v_uid) then
      raise exception 'payment_claim_owned_by_another_user' using errcode = '42501';
    end if;
  end if;

  select exists(
    select 1 from public.operation_user_links l
    where l.operation_id = v_operation.id
      and l.user_id = v_uid
      and l.relation_type = 'verifier'
  ) into v_existing_verification;

  perform app.link_operation_user(
    v_operation.id,
    v_uid,
    v_phone,
    'verifier',
    v_source,
    jsonb_build_object('note', v_note, 'business_id', v_business_id)
  );

  update public.operations o
  set status = case when o.status in ('stored','processing','ready') then 'verified' else o.status end,
      verified_by_user_id = coalesce(o.verified_by_user_id, v_uid),
      verified_at = coalesce(o.verified_at, now()),
      verification_note = coalesce(v_note, o.verification_note),
      updated_at = now()
  where o.id = v_operation.id
  returning * into v_operation;

  if not v_existing_verification then
    insert into public.operation_events(operation_id,event_type,actor_user_id,actor_phone,metadata,source)
    values (
      v_operation.id,
      'verification_recorded',
      v_uid,
      v_phone,
      jsonb_build_object('note',v_note,'business_id',v_business_id),
      v_source
    );
  end if;

  if v_business_id is null then
    return jsonb_build_object(
      'ok', true,
      'operation_id', v_operation.id,
      'operation_status', v_operation.status,
      'verified_by_user_id', v_uid,
      'verified_at', v_operation.verified_at,
      'business_id', null,
      'inbox', null,
      'idempotent', v_existing_verification,
      'source', v_source
    );
  end if;

  insert into public.business_operation_links(
    business_id, operation_id, linked_by_user_id, verified_by_user_id,
    link_type, status, metadata
  ) values (
    v_business_id, v_operation.id, v_uid, v_uid,
    case when v_source = 'payment_inbox' then 'payment_inbox_completion' else 'manual_after_verification' end,
    'linked',
    jsonb_build_object('source',v_source,'unified_workflow',true)
  )
  on conflict (business_id, operation_id) do update set
    status = 'linked',
    verified_by_user_id = excluded.verified_by_user_id,
    unlinked_at = null,
    unlinked_by_user_id = null,
    metadata = coalesce(public.business_operation_links.metadata,'{}'::jsonb) || excluded.metadata,
    updated_at = now()
  returning * into v_link;

  if v_inbox.id is null then
    insert into public.business_payment_inbox(
      business_id, operation_id, source_mode, status, priority,
      routing_snapshot, completed_by_user_id, completed_at, completion_note,
      completed_source, last_action_source
    ) values (
      v_business_id, v_operation.id, 'manual', 'completed', 0,
      jsonb_build_object('source',v_source,'manual_projection',true),
      v_uid, now(), left(v_note,1000), v_source, v_source
    ) returning * into v_inbox;

    perform private.record_business_payment_inbox_event(
      v_inbox.id,'claimed',v_uid,'new','claimed',null,
      jsonb_build_object('source',v_source,'implicit',true)
    );
    perform private.record_business_payment_inbox_event(
      v_inbox.id,'completed',v_uid,'claimed','completed',v_note,
      jsonb_build_object('source',v_source,'implicit_claim',true)
    );
  elsif not v_idempotent then
    v_from := v_inbox.status;
    v_previous_claimant := v_inbox.claimed_by_user_id;

    if v_inbox.status in ('new','released') then
      update public.business_payment_inbox
      set status='claimed', claimed_by_user_id=v_uid, claimed_at=now(),
          claim_expires_at=now()+interval '5 minutes', claimed_source=v_source,
          last_action_source=v_source, updated_at=now(), row_version=row_version+1
      where id=v_inbox.id returning * into v_inbox;
      perform private.record_business_payment_inbox_event(
        v_inbox.id,'claimed',v_uid,v_from,'claimed',null,
        jsonb_build_object('source',v_source,'implicit',true)
      );
      v_from := 'claimed';
    end if;

    update public.business_payment_inbox
    set status='completed', completed_by_user_id=v_uid, completed_at=now(),
        completion_note=left(v_note,1000), completed_source=v_source,
        last_action_source=v_source,
        claimed_by_user_id=null, claimed_at=null, claim_expires_at=null,
        updated_at=now(), row_version=row_version+1
    where id=v_inbox.id
    returning * into v_inbox;

    perform private.record_business_payment_inbox_event(
      v_inbox.id,'completed',v_uid,v_from,'completed',v_note,
      jsonb_build_object(
        'source',v_source,
        'overrode_other_claim', v_previous_claimant is not null and v_previous_claimant <> v_uid
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'operation_id', v_operation.id,
    'operation_status', v_operation.status,
    'verified_by_user_id', v_uid,
    'verified_at', v_operation.verified_at,
    'business_id', v_business_id,
    'business_link', to_jsonb(v_link),
    'inbox', to_jsonb(v_inbox),
    'idempotent', v_idempotent,
    'source', v_source
  );
end;
$$;

revoke all on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) from public;
revoke all on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) from anon;
grant execute on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.verify_operation_v2(
  p_token uuid,
  p_business_id uuid default null,
  p_note text default null,
  p_source text default 'qr_details'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  return public.complete_operation_workflow(null,p_token,p_business_id,null,p_note,p_source);
end;
$$;
revoke all on function public.verify_operation_v2(uuid,uuid,text,text) from public;
revoke all on function public.verify_operation_v2(uuid,uuid,text,text) from anon;
grant execute on function public.verify_operation_v2(uuid,uuid,text,text) to authenticated;

-- Legacy client contract. When exactly one operational inbox is accessible to the
-- current user, a QR verification completes that same inbox record atomically.
create or replace function public.verify_operation(p_token uuid, p_note text default null)
returns table(operation_id uuid,status text,relation_type text,verified_by_user_id uuid,verified_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_operation_id uuid;
  v_business_id uuid;
  v_business_count integer;
begin
  select o.id into v_operation_id
  from public.operations o
  where o.public_token=p_token and o.token_status='active'
    and (o.token_expires_at is null or o.token_expires_at>now());
  if not found then raise exception 'operation_not_found_or_token_expired'; end if;

  select min(i.business_id),count(distinct i.business_id)
  into v_business_id,v_business_count
  from public.business_payment_inbox i
  where i.operation_id=v_operation_id
    and private.has_business_payment_permission(i.business_id,'complete',auth.uid());

  if v_business_count <> 1 then v_business_id := null; end if;

  v_result := public.complete_operation_workflow(
    v_operation_id,p_token,v_business_id,null,p_note,'qr_details'
  );
  operation_id := (v_result->>'operation_id')::uuid;
  status := v_result->>'operation_status';
  relation_type := 'verifier';
  verified_by_user_id := (v_result->>'verified_by_user_id')::uuid;
  verified_at := (v_result->>'verified_at')::timestamptz;
  return next;
end;
$$;

create or replace function public.complete_business_payment(p_inbox_id uuid,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  return public.complete_operation_workflow(null,null,null,p_inbox_id,p_note,'payment_inbox');
end;
$$;

create or replace function public.link_operation_to_business(p_operation_id uuid,p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_can_link boolean;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists(
    select 1 from public.business_team_members m
    where m.business_id=p_business_id and m.user_id=v_uid and m.status='active'
  ) and not exists(
    select 1 from public.business_profiles b where b.id=p_business_id and b.owner_user_id=v_uid
  ) then
    raise exception 'active_team_membership_required';
  end if;
  select exists(
    select 1 from public.operation_user_links l
    where l.operation_id=p_operation_id and l.user_id=v_uid and l.relation_type='verifier'
  ) into v_can_link;
  if not v_can_link then raise exception 'operation_must_be_verified_by_current_user'; end if;

  v_result := public.complete_operation_workflow(
    p_operation_id,null,p_business_id,null,null,'business_link_after_verification'
  );
  return jsonb_build_object(
    'ok',true,
    'link',v_result->'business_link',
    'inbox',v_result->'inbox',
    'workflow',v_result
  );
end;
$$;

create or replace function public.get_operation_workflow_state(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_operation public.operations%rowtype; v_states jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_operation from public.operations
  where public_token=p_token and token_status='active'
    and (token_expires_at is null or token_expires_at>now());
  if not found then raise exception 'operation_not_found_or_token_expired'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id',i.business_id,
    'business_name',b.name,
    'inbox_id',i.id,
    'status',i.status,
    'claimed_by_user_id',i.claimed_by_user_id,
    'claimed_by_name',cp.full_name,
    'claimed_at',i.claimed_at,
    'claimed_source',i.claimed_source,
    'completed_by_user_id',i.completed_by_user_id,
    'completed_by_name',ep.full_name,
    'completed_at',i.completed_at,
    'completed_source',i.completed_source,
    'completion_note',i.completion_note,
    'row_version',i.row_version
  ) order by i.updated_at desc),'[]'::jsonb)
  into v_states
  from public.business_payment_inbox i
  join public.business_profiles b on b.id=i.business_id
  left join public.profiles cp on cp.id=i.claimed_by_user_id
  left join public.profiles ep on ep.id=i.completed_by_user_id
  where i.operation_id=v_operation.id
    and private.has_business_payment_permission(i.business_id,'view',auth.uid());

  return jsonb_build_object(
    'operation_id',v_operation.id,
    'operation_status',v_operation.status,
    'verified_by_user_id',v_operation.verified_by_user_id,
    'verified_at',v_operation.verified_at,
    'verified_by_me',exists(
      select 1 from public.operation_user_links l
      where l.operation_id=v_operation.id and l.user_id=auth.uid() and l.relation_type='verifier'
    ),
    'business_states',v_states
  );
end;
$$;

revoke all on function public.get_operation_workflow_state(uuid) from public;
revoke all on function public.get_operation_workflow_state(uuid) from anon;
grant execute on function public.get_operation_workflow_state(uuid) to authenticated;

comment on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) is
  'Atomic source-of-truth command that records verification, business link and payment inbox completion for one operation from any entry point.';
comment on function public.verify_operation_v2(uuid,uuid,text,text) is
  'Explicit verification command for new clients, with business context and entry-point source.';
comment on function public.get_operation_workflow_state(uuid) is
  'Returns the current unified operation and accessible business-payment workflow states for a token.';

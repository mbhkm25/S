-- Payment inbox canonical completion semantics.
-- One canonical financial operation keeps one original verifier; inbox handling
-- may be claimed/completed by other business members without creating a second verifier.

create or replace function private.complete_operation_workflow_core(
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
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_operation public.operations%rowtype;
  v_inbox public.business_payment_inbox%rowtype;
  v_link public.business_operation_links%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_source text := lower(trim(coalesce(p_source, 'operation_details')));
  v_from text;
  v_idempotent boolean := false;
  v_existing_verification boolean := false;
  v_original_verifier_user_id uuid;
  v_original_verified_at timestamptz;
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

  if p_inbox_id is not null then
    select * into v_inbox from public.business_payment_inbox where id = p_inbox_id for update;
    if not found then raise exception 'payment_inbox_item_not_found'; end if;
    if p_business_id is not null and p_business_id <> v_inbox.business_id then
      raise exception 'payment_inbox_business_mismatch';
    end if;
    p_business_id := v_inbox.business_id;
  elsif p_business_id is not null then
    select * into v_inbox
    from public.business_payment_inbox
    where business_id = p_business_id and operation_id = v_operation.id
    for update;
  end if;

  if v_inbox.id is not null then
    if v_inbox.status = 'completed' then
      if v_inbox.completed_by_user_id <> v_uid then
        raise exception 'payment_completed_by_another_user' using errcode = '42501';
      end if;
      v_idempotent := true;
    elsif v_inbox.status in ('rejected','cancelled','review_required') then
      raise exception 'payment_inbox_item_not_completable';
    elsif v_inbox.status = 'claimed'
          and v_inbox.claimed_by_user_id <> v_uid
          and not private.has_business_payment_permission(v_inbox.business_id,'reassign',v_uid) then
      raise exception 'payment_claim_owned_by_another_user' using errcode = '42501';
    end if;
  end if;

  -- Resolve the earliest/original verifier once. Completing a business inbox item
  -- must not turn the completer into another verifier when verification already exists.
  select l.user_id, coalesce(l.first_seen_at, l.created_at)
  into v_original_verifier_user_id, v_original_verified_at
  from public.operation_user_links l
  where l.operation_id = v_operation.id
    and l.relation_type = 'verifier'
  order by coalesce(l.first_seen_at, l.created_at), l.created_at, l.id
  limit 1;

  v_existing_verification :=
       v_operation.verified_by_user_id is not null
    or v_operation.verified_at is not null
    or v_original_verified_at is not null;

  if not v_existing_verification then
    perform app.link_operation_user(
      v_operation.id,
      v_uid,
      v_phone,
      'verifier',
      v_source,
      jsonb_build_object('note', v_note, 'business_id', p_business_id)
    );

    update public.operations o
    set status = case when o.status in ('stored','processing','ready') then 'verified' else o.status end,
        verified_by_user_id = coalesce(o.verified_by_user_id, v_uid),
        verified_at = coalesce(o.verified_at, now()),
        verification_note = coalesce(v_note, o.verification_note),
        updated_at = now()
    where o.id = v_operation.id
    returning * into v_operation;

    insert into public.operation_events(operation_id,event_type,actor_user_id,actor_phone,metadata,source)
    values (
      v_operation.id,
      'verification_recorded',
      v_uid,
      v_phone,
      jsonb_build_object('note',v_note,'business_id',p_business_id),
      v_source
    );
  else
    -- Backfill only from the already-existing verifier link when safe. Never use
    -- the current inbox completer as a replacement for the original verifier.
    if (v_operation.verified_by_user_id is null and v_original_verifier_user_id is not null)
       or (v_operation.verified_at is null and v_original_verified_at is not null) then
      update public.operations o
      set verified_by_user_id = coalesce(o.verified_by_user_id, v_original_verifier_user_id),
          verified_at = coalesce(o.verified_at, v_original_verified_at),
          status = case when o.status in ('stored','processing','ready') then 'verified' else o.status end,
          updated_at = now()
      where o.id = v_operation.id
      returning * into v_operation;
    end if;
  end if;

  if p_business_id is null and p_inbox_id is null then
    return jsonb_build_object(
      'ok', true,
      'operation_id', v_operation.id,
      'operation_status', v_operation.status,
      'verified_by_user_id', v_operation.verified_by_user_id,
      'verified_at', v_operation.verified_at,
      'business_id', null,
      'inbox', null,
      'idempotent', v_existing_verification,
      'verification_reused', v_existing_verification,
      'source', v_source
    );
  end if;

  if not private.has_business_payment_permission(p_business_id, 'complete', v_uid) then
    raise exception 'payment_inbox_complete_required' using errcode = '42501';
  end if;

  insert into public.business_operation_links(
    business_id, operation_id, linked_by_user_id, verified_by_user_id,
    link_type, status, metadata
  ) values (
    p_business_id, v_operation.id, v_uid, v_operation.verified_by_user_id,
    case when v_source = 'payment_inbox' then 'payment_inbox_completion' else 'manual_after_verification' end,
    'linked',
    jsonb_build_object('source',v_source,'unified_workflow',true)
  )
  on conflict (business_id, operation_id) do update set
    status = 'linked',
    verified_by_user_id = coalesce(public.business_operation_links.verified_by_user_id, excluded.verified_by_user_id),
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
      p_business_id, v_operation.id, 'manual', 'completed', 0,
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
  elsif v_inbox.status = 'completed' then
    v_idempotent := true;
  else
    v_from := v_inbox.status;

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
      jsonb_build_object('source',v_source)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'operation_id', v_operation.id,
    'operation_status', v_operation.status,
    'verified_by_user_id', v_operation.verified_by_user_id,
    'verified_at', v_operation.verified_at,
    'business_id', p_business_id,
    'business_link', to_jsonb(v_link),
    'inbox', to_jsonb(v_inbox),
    'idempotent', v_idempotent,
    'verification_reused', v_existing_verification,
    'source', v_source
  );
end;
$function$;

-- V3 keeps the V2 inbox contract intact and enriches each item with the
-- operation's canonical/original verifier identity for UI attribution.
create or replace function public.get_business_payment_inbox_v3(
  p_business_id uuid,
  p_view text default 'new',
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payload jsonb;
  v_items jsonb;
begin
  v_payload := public.get_business_payment_inbox_v2(
    p_business_id,p_view,p_limit,p_before_created_at,p_before_id
  );

  select coalesce(jsonb_agg(
    x.item || jsonb_build_object(
      'verified_by_user_id', o.verified_by_user_id,
      'verified_by_name', vp.full_name,
      'verified_at', o.verified_at
    ) order by x.ord
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) with ordinality as x(item,ord)
  left join public.operations o on o.id=(x.item->>'operation_id')::uuid
  left join public.profiles vp on vp.id=o.verified_by_user_id;

  return jsonb_set(v_payload,'{items}',v_items,true)
    || jsonb_build_object('contract_version',3);
end;
$function$;

revoke all on function public.get_business_payment_inbox_v3(uuid,text,integer,timestamptz,uuid) from public, anon;
grant execute on function public.get_business_payment_inbox_v3(uuid,text,integer,timestamptz,uuid) to authenticated, service_role;

-- V2 reuse contract enriches exact-duplicate notices with canonical verifier
-- attribution and whether the current actor may resolve the duplicate safely.
create or replace function public.get_business_payment_reuse_notices_v2(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_payload jsonb;
  v_items jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not private.has_business_payment_permission(p_business_id,'view',v_uid) then
    raise exception 'payment_inbox_view_required' using errcode='42501';
  end if;

  v_payload := public.get_business_payment_reuse_notices(p_business_id);

  select coalesce(jsonb_agg(
    x.item || jsonb_build_object(
      'canonical_verified_by_user_id', c.verified_by_user_id,
      'canonical_verified_by_name', vp.full_name,
      'canonical_verified_at', c.verified_at,
      'canonical_inbox_row_version', ci.row_version,
      'canonical_claimed_by_user_id', ci.claimed_by_user_id,
      'canonical_completed_by_user_id', ci.completed_by_user_id,
      'can_resolve',
        private.has_business_payment_permission(p_business_id,'complete',v_uid)
        and case
          when ci.id is null then private.has_business_payment_permission(p_business_id,'claim',v_uid)
          when ci.status='completed' then true
          when ci.status in ('new','released') then private.has_business_payment_permission(p_business_id,'claim',v_uid)
          when ci.status='claimed' and ci.claimed_by_user_id=v_uid then true
          when ci.status='claimed' and ci.claimed_by_user_id<>v_uid then private.has_business_payment_permission(p_business_id,'reassign',v_uid)
          else false
        end
    ) order by x.ord
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) with ordinality as x(item,ord)
  join public.operations c on c.id=(x.item->>'canonical_operation_id')::uuid
  left join public.profiles vp on vp.id=c.verified_by_user_id
  left join public.business_payment_inbox ci
    on ci.business_id=p_business_id and ci.operation_id=c.id;

  return jsonb_build_object('items',v_items,'contract_version',2);
end;
$function$;

revoke all on function public.get_business_payment_reuse_notices_v2(uuid) from public, anon;
grant execute on function public.get_business_payment_reuse_notices_v2(uuid) to authenticated, service_role;

-- Resolve an exact-duplicate inbox row against its canonical operation.
-- The canonical workflow is the only workflow that can become completed;
-- the duplicate inbox row is closed as cancelled so it cannot be counted twice.
create or replace function public.resolve_business_payment_reuse_v1(
  p_inbox_id uuid,
  p_expected_row_version bigint default null,
  p_note text default null,
  p_source text default 'payment_inbox'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_source text := private.payment_inbox_action_source(p_source);
  v_duplicate public.business_payment_inbox%rowtype;
  v_canonical_inbox public.business_payment_inbox%rowtype;
  v_resolution jsonb;
  v_canonical_operation_id uuid;
  v_from text;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  select * into v_duplicate
  from public.business_payment_inbox
  where id=p_inbox_id
  for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;

  if p_expected_row_version is not null and v_duplicate.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(
      v_duplicate.id,'stale_action_rejected',v_uid,v_duplicate.status,v_duplicate.status,null,
      jsonb_build_object('action','resolve_reuse','expected_row_version',p_expected_row_version,
        'current_row_version',v_duplicate.row_version,'source',v_source)
    );
    return jsonb_build_object('ok',false,'reason','stale_item','current_row_version',v_duplicate.row_version,'status',v_duplicate.status);
  end if;

  if v_duplicate.status='cancelled' then
    return jsonb_build_object('ok',true,'idempotent',true,'duplicate_inbox_id',v_duplicate.id,'duplicate_status','cancelled');
  end if;
  if v_duplicate.status not in ('new','released','claimed') then
    return jsonb_build_object('ok',false,'reason','duplicate_not_resolvable','status',v_duplicate.status);
  end if;
  if v_duplicate.status='claimed'
     and v_duplicate.claimed_by_user_id<>v_uid
     and not private.has_business_payment_permission(v_duplicate.business_id,'reassign',v_uid) then
    raise exception 'payment_claim_owned_by_another_user' using errcode='42501';
  end if;
  if not private.has_business_payment_permission(v_duplicate.business_id,'complete',v_uid) then
    raise exception 'payment_inbox_complete_required' using errcode='42501';
  end if;

  v_resolution := private.operation_reuse_resolution(v_duplicate.operation_id);
  if coalesce((v_resolution->>'is_exact_duplicate')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'reason','not_exact_duplicate');
  end if;

  v_canonical_operation_id := nullif(v_resolution->>'canonical_operation_id','')::uuid;
  if v_canonical_operation_id is null or v_canonical_operation_id=v_duplicate.operation_id then
    return jsonb_build_object('ok',false,'reason','canonical_operation_missing');
  end if;

  perform 1 from public.operations where id=v_canonical_operation_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','canonical_operation_missing'); end if;

  select * into v_canonical_inbox
  from public.business_payment_inbox
  where business_id=v_duplicate.business_id and operation_id=v_canonical_operation_id
  for update;

  if v_canonical_inbox.id is not null then
    if v_canonical_inbox.status='completed' then
      v_result := jsonb_build_object(
        'ok',true,'idempotent',true,'canonical_operation_id',v_canonical_operation_id,
        'canonical_inbox_id',v_canonical_inbox.id,'canonical_status','completed'
      );
    elsif v_canonical_inbox.status in ('review_required','rejected','cancelled') then
      return jsonb_build_object('ok',false,'reason','canonical_not_completable','canonical_status',v_canonical_inbox.status);
    elsif v_canonical_inbox.status='claimed'
          and v_canonical_inbox.claimed_by_user_id<>v_uid
          and not private.has_business_payment_permission(v_duplicate.business_id,'reassign',v_uid) then
      return jsonb_build_object('ok',false,'reason','canonical_claimed_by_another','canonical_status','claimed');
    else
      v_result := public.complete_operation_workflow(
        null,null,null,v_canonical_inbox.id,p_note,v_source
      );
    end if;
  else
    if not private.has_business_payment_permission(v_duplicate.business_id,'claim',v_uid) then
      raise exception 'payment_inbox_claim_required' using errcode='42501';
    end if;
    v_result := public.complete_operation_workflow(
      v_canonical_operation_id,null,v_duplicate.business_id,null,p_note,v_source
    );
  end if;

  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result || jsonb_build_object('duplicate_inbox_id',v_duplicate.id);
  end if;

  v_from := v_duplicate.status;
  update public.business_payment_inbox
  set status='cancelled',
      claimed_by_user_id=null,
      claimed_at=null,
      claim_expires_at=null,
      review_requested_by_user_id=null,
      review_requested_at=null,
      review_reason=null,
      last_action_source=v_source,
      routing_snapshot=coalesce(routing_snapshot,'{}'::jsonb) || jsonb_build_object(
        'reuse_resolved',true,
        'canonical_operation_id',v_canonical_operation_id,
        'canonical_inbox_id',coalesce(v_canonical_inbox.id,(v_result->'inbox'->>'id')::uuid),
        'resolved_by_user_id',v_uid,
        'resolved_at',now()
      ),
      updated_at=now(),
      row_version=row_version+1
  where id=v_duplicate.id
  returning * into v_duplicate;

  perform private.record_business_payment_inbox_event(
    v_duplicate.id,'cancelled',v_uid,v_from,'cancelled','exact_duplicate_resolved_to_canonical',
    jsonb_build_object(
      'source',v_source,
      'canonical_operation_id',v_canonical_operation_id,
      'canonical_inbox_id',coalesce(v_canonical_inbox.id,(v_result->'inbox'->>'id')::uuid)
    )
  );

  return v_result || jsonb_build_object(
    'ok',true,
    'duplicate_inbox_id',v_duplicate.id,
    'duplicate_status','cancelled',
    'canonical_operation_id',v_canonical_operation_id,
    'reuse_resolved',true,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.resolve_business_payment_reuse_v1(uuid,bigint,text,text) from public, anon;
grant execute on function public.resolve_business_payment_reuse_v1(uuid,bigint,text,text) to authenticated, service_role;

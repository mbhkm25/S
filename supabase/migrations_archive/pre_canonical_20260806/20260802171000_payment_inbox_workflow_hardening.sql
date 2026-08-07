begin;

alter table public.business_payment_inbox_events
  drop constraint if exists business_payment_inbox_events_event_type_check;

alter table public.business_payment_inbox_events
  add constraint business_payment_inbox_events_event_type_check
  check (event_type = any(array[
    'enqueued','claimed','claim_renewed','claim_conflict','released','completed',
    'review_required','rejected','cancelled','reassigned','expired_claim_released',
    'stale_action_rejected'
  ]::text[]));

create index if not exists business_payment_inbox_business_status_created_idx
  on public.business_payment_inbox (business_id, status, created_at desc, id desc);

create index if not exists business_payment_inbox_claim_owner_idx
  on public.business_payment_inbox (business_id, claimed_by_user_id, claim_expires_at desc)
  where status = 'claimed';

create index if not exists business_payment_inbox_events_inbox_created_idx
  on public.business_payment_inbox_events (inbox_id, created_at desc, id desc);

create or replace function private.is_business_payment_supervisor(
  p_business_id uuid,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.business_profiles bp
    where bp.id = p_business_id
      and bp.owner_user_id = p_user_id
  ) or private.has_business_payment_permission(p_business_id, 'reassign', p_user_id)
    or private.has_business_payment_permission(p_business_id, 'review', p_user_id);
$$;

create or replace function private.payment_inbox_action_source(p_source text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_source text := lower(trim(coalesce(p_source, 'payment_inbox')));
begin
  if v_source not in (
    'payment_inbox','qr_details','direct_link','operation_details',
    'business_link_after_verification','notification','admin','system'
  ) then
    raise exception 'invalid_operation_action_source';
  end if;
  return v_source;
end;
$$;

create or replace function public.get_my_business_payment_inbox_contexts_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  perform private.expire_business_payment_claims(null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id', bp.id,
    'business_name', bp.name,
    'slug', bp.slug,
    'is_owner', bp.owner_user_id = v_uid,
    'is_supervisor', private.is_business_payment_supervisor(bp.id, v_uid),
    'permissions', jsonb_build_object(
      'view', private.has_business_payment_permission(bp.id, 'view', v_uid),
      'claim', private.has_business_payment_permission(bp.id, 'claim', v_uid),
      'complete', private.has_business_payment_permission(bp.id, 'complete', v_uid),
      'release', private.has_business_payment_permission(bp.id, 'release', v_uid),
      'reassign', private.has_business_payment_permission(bp.id, 'reassign', v_uid),
      'review', private.has_business_payment_permission(bp.id, 'review', v_uid)
    ),
    'counts', jsonb_build_object(
      'new', (select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status in ('new','released')),
      'mine', (select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='claimed' and i.claimed_by_user_id=v_uid and i.claim_expires_at>now()),
      'team_active', (select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='claimed' and i.claim_expires_at>now()),
      'review_required', (select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='review_required'),
      'completed_today', (select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='completed' and i.completed_at>=date_trunc('day',now())),
      'open_total', (select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status in ('new','released','claimed','review_required'))
    )
  ) order by bp.name), '[]'::jsonb)
  into v_items
  from public.business_profiles bp
  where private.has_business_payment_permission(bp.id, 'view', v_uid);

  return jsonb_build_object('items', v_items, 'contract_version', 2);
end;
$$;

create or replace function public.get_business_payment_inbox_v2(
  p_business_id uuid,
  p_view text default 'new',
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_view text := lower(trim(coalesce(p_view, 'new')));
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_supervisor boolean;
  v_items jsonb;
  v_has_more boolean;
  v_next_created timestamptz;
  v_next_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not private.has_business_payment_permission(p_business_id,'view',v_uid) then
    raise exception 'payment_inbox_view_required' using errcode='42501';
  end if;
  if v_view not in ('new','mine','team_active','review','completed','all') then
    raise exception 'invalid_payment_inbox_view';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid_payment_inbox_cursor';
  end if;

  v_supervisor := private.is_business_payment_supervisor(p_business_id, v_uid);
  if v_view in ('team_active','all') and not v_supervisor then
    raise exception 'payment_inbox_supervisor_required' using errcode='42501';
  end if;

  perform private.expire_business_payment_claims(p_business_id);

  with rows as (
    select
      i.*,
      o.public_token,o.amount,o.currency,o.financial_entity,o.financial_entity_code,
      o.receiver_name,o.receiver_account,o.merchant_point,o.reference_number,o.transaction_datetime,
      bp.name as business_name,
      fa.account_label,fa.account_holder_name,
      cp.full_name as claimed_by_name,
      ep.full_name as completed_by_name,
      rp.full_name as released_by_name,
      jp.full_name as rejected_by_name,
      le.event_type as latest_event_type,
      le.created_at as latest_event_at
    from public.business_payment_inbox i
    join public.operations o on o.id=i.operation_id
    join public.business_profiles bp on bp.id=i.business_id
    left join public.business_financial_accounts fa on fa.id=i.financial_account_id
    left join public.profiles cp on cp.id=i.claimed_by_user_id
    left join public.profiles ep on ep.id=i.completed_by_user_id
    left join public.profiles rp on rp.id=i.released_by_user_id
    left join public.profiles jp on jp.id=i.rejected_by_user_id
    left join lateral (
      select e.event_type,e.created_at
      from public.business_payment_inbox_events e
      where e.inbox_id=i.id
      order by e.created_at desc,e.id desc
      limit 1
    ) le on true
    where i.business_id=p_business_id
      and (
        (v_view='new' and i.status in ('new','released'))
        or (v_view='mine' and i.status='claimed' and i.claimed_by_user_id=v_uid and i.claim_expires_at>now())
        or (v_view='team_active' and i.status='claimed' and i.claim_expires_at>now())
        or (v_view='review' and i.status='review_required')
        or (v_view='completed' and i.status='completed' and (v_supervisor or i.completed_by_user_id=v_uid))
        or (v_view='all' and v_supervisor)
      )
      and (p_before_created_at is null or (i.created_at,i.id)<(p_before_created_at,p_before_id))
    order by i.created_at desc,i.id desc
    limit v_limit+1
  ), numbered as (
    select *,row_number() over(order by created_at desc,id desc) rn from rows
  ), page as (
    select * from numbered where rn<=v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'business_id',p.business_id,'business_name',p.business_name,
    'operation_id',p.operation_id,'public_token',p.public_token,
    'status',p.status,'source_mode',p.source_mode,'priority',p.priority,
    'match_score',p.match_score,'match_strategy',p.match_strategy,
    'amount',p.amount,'currency',p.currency,'financial_entity',p.financial_entity,
    'financial_entity_code',p.financial_entity_code,'receiver_name',p.receiver_name,
    'receiver_account',p.receiver_account,'merchant_point',p.merchant_point,
    'reference_number',p.reference_number,'transaction_datetime',p.transaction_datetime,
    'financial_account_id',p.financial_account_id,'account_label',p.account_label,
    'account_holder_name',p.account_holder_name,
    'claimed_by_user_id',p.claimed_by_user_id,'claimed_by_name',p.claimed_by_name,
    'claimed_at',p.claimed_at,'claim_expires_at',p.claim_expires_at,'claimed_source',p.claimed_source,
    'completed_by_user_id',p.completed_by_user_id,'completed_by_name',p.completed_by_name,
    'completed_at',p.completed_at,'completion_note',p.completion_note,'completed_source',p.completed_source,
    'released_by_user_id',p.released_by_user_id,'released_by_name',p.released_by_name,
    'released_at',p.released_at,'release_reason',p.release_reason,
    'rejected_by_user_id',p.rejected_by_user_id,'rejected_by_name',p.rejected_by_name,
    'rejected_at',p.rejected_at,'rejection_reason',p.rejection_reason,
    'last_action_source',p.last_action_source,
    'latest_event_type',p.latest_event_type,'latest_event_at',p.latest_event_at,
    'created_at',p.created_at,'updated_at',p.updated_at,'row_version',p.row_version,
    'is_mine',p.claimed_by_user_id=v_uid,
    'action_permissions',jsonb_build_object(
      'can_claim',p.status in ('new','released') and private.has_business_payment_permission(p_business_id,'claim',v_uid),
      'can_complete',p.status='claimed' and private.has_business_payment_permission(p_business_id,'complete',v_uid) and (p.claimed_by_user_id=v_uid or v_supervisor),
      'can_release',p.status='claimed' and private.has_business_payment_permission(p_business_id,'release',v_uid) and (p.claimed_by_user_id=v_uid or v_supervisor),
      'can_reassign',p.status in ('new','released','claimed') and v_supervisor and private.has_business_payment_permission(p_business_id,'reassign',v_uid),
      'can_request_review',p.status='claimed' and (p.claimed_by_user_id=v_uid or v_supervisor),
      'can_reject',p.status='review_required' and private.has_business_payment_permission(p_business_id,'review',v_uid),
      'can_view_history',v_supervisor or p.claimed_by_user_id=v_uid or p.completed_by_user_id=v_uid
    )
  ) order by p.created_at desc,p.id desc),'[]'::jsonb),
  exists(select 1 from numbered where rn=v_limit+1),
  (select created_at from page order by created_at asc,id asc limit 1),
  (select id from page order by created_at asc,id asc limit 1)
  into v_items,v_has_more,v_next_created,v_next_id
  from page p;

  return jsonb_build_object(
    'items',v_items,
    'view',v_view,
    'contract_version',2,
    'viewer',jsonb_build_object('user_id',v_uid,'is_supervisor',v_supervisor),
    'has_more',coalesce(v_has_more,false),
    'next_cursor',case when v_has_more then jsonb_build_object('created_at',v_next_created,'id',v_next_id) else null end,
    'permissions',jsonb_build_object(
      'claim',private.has_business_payment_permission(p_business_id,'claim',v_uid),
      'complete',private.has_business_payment_permission(p_business_id,'complete',v_uid),
      'release',private.has_business_payment_permission(p_business_id,'release',v_uid),
      'reassign',private.has_business_payment_permission(p_business_id,'reassign',v_uid),
      'review',private.has_business_payment_permission(p_business_id,'review',v_uid),
      'supervise',v_supervisor
    )
  );
end;
$$;

create or replace function public.claim_business_payment_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_lease_seconds integer default 300,
  p_source text default 'payment_inbox'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_lease integer:=least(greatest(coalesce(p_lease_seconds,300),60),900);
  v_source text:=private.payment_inbox_action_source(p_source);
  v_from text;
  v_owner_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'claim',v_uid) then
    raise exception 'payment_inbox_claim_required' using errcode='42501';
  end if;

  if v_item.status='claimed' and v_item.claim_expires_at<=now() then
    update public.business_payment_inbox
    set status='released',released_by_user_id=null,released_at=now(),release_reason='claim_expired',
        claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,last_action_source='system',
        updated_at=now(),row_version=row_version+1
    where id=v_item.id returning * into v_item;
    perform private.record_business_payment_inbox_event(v_item.id,'expired_claim_released',null,'claimed','released','claim_expired','{}'::jsonb);
  end if;

  if v_item.status='claimed' and v_item.claimed_by_user_id<>v_uid and v_item.claim_expires_at>now() then
    select full_name into v_owner_name from public.profiles where id=v_item.claimed_by_user_id;
    perform private.record_business_payment_inbox_event(v_item.id,'claim_conflict',v_uid,'claimed','claimed',null,
      jsonb_build_object('current_claimed_by_user_id',v_item.claimed_by_user_id,'row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'claimed',false,'reason','claim_race_lost','current_row_version',v_item.row_version,
      'claimed_by_user_id',v_item.claimed_by_user_id,'claimed_by_name',v_owner_name,'claim_expires_at',v_item.claim_expires_at);
  end if;

  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','claim','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'claimed',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;

  if v_item.status='claimed' and v_item.claimed_by_user_id=v_uid then
    update public.business_payment_inbox
    set claim_expires_at=now()+make_interval(secs=>v_lease),last_action_source=v_source,
        updated_at=now(),row_version=row_version+1
    where id=v_item.id returning * into v_item;
    perform private.record_business_payment_inbox_event(v_item.id,'claim_renewed',v_uid,'claimed','claimed',null,
      jsonb_build_object('lease_seconds',v_lease,'source',v_source));
    return jsonb_build_object('ok',true,'claimed',true,'renewed',true,'item',to_jsonb(v_item));
  end if;

  if v_item.status not in ('new','released') then
    return jsonb_build_object('ok',false,'claimed',false,'reason','not_claimable','status',v_item.status,'current_row_version',v_item.row_version);
  end if;

  v_from:=v_item.status;
  update public.business_payment_inbox
  set status='claimed',claimed_by_user_id=v_uid,claimed_at=now(),claim_expires_at=now()+make_interval(secs=>v_lease),
      claimed_source=v_source,released_by_user_id=null,released_at=null,release_reason=null,last_action_source=v_source,
      updated_at=now(),row_version=row_version+1
  where id=v_item.id and row_version=v_item.row_version
  returning * into v_item;

  if not found then return jsonb_build_object('ok',false,'claimed',false,'reason','claim_race_lost'); end if;
  perform private.record_business_payment_inbox_event(v_item.id,'claimed',v_uid,v_from,'claimed',null,
    jsonb_build_object('lease_seconds',v_lease,'source',v_source));
  return jsonb_build_object('ok',true,'claimed',true,'renewed',false,'item',to_jsonb(v_item));
end;
$$;

create or replace function public.heartbeat_business_payment_claim_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.business_payment_inbox%rowtype;
  v_lease integer:=least(greatest(coalesce(p_lease_seconds,300),60),900);
begin
  update public.business_payment_inbox
  set claim_expires_at=now()+make_interval(secs=>v_lease),updated_at=now(),row_version=row_version+1
  where id=p_inbox_id and status='claimed' and claimed_by_user_id=auth.uid() and claim_expires_at>now()
    and (p_expected_row_version is null or row_version=p_expected_row_version)
  returning * into v_item;
  if not found then
    select * into v_item from public.business_payment_inbox where id=p_inbox_id;
    return jsonb_build_object('ok',false,'renewed',false,'reason','claim_not_owned_expired_or_stale',
      'current_row_version',v_item.row_version,'status',v_item.status);
  end if;
  perform private.record_business_payment_inbox_event(v_item.id,'claim_renewed',auth.uid(),'claimed','claimed',null,
    jsonb_build_object('lease_seconds',v_lease,'source','payment_inbox_heartbeat'));
  return jsonb_build_object('ok',true,'renewed',true,'claim_expires_at',v_item.claim_expires_at,'row_version',v_item.row_version,'item',to_jsonb(v_item));
end;
$$;

create or replace function public.complete_business_payment_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_note text default null,
  p_source text default 'payment_inbox'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_operation_id uuid;
  v_source text:=private.payment_inbox_action_source(p_source);
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select operation_id into v_operation_id from public.business_payment_inbox where id=p_inbox_id;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  perform 1 from public.operations where id=v_operation_id for update;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;

  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','complete','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;
  if v_item.status='completed' and v_item.completed_by_user_id=v_uid then
    return jsonb_build_object('ok',true,'idempotent',true,'inbox',to_jsonb(v_item));
  end if;
  if v_item.status<>'claimed' then return jsonb_build_object('ok',false,'reason','payment_not_claimed','status',v_item.status); end if;
  if v_item.claimed_by_user_id<>v_uid and not private.is_business_payment_supervisor(v_item.business_id,v_uid) then
    raise exception 'payment_claim_owned_by_another_user' using errcode='42501';
  end if;
  if not private.has_business_payment_permission(v_item.business_id,'complete',v_uid) then
    raise exception 'payment_inbox_complete_required' using errcode='42501';
  end if;

  v_result:=public.complete_operation_workflow(null,null,null,p_inbox_id,p_note,v_source);
  return v_result || jsonb_build_object('contract_version',2);
end;
$$;

create or replace function public.release_business_payment_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_reason text,
  p_source text default 'payment_inbox'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_source text:=private.payment_inbox_action_source(p_source);
begin
  if length(coalesce(v_reason,''))<3 then raise exception 'release_reason_required'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','release','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;
  if not private.has_business_payment_permission(v_item.business_id,'release',v_uid) then raise exception 'payment_inbox_release_required' using errcode='42501'; end if;
  if v_item.status<>'claimed' then return jsonb_build_object('ok',false,'reason','payment_not_claimed','status',v_item.status); end if;
  if v_item.claimed_by_user_id<>v_uid and not private.is_business_payment_supervisor(v_item.business_id,v_uid) then
    raise exception 'payment_claim_owned_by_another_user' using errcode='42501';
  end if;
  update public.business_payment_inbox
  set status='released',released_by_user_id=v_uid,released_at=now(),release_reason=left(v_reason,500),
      claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,last_action_source=v_source,
      updated_at=now(),row_version=row_version+1
  where id=v_item.id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'released',v_uid,'claimed','released',v_reason,jsonb_build_object('source',v_source));
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$$;

create or replace function public.request_business_payment_review_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_reason text,
  p_source text default 'payment_inbox'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_source text:=private.payment_inbox_action_source(p_source);
begin
  if length(coalesce(v_reason,''))<5 then raise exception 'review_reason_required'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','request_review','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;
  if v_item.status<>'claimed' then return jsonb_build_object('ok',false,'reason','payment_not_claimed','status',v_item.status); end if;
  if v_item.claimed_by_user_id<>v_uid and not private.is_business_payment_supervisor(v_item.business_id,v_uid) then
    raise exception 'payment_claim_owned_by_another_user' using errcode='42501';
  end if;
  update public.business_payment_inbox
  set status='review_required',completion_note=left(v_reason,1000),claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,
      last_action_source=v_source,updated_at=now(),row_version=row_version+1
  where id=v_item.id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'review_required',v_uid,'claimed','review_required',v_reason,jsonb_build_object('source',v_source));
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$$;

create or replace function public.reassign_business_payment_v2(
  p_inbox_id uuid,
  p_user_id uuid,
  p_expected_row_version bigint,
  p_reason text,
  p_source text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_source text:=private.payment_inbox_action_source(p_source);
  v_from text;
begin
  if length(coalesce(v_reason,''))<5 then raise exception 'reassign_reason_required'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.is_business_payment_supervisor(v_item.business_id,v_uid)
     or not private.has_business_payment_permission(v_item.business_id,'reassign',v_uid) then
    raise exception 'payment_inbox_reassign_required' using errcode='42501';
  end if;
  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','reassign','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;
  if not private.has_business_payment_permission(v_item.business_id,'claim',p_user_id) then raise exception 'target_user_cannot_claim'; end if;
  if v_item.status not in ('new','released','claimed') then return jsonb_build_object('ok',false,'reason','payment_not_reassignable','status',v_item.status); end if;
  v_from:=v_item.status;
  update public.business_payment_inbox
  set status='claimed',claimed_by_user_id=p_user_id,claimed_at=now(),claim_expires_at=now()+interval '5 minutes',
      claimed_source=v_source,released_by_user_id=null,released_at=null,release_reason=null,last_action_source=v_source,
      updated_at=now(),row_version=row_version+1
  where id=v_item.id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'reassigned',v_uid,v_from,'claimed',v_reason,
    jsonb_build_object('assigned_to_user_id',p_user_id,'source',v_source));
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$$;

create or replace function public.reject_business_payment_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_reason text,
  p_source text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_source text:=private.payment_inbox_action_source(p_source);
begin
  if length(coalesce(v_reason,''))<5 then raise exception 'rejection_reason_required'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','reject','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;
  if not private.has_business_payment_permission(v_item.business_id,'review',v_uid) then raise exception 'payment_inbox_review_required' using errcode='42501'; end if;
  if v_item.status<>'review_required' then return jsonb_build_object('ok',false,'reason','payment_not_in_review','status',v_item.status); end if;
  update public.business_payment_inbox
  set status='rejected',rejected_by_user_id=v_uid,rejected_at=now(),rejection_reason=left(v_reason,500),
      claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,last_action_source=v_source,
      updated_at=now(),row_version=row_version+1
  where id=v_item.id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'rejected',v_uid,'review_required','rejected',v_reason,jsonb_build_object('source',v_source));
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$$;

create or replace function public.get_business_payment_claim_assignees(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_items jsonb;
begin
  if not private.is_business_payment_supervisor(p_business_id,auth.uid())
     or not private.has_business_payment_permission(p_business_id,'reassign',auth.uid()) then
    raise exception 'payment_inbox_reassign_required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.id,'full_name',p.full_name,'job_title',m.job_title,'membership_role',m.membership_role
  ) order by p.full_name),'[]'::jsonb)
  into v_items
  from public.business_team_members m
  join public.profiles p on p.id=m.user_id and p.status='active'
  where m.business_id=p_business_id and m.status='active'
    and private.has_business_payment_permission(p_business_id,'claim',m.user_id);
  return jsonb_build_object('items',v_items);
end;
$$;

create or replace function public.get_business_payment_inbox_events_v2(
  p_inbox_id uuid,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
  v_allowed boolean;
  v_items jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  v_allowed:=private.is_business_payment_supervisor(v_item.business_id,v_uid)
    or v_item.claimed_by_user_id=v_uid
    or v_item.completed_by_user_id=v_uid
    or exists(select 1 from public.business_payment_inbox_events e where e.inbox_id=p_inbox_id and e.actor_user_id=v_uid);
  if not v_allowed then raise exception 'payment_inbox_history_required' using errcode='42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'event_type',x.event_type,'actor_user_id',x.actor_user_id,'actor_name',x.actor_name,
    'from_status',x.from_status,'to_status',x.to_status,'reason',x.reason,'metadata',x.metadata,'created_at',x.created_at
  ) order by x.created_at desc,x.id desc),'[]'::jsonb)
  into v_items
  from (
    select e.*,p.full_name as actor_name
    from public.business_payment_inbox_events e
    left join public.profiles p on p.id=e.actor_user_id
    where e.inbox_id=p_inbox_id
    order by e.created_at desc,e.id desc
    limit v_limit
  ) x;
  return jsonb_build_object('items',v_items,'inbox_id',p_inbox_id,'contract_version',2);
end;
$$;

revoke all on function public.get_my_business_payment_inbox_contexts_v2() from public,anon;
revoke all on function public.get_business_payment_inbox_v2(uuid,text,integer,timestamptz,uuid) from public,anon;
revoke all on function public.claim_business_payment_v2(uuid,bigint,integer,text) from public,anon;
revoke all on function public.heartbeat_business_payment_claim_v2(uuid,bigint,integer) from public,anon;
revoke all on function public.complete_business_payment_v2(uuid,bigint,text,text) from public,anon;
revoke all on function public.release_business_payment_v2(uuid,bigint,text,text) from public,anon;
revoke all on function public.request_business_payment_review_v2(uuid,bigint,text,text) from public,anon;
revoke all on function public.reassign_business_payment_v2(uuid,uuid,bigint,text,text) from public,anon;
revoke all on function public.reject_business_payment_v2(uuid,bigint,text,text) from public,anon;
revoke all on function public.get_business_payment_claim_assignees(uuid) from public,anon;
revoke all on function public.get_business_payment_inbox_events_v2(uuid,integer) from public,anon;

grant execute on function public.get_my_business_payment_inbox_contexts_v2() to authenticated;
grant execute on function public.get_business_payment_inbox_v2(uuid,text,integer,timestamptz,uuid) to authenticated;
grant execute on function public.claim_business_payment_v2(uuid,bigint,integer,text) to authenticated;
grant execute on function public.heartbeat_business_payment_claim_v2(uuid,bigint,integer) to authenticated;
grant execute on function public.complete_business_payment_v2(uuid,bigint,text,text) to authenticated;
grant execute on function public.release_business_payment_v2(uuid,bigint,text,text) to authenticated;
grant execute on function public.request_business_payment_review_v2(uuid,bigint,text,text) to authenticated;
grant execute on function public.reassign_business_payment_v2(uuid,uuid,bigint,text,text) to authenticated;
grant execute on function public.reject_business_payment_v2(uuid,bigint,text,text) to authenticated;
grant execute on function public.get_business_payment_claim_assignees(uuid) to authenticated;
grant execute on function public.get_business_payment_inbox_events_v2(uuid,integer) to authenticated;

commit;

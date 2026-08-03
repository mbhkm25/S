begin;

alter table public.business_payment_inbox
  add column if not exists review_requested_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.business_payment_inbox'::regclass
      and conname='business_payment_inbox_review_request_check'
  ) then
    alter table public.business_payment_inbox
      add constraint business_payment_inbox_review_request_check
      check (
        (review_requested_by_user_id is null and review_requested_at is null)
        or (review_requested_by_user_id is not null and review_requested_at is not null)
      );
  end if;
end;
$$;

alter table public.business_payment_inbox_events
  drop constraint if exists business_payment_inbox_events_event_type_check;

alter table public.business_payment_inbox_events
  add constraint business_payment_inbox_events_event_type_check
  check (event_type = any(array[
    'enqueued','claimed','claim_renewed','claim_conflict','released','completed',
    'review_required','review_resumed','rejected','cancelled','reassigned',
    'expired_claim_released','stale_action_rejected'
  ]::text[]));

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
      'new', (select count(*) from public.business_payment_inbox i where i.business_id=bp.id and (i.status in ('new','released') or (i.status='claimed' and i.claim_expires_at<=now()))),
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
  set status='review_required',
      review_requested_by_user_id=v_uid,
      review_requested_at=now(),
      review_reason=left(v_reason,1000),
      claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,
      last_action_source=v_source,updated_at=now(),row_version=row_version+1
  where id=v_item.id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'review_required',v_uid,'claimed','review_required',v_reason,jsonb_build_object('source',v_source));
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$$;

create or replace function public.resume_business_payment_review_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_user_id uuid default null,
  p_note text default null,
  p_source text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_target uuid;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_source text:=private.payment_inbox_action_source(p_source);
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.is_business_payment_supervisor(v_item.business_id,v_uid)
     or not private.has_business_payment_permission(v_item.business_id,'review',v_uid) then
    raise exception 'payment_inbox_review_required' using errcode='42501';
  end if;
  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','resume_review','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source));
    return jsonb_build_object('ok',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;
  if v_item.status<>'review_required' then return jsonb_build_object('ok',false,'reason','payment_not_in_review','status',v_item.status); end if;
  v_target:=coalesce(p_user_id,v_item.review_requested_by_user_id,v_uid);
  if not private.has_business_payment_permission(v_item.business_id,'claim',v_target) then raise exception 'target_user_cannot_claim'; end if;

  update public.business_payment_inbox
  set status='claimed',claimed_by_user_id=v_target,claimed_at=now(),claim_expires_at=now()+interval '5 minutes',
      claimed_source=v_source,last_action_source=v_source,updated_at=now(),row_version=row_version+1
  where id=v_item.id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'review_resumed',v_uid,'review_required','claimed',v_note,
    jsonb_build_object('assigned_to_user_id',v_target,'source',v_source));
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$$;

revoke all on function public.resume_business_payment_review_v2(uuid,bigint,uuid,text,text) from public,anon;
grant execute on function public.resume_business_payment_review_v2(uuid,bigint,uuid,text,text) to authenticated;

commit;

begin;

create or replace function public.platform_admin_review_business(
  p_business_id uuid,
  p_decision text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_before public.business_profiles%rowtype;
  v_business public.business_profiles%rowtype;
  v_reason text := coalesce(nullif(trim(p_review_note), ''), 'Legacy business review action');
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.is_platform_admin(v_user_id) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  if p_decision not in ('published', 'rejected', 'hidden', 'suspended') then
    raise exception 'invalid_review_decision';
  end if;

  select * into v_before
  from public.business_profiles
  where id = p_business_id
  for update;

  if not found then
    raise exception 'business_not_found';
  end if;

  update public.business_profiles
  set public_status = p_decision,
      verification_status = case
        when p_decision = 'published' then 'verified'
        when p_decision = 'rejected' then 'rejected'
        else verification_status
      end,
      review_note = nullif(trim(p_review_note), ''),
      reviewed_at = now(),
      reviewed_by_user_id = v_user_id,
      updated_at = now()
  where id = p_business_id
  returning * into v_business;

  insert into public.platform_admin_audit_log(
    actor_user_id, action, target_type, target_id, reason, before_data, after_data
  ) values (
    v_user_id,
    'business_reviewed_legacy_rpc',
    'business_profile',
    p_business_id::text,
    v_reason,
    to_jsonb(v_before),
    to_jsonb(v_business)
  );

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business));
end;
$function$;

create or replace function public.request_business_payment_review_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_reason text,
  p_source text default 'payment_inbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_source text := private.payment_inbox_action_source(p_source);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if length(coalesce(v_reason,'')) < 5 then raise exception 'review_reason_required'; end if;

  select * into v_item
  from public.business_payment_inbox
  where id = p_inbox_id
  for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;

  if p_expected_row_version is not null and v_item.row_version <> p_expected_row_version then
    perform private.record_business_payment_inbox_event(
      v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object(
        'action','request_review',
        'expected_row_version',p_expected_row_version,
        'current_row_version',v_item.row_version,
        'source',v_source
      )
    );
    return jsonb_build_object(
      'ok',false,'reason','stale_item',
      'current_row_version',v_item.row_version,'status',v_item.status
    );
  end if;

  if v_item.status <> 'claimed' then
    return jsonb_build_object('ok',false,'reason','payment_not_claimed','status',v_item.status);
  end if;

  if v_item.claimed_by_user_id <> v_uid
     and not private.is_business_payment_supervisor(v_item.business_id,v_uid) then
    raise exception 'payment_claim_owned_by_another_user' using errcode='42501';
  end if;

  update public.business_payment_inbox
  set status='review_required',
      review_requested_by_user_id=v_uid,
      review_requested_at=now(),
      review_reason=left(v_reason,1000),
      claimed_by_user_id=null,
      claimed_at=null,
      claim_expires_at=null,
      last_action_source=v_source,
      updated_at=now(),
      row_version=row_version+1
  where id=v_item.id
  returning * into v_item;

  perform private.record_business_payment_inbox_event(
    v_item.id,'review_required',v_uid,'claimed','review_required',v_reason,
    jsonb_build_object('source',v_source)
  );

  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$function$;

revoke execute on function public.platform_admin_review_business(uuid,text,text) from public, anon;
grant execute on function public.platform_admin_review_business(uuid,text,text) to authenticated, service_role;
revoke execute on function public.request_business_payment_review_v2(uuid,bigint,text,text) from public, anon;
grant execute on function public.request_business_payment_review_v2(uuid,bigint,text,text) to authenticated, service_role;

commit;

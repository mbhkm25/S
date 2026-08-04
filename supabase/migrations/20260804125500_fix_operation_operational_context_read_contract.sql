begin;

create or replace function public.get_operation_operational_context(p_public_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_inbox public.business_payment_inbox%rowtype;
  v_business_name text;
  v_claimed_name text;
  v_completed_name text;
  v_supervisor boolean := false;
  v_has_access boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select * into v_operation
  from public.operations
  where public_token=p_public_token
    and token_status='active'
    and (token_expires_at is null or token_expires_at>now());

  if not found then
    raise exception 'operation_not_found';
  end if;

  -- This contract is intentionally read-only. It must never call the volatile
  -- operation-opening workflow or consume access quota a second time.
  select (
    v_operation.submitted_by_user_id=v_uid
    or exists (
      select 1 from public.operation_access_logs l
      where l.operation_id=v_operation.id and l.user_id=v_uid
    )
    or exists (
      select 1 from public.operation_user_links ul
      where ul.operation_id=v_operation.id and ul.user_id=v_uid
    )
    or exists (
      select 1 from public.business_payment_inbox i
      where i.operation_id=v_operation.id
        and private.has_business_payment_permission(i.business_id,'view',v_uid)
    )
  ) into v_has_access;

  if not coalesce(v_has_access,false) then
    raise exception 'operation_access_denied' using errcode='42501';
  end if;

  select i.* into v_inbox
  from public.business_payment_inbox i
  where i.operation_id=v_operation.id
    and private.has_business_payment_permission(i.business_id,'view',v_uid)
  order by i.created_at desc
  limit 1;

  if v_inbox.id is not null then
    select name into v_business_name from public.business_profiles where id=v_inbox.business_id;
    select full_name into v_claimed_name from public.profiles where id=v_inbox.claimed_by_user_id;
    select full_name into v_completed_name from public.profiles where id=v_inbox.completed_by_user_id;
    v_supervisor := private.is_business_payment_supervisor(v_inbox.business_id,v_uid);
  end if;

  return jsonb_build_object(
    'operation_id',v_operation.id,
    'public_token',v_operation.public_token,
    'transaction_datetime',v_operation.transaction_datetime,
    'received_at',coalesce(v_operation.received_at,v_operation.created_at),
    'inbox',case when v_inbox.id is null then null else jsonb_build_object(
      'id',v_inbox.id,
      'business_id',v_inbox.business_id,
      'business_name',v_business_name,
      'status',v_inbox.status,
      'row_version',v_inbox.row_version,
      'claimed_by_user_id',v_inbox.claimed_by_user_id,
      'claimed_by_name',v_claimed_name,
      'completed_by_user_id',v_inbox.completed_by_user_id,
      'completed_by_name',v_completed_name,
      'completed_at',v_inbox.completed_at,
      'review_reason',v_inbox.review_reason,
      'is_mine',v_inbox.claimed_by_user_id=v_uid,
      'is_supervisor',v_supervisor,
      'permissions',jsonb_build_object(
        'can_claim',v_inbox.status in ('new','released') and private.has_business_payment_permission(v_inbox.business_id,'claim',v_uid),
        'can_complete',v_inbox.status='claimed' and private.has_business_payment_permission(v_inbox.business_id,'complete',v_uid) and (v_inbox.claimed_by_user_id=v_uid or v_supervisor),
        'can_review',private.has_business_payment_permission(v_inbox.business_id,'review',v_uid),
        'can_view',true
      )
    ) end,
    'contract_version',2,
    'read_only_open',true
  );
end;
$$;

revoke all on function public.get_operation_operational_context(uuid) from public,anon;
grant execute on function public.get_operation_operational_context(uuid) to authenticated;

commit;

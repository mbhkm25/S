create or replace function public.update_business_team_member_permissions(
  p_business_id uuid,
  p_member_user_id uuid,
  p_job_title text default null,
  p_permissions jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.business_team_members%rowtype;
  v_allowed_keys text[] := array[
    'view_customers','contact_customers','manage_catalog','view_reports','link_operations',
    'payments.view','payments.claim','payments.complete','payments.release','payments.reassign','payments.review'
  ];
  v_key text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles
    where id=p_business_id and owner_user_id=v_user_id
  ) then raise exception 'business_owner_required'; end if;
  if jsonb_typeof(coalesce(p_permissions,'{}'::jsonb))<>'object' then
    raise exception 'permissions_must_be_object';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_permissions,'{}'::jsonb))
  loop
    if not (v_key=any(v_allowed_keys)) then raise exception 'invalid_permission_key'; end if;
    if jsonb_typeof(p_permissions->v_key)<>'boolean' then raise exception 'permission_value_must_be_boolean'; end if;
  end loop;

  update public.business_team_members
  set job_title=nullif(btrim(coalesce(p_job_title,'')),''),
      label=nullif(btrim(coalesce(p_job_title,'')),''),
      permissions=coalesce(p_permissions,'{}'::jsonb),
      updated_at=now()
  where business_id=p_business_id and user_id=p_member_user_id and status<>'removed'
  returning * into v_member;

  if not found then raise exception 'team_member_not_found'; end if;

  insert into public.business_team_actions(
    business_id,member_user_id,action,performed_by_user_id,metadata
  ) values (
    p_business_id,p_member_user_id,'permissions_updated',v_user_id,
    jsonb_build_object('job_title',v_member.job_title,'permissions',v_member.permissions)
  );

  return jsonb_build_object('ok',true,'member',to_jsonb(v_member));
end;
$$;
revoke all on function public.update_business_team_member_permissions(uuid,uuid,text,jsonb) from public;
grant execute on function public.update_business_team_member_permissions(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.get_business_payment_inbox(
  p_business_id uuid,
  p_status text default null,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_items jsonb;
  v_has_more boolean;
  v_next_created timestamptz;
  v_next_id uuid;
begin
  if not private.has_business_payment_permission(p_business_id,'view',auth.uid()) then
    raise exception 'payment_inbox_view_required' using errcode='42501';
  end if;
  if p_status is not null and p_status not in ('new','claimed','completed','released','review_required','rejected','cancelled') then
    raise exception 'invalid_payment_inbox_status';
  end if;
  if (p_before_created_at is null)<>(p_before_id is null) then
    raise exception 'invalid_payment_inbox_cursor';
  end if;

  perform private.expire_business_payment_claims(p_business_id);

  with rows as (
    select i.*,o.public_token,o.amount,o.currency,o.financial_entity,o.financial_entity_code,
      o.receiver_name,o.receiver_account,o.merchant_point,o.reference_number,o.transaction_datetime,
      bp.name as business_name,fa.account_label,fa.account_holder_name,p.full_name as claimed_by_name
    from public.business_payment_inbox i
    join public.operations o on o.id=i.operation_id
    join public.business_profiles bp on bp.id=i.business_id
    left join public.business_financial_accounts fa on fa.id=i.financial_account_id
    left join public.profiles p on p.id=i.claimed_by_user_id
    where i.business_id=p_business_id
      and (p_status is null or i.status=p_status)
      and (p_status is distinct from 'claimed' or i.claimed_by_user_id=auth.uid())
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
    'account_holder_name',p.account_holder_name,'claimed_by_user_id',p.claimed_by_user_id,
    'claimed_by_name',p.claimed_by_name,'claimed_at',p.claimed_at,
    'claim_expires_at',p.claim_expires_at,'completed_at',p.completed_at,
    'created_at',p.created_at,'updated_at',p.updated_at,'row_version',p.row_version
  ) order by p.created_at desc,p.id desc),'[]'::jsonb),
  exists(select 1 from numbered where rn=v_limit+1),
  (select created_at from page order by created_at asc,id asc limit 1),
  (select id from page order by created_at asc,id asc limit 1)
  into v_items,v_has_more,v_next_created,v_next_id
  from page p;

  return jsonb_build_object(
    'items',v_items,
    'has_more',coalesce(v_has_more,false),
    'next_cursor',case when v_has_more then jsonb_build_object('created_at',v_next_created,'id',v_next_id) else null end,
    'permissions',jsonb_build_object(
      'claim',private.has_business_payment_permission(p_business_id,'claim',auth.uid()),
      'complete',private.has_business_payment_permission(p_business_id,'complete',auth.uid()),
      'release',private.has_business_payment_permission(p_business_id,'release',auth.uid()),
      'reassign',private.has_business_payment_permission(p_business_id,'reassign',auth.uid()),
      'review',private.has_business_payment_permission(p_business_id,'review',auth.uid())
    )
  );
end;
$$;
revoke all on function public.get_business_payment_inbox(uuid,text,integer,timestamptz,uuid) from public;
grant execute on function public.get_business_payment_inbox(uuid,text,integer,timestamptz,uuid) to authenticated;

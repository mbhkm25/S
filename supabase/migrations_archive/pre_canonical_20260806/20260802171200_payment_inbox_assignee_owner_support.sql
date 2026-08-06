begin;

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

  with eligible as (
    select
      bp.owner_user_id as user_id,
      p.full_name,
      'مالك النشاط'::text as job_title,
      'owner'::text as membership_role,
      0 as sort_order
    from public.business_profiles bp
    join public.profiles p on p.id=bp.owner_user_id and p.status='active'
    where bp.id=p_business_id

    union all

    select
      m.user_id,
      p.full_name,
      m.job_title,
      m.membership_role,
      1 as sort_order
    from public.business_team_members m
    join public.profiles p on p.id=m.user_id and p.status='active'
    where m.business_id=p_business_id
      and m.status='active'
      and private.has_business_payment_permission(p_business_id,'claim',m.user_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',x.user_id,
    'full_name',x.full_name,
    'job_title',x.job_title,
    'membership_role',x.membership_role
  ) order by x.sort_order,x.full_name),'[]'::jsonb)
  into v_items
  from (
    select distinct on (user_id) *
    from eligible
    order by user_id,sort_order
  ) x;

  return jsonb_build_object('items',v_items);
end;
$$;

commit;

begin;

alter table public.business_team_actions
  drop constraint if exists business_team_actions_action_check;

alter table public.business_team_actions
  add constraint business_team_actions_action_check
  check (action = any(array[
    'invited','accepted','suspended','reactivated','removed','label_changed','permissions_updated'
  ]::text[]));

create or replace function public.has_business_team_permission(
  p_business_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    exists(
      select 1
      from public.business_profiles bp
      where bp.id = p_business_id
        and bp.owner_user_id = p_user_id
    )
    or exists(
      select 1
      from public.business_team_members m
      join public.profiles p
        on p.id = m.user_id
       and p.status = 'active'
      where m.business_id = p_business_id
        and m.user_id = p_user_id
        and m.status = 'active'
        and coalesce((m.permissions ->> p_permission)::boolean, false)
    );
$$;

create or replace function private.has_business_payment_permission(
  p_business_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.has_business_team_permission(
    p_business_id,
    'payments.' || p_permission,
    p_user_id
  );
$$;

create or replace function public.can_access_business_customers(
  p_business_id uuid,
  p_required_permission text default 'customers.view'
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.is_platform_admin(auth.uid())
    or public.has_business_team_permission(
      p_business_id,
      case p_required_permission
        when 'customers.view' then 'view_customers'
        when 'customers.contact' then 'contact_customers'
        when 'customers.manage' then 'contact_customers'
        else p_required_permission
      end,
      auth.uid()
    );
$$;

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
  v_previous jsonb;
  v_normalized jsonb;
  v_allowed_keys text[] := array[
    'view_customers','contact_customers','manage_catalog','view_reports','link_operations',
    'payments.view','payments.claim','payments.complete','payments.release','payments.reassign','payments.review'
  ];
  v_key text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.business_profiles
    where id = p_business_id
      and owner_user_id = v_user_id
  ) then
    raise exception 'business_owner_required';
  end if;

  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object' then
    raise exception 'permissions_must_be_object';
  end if;

  for v_key in
    select jsonb_object_keys(coalesce(p_permissions, '{}'::jsonb))
  loop
    if not (v_key = any(v_allowed_keys)) then
      raise exception 'invalid_permission_key:%', v_key;
    end if;
    if jsonb_typeof(p_permissions -> v_key) <> 'boolean' then
      raise exception 'permission_value_must_be_boolean:%', v_key;
    end if;
  end loop;

  select permissions
    into v_previous
  from public.business_team_members
  where business_id = p_business_id
    and user_id = p_member_user_id
    and status <> 'removed'
  for update;

  if not found then
    raise exception 'team_member_not_found';
  end if;

  v_normalized := jsonb_build_object(
    'view_customers', coalesce((p_permissions ->> 'view_customers')::boolean, false),
    'contact_customers', coalesce((p_permissions ->> 'contact_customers')::boolean, false),
    'manage_catalog', coalesce((p_permissions ->> 'manage_catalog')::boolean, false),
    'view_reports', coalesce((p_permissions ->> 'view_reports')::boolean, false),
    'link_operations', coalesce((p_permissions ->> 'link_operations')::boolean, false),
    'payments.view', coalesce((p_permissions ->> 'payments.view')::boolean, false),
    'payments.claim', coalesce((p_permissions ->> 'payments.claim')::boolean, false),
    'payments.complete', coalesce((p_permissions ->> 'payments.complete')::boolean, false),
    'payments.release', coalesce((p_permissions ->> 'payments.release')::boolean, false),
    'payments.reassign', coalesce((p_permissions ->> 'payments.reassign')::boolean, false),
    'payments.review', coalesce((p_permissions ->> 'payments.review')::boolean, false)
  );

  if (v_normalized ->> 'contact_customers')::boolean
     and not (v_normalized ->> 'view_customers')::boolean then
    raise exception 'contact_customers_requires_view_customers';
  end if;

  if (
    (v_normalized ->> 'payments.claim')::boolean
    or (v_normalized ->> 'payments.complete')::boolean
    or (v_normalized ->> 'payments.release')::boolean
    or (v_normalized ->> 'payments.reassign')::boolean
    or (v_normalized ->> 'payments.review')::boolean
  ) and not (v_normalized ->> 'payments.view')::boolean then
    raise exception 'payment_actions_require_payments_view';
  end if;

  update public.business_team_members
  set job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
      label = nullif(btrim(coalesce(p_job_title, '')), ''),
      permissions = v_normalized,
      updated_at = now()
  where business_id = p_business_id
    and user_id = p_member_user_id
    and status <> 'removed'
  returning * into v_member;

  insert into public.business_team_actions (
    business_id,
    member_user_id,
    action,
    performed_by_user_id,
    metadata
  ) values (
    p_business_id,
    p_member_user_id,
    'permissions_updated',
    v_user_id,
    jsonb_build_object(
      'job_title', v_member.job_title,
      'previous_permissions', coalesce(v_previous, '{}'::jsonb),
      'permissions', v_member.permissions
    )
  );

  return jsonb_build_object(
    'ok', true,
    'member', to_jsonb(v_member),
    'permissions', v_member.permissions,
    'updated_at', v_member.updated_at
  );
end;
$$;

revoke all on function public.has_business_team_permission(uuid,text,uuid) from public, anon;
grant execute on function public.has_business_team_permission(uuid,text,uuid) to authenticated;

revoke all on function public.update_business_team_member_permissions(uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.update_business_team_member_permissions(uuid,uuid,text,jsonb) to authenticated;

commit;

alter table public.business_team_members
  add column if not exists membership_role text not null default 'employee',
  add column if not exists job_title text,
  add column if not exists permissions jsonb not null default '{}'::jsonb;

update public.business_team_members
set status = 'suspended'
where status = 'disabled';

update public.business_team_members
set job_title = coalesce(job_title, nullif(btrim(label), ''))
where job_title is null;

alter table public.business_team_members
  drop constraint if exists business_team_members_membership_role_check;
alter table public.business_team_members
  add constraint business_team_members_membership_role_check
  check (membership_role in ('employee'));

alter table public.business_team_members
  drop constraint if exists business_team_members_status_check;
alter table public.business_team_members
  add constraint business_team_members_status_check
  check (status in ('active','suspended','removed'));

alter table public.business_invitations
  add column if not exists membership_role text,
  add column if not exists job_title text,
  add column if not exists requested_permissions jsonb not null default '{}'::jsonb;

update public.business_invitations
set membership_role = coalesce(membership_role, 'employee'),
    job_title = coalesce(job_title, nullif(btrim(label), ''))
where invitation_type = 'team_member';

create or replace function public.get_business_team(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_invitations jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then raise exception 'business_owner_required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', tm.id,
    'business_id', tm.business_id,
    'user_id', tm.user_id,
    'membership_role', tm.membership_role,
    'role', tm.membership_role,
    'job_title', tm.job_title,
    'label', coalesce(tm.job_title, tm.label),
    'permissions', tm.permissions,
    'status', tm.status,
    'created_at', tm.created_at,
    'updated_at', tm.updated_at,
    'profile', jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'phone', p.phone,
      'status', p.status
    )
  ) order by tm.created_at asc), '[]'::jsonb)
  into v_items
  from public.business_team_members tm
  join public.profiles p on p.id = tm.user_id
  where tm.business_id = p_business_id
    and tm.status <> 'removed';

  select coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id', bi.id,
    'id', bi.id,
    'business_id', bi.business_id,
    'invited_phone', bi.invited_phone,
    'invited_user_id', bi.invited_user_id,
    'membership_role', coalesce(bi.membership_role, 'employee'),
    'role', coalesce(bi.membership_role, 'employee'),
    'job_title', coalesce(bi.job_title, bi.label),
    'label', coalesce(bi.job_title, bi.label),
    'requested_permissions', bi.requested_permissions,
    'status', bi.status,
    'created_at', bi.created_at,
    'expires_at', bi.expires_at
  ) order by bi.created_at desc), '[]'::jsonb)
  into v_invitations
  from public.business_invitations bi
  where bi.business_id = p_business_id
    and bi.invitation_type = 'team_member'
    and bi.status = 'pending'
    and bi.expires_at > now();

  return jsonb_build_object('items', v_items, 'pending_invitations', v_invitations);
end;
$function$;

create or replace function public.update_business_team_member_status(
  p_business_id uuid,
  p_member_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_member public.business_team_members%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then raise exception 'business_owner_required'; end if;

  if p_action = 'suspended' then
    v_status := 'suspended';
  elsif p_action = 'reactivated' then
    v_status := 'active';
  elsif p_action = 'removed' then
    v_status := 'removed';
  else
    raise exception 'invalid_team_action';
  end if;

  update public.business_team_members
  set status = v_status,
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'last_action', p_action,
        'last_reason', p_reason,
        'last_action_at', now()
      )
  where business_id = p_business_id and user_id = p_member_user_id
  returning * into v_member;

  if not found then raise exception 'team_member_not_found'; end if;

  insert into public.business_team_actions (
    business_id, member_user_id, action, performed_by_user_id, reason
  ) values (
    p_business_id, p_member_user_id, p_action, v_user_id, p_reason
  );

  return jsonb_build_object('ok', true, 'member', to_jsonb(v_member));
end;
$function$;

create or replace function public.update_business_team_member_permissions(
  p_business_id uuid,
  p_member_user_id uuid,
  p_job_title text default null,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_member public.business_team_members%rowtype;
  v_allowed_keys text[] := array[
    'view_customers','contact_customers','manage_catalog','view_reports','link_operations'
  ];
  v_key text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then raise exception 'business_owner_required'; end if;
  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object' then
    raise exception 'permissions_must_be_object';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_permissions, '{}'::jsonb))
  loop
    if not (v_key = any(v_allowed_keys)) then raise exception 'invalid_permission_key'; end if;
    if jsonb_typeof(p_permissions->v_key) <> 'boolean' then raise exception 'permission_value_must_be_boolean'; end if;
  end loop;

  update public.business_team_members
  set job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
      label = nullif(btrim(coalesce(p_job_title, '')), ''),
      permissions = coalesce(p_permissions, '{}'::jsonb),
      updated_at = now()
  where business_id = p_business_id
    and user_id = p_member_user_id
    and status <> 'removed'
  returning * into v_member;

  if not found then raise exception 'team_member_not_found'; end if;

  insert into public.business_team_actions (
    business_id, member_user_id, action, performed_by_user_id, metadata
  ) values (
    p_business_id, p_member_user_id, 'permissions_updated', v_user_id,
    jsonb_build_object('job_title', v_member.job_title, 'permissions', v_member.permissions)
  );

  return jsonb_build_object('ok', true, 'member', to_jsonb(v_member));
end;
$function$;

revoke all on function public.get_business_team(uuid) from public, anon;
grant execute on function public.get_business_team(uuid) to authenticated;
revoke all on function public.update_business_team_member_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.update_business_team_member_status(uuid, uuid, text, text) to authenticated;
revoke all on function public.update_business_team_member_permissions(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.update_business_team_member_permissions(uuid, uuid, text, jsonb) to authenticated;
create or replace function public.can_user_access_operation_file(
  p_user_id uuid,
  p_operation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.operations o
    where o.id = p_operation_id
      and (
        o.submitted_by_user_id = p_user_id
        or o.verified_by_user_id = p_user_id
        or exists (
          select 1
          from public.operation_user_links oul
          where oul.operation_id = o.id
            and oul.user_id = p_user_id
        )
        or exists (
          select 1
          from public.operation_access_logs oal
          where oal.operation_id = o.id
            and oal.user_id = p_user_id
        )
        or exists (
          select 1
          from public.business_operation_links bol
          join public.business_profiles bp on bp.id = bol.business_id
          where bol.operation_id = o.id
            and bol.status = 'active'
            and bp.owner_user_id = p_user_id
        )
        or exists (
          select 1
          from public.business_operation_links bol
          join public.business_team_members btm on btm.business_id = bol.business_id
          where bol.operation_id = o.id
            and bol.status = 'active'
            and btm.user_id = p_user_id
            and btm.status = 'active'
        )
      )
  );
$$;

revoke all on function public.can_user_access_operation_file(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_user_access_operation_file(uuid, uuid) to service_role;

comment on function public.can_user_access_operation_file(uuid, uuid) is
'Internal authorization check for issuing a fresh signed URL to an operation original file.';

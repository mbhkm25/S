begin;

create or replace function public.get_business_dashboard_summary(
  p_business_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.business_profiles%rowtype;
  v_catalog_total integer := 0;
  v_catalog_active integer := 0;
  v_customers_total integer := 0;
  v_customers_new_30d integer := 0;
  v_customers_inactive_90d integer := 0;
  v_team_active integer := 0;
  v_pending_invites integer := 0;
  v_operations_total integer := 0;
  v_pending_complaints integer := 0;
  v_financial_accounts integer := 0;
  v_missing jsonb := '[]'::jsonb;
  v_completed integer := 0;
  v_total_checks integer := 10;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_profile
  from public.business_profiles bp
  where bp.id = p_business_id
    and (
      bp.owner_user_id = v_user_id
      or public.is_platform_admin(v_user_id)
    );

  if not found then
    raise exception 'business_owner_required';
  end if;

  select
    count(*)::integer,
    count(*) filter (where status = 'active')::integer
  into v_catalog_total, v_catalog_active
  from public.business_catalog_items
  where business_id = p_business_id;

  select
    count(*)::integer,
    count(*) filter (where created_at >= now() - interval '30 days')::integer,
    count(*) filter (
      where coalesce(last_contacted_at, created_at) < now() - interval '90 days'
    )::integer
  into v_customers_total, v_customers_new_30d, v_customers_inactive_90d
  from public.business_customers
  where business_id = p_business_id
    and status = 'active';

  select count(*)::integer
  into v_team_active
  from public.business_team_members
  where business_id = p_business_id
    and status = 'active';

  select count(*)::integer
  into v_pending_invites
  from public.business_invitations
  where business_id = p_business_id
    and invitation_type = 'team_member'
    and status = 'pending'
    and expires_at > now();

  select count(*)::integer
  into v_operations_total
  from public.business_operation_links
  where business_id = p_business_id
    and status = 'linked';

  v_pending_complaints := coalesce(
    (
      select count(*)::integer
      from jsonb_array_elements(
        coalesce(v_profile.profile_sections->'complaints', '[]'::jsonb)
      ) item
      where coalesce(item->>'status', 'pending') = 'pending'
    ),
    0
  );

  v_financial_accounts := coalesce(
    jsonb_array_length(
      case
        when jsonb_typeof(v_profile.profile_sections->'financial_accounts') = 'array'
          then v_profile.profile_sections->'financial_accounts'
        else '[]'::jsonb
      end
    ),
    0
  );

  if nullif(btrim(v_profile.name), '') is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"name"'::jsonb; end if;
  if v_profile.category_id is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"category"'::jsonb; end if;
  if nullif(btrim(coalesce(v_profile.description, '')), '') is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"description"'::jsonb; end if;
  if nullif(btrim(coalesce(v_profile.governorate, '')), '') is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"governorate"'::jsonb; end if;
  if nullif(btrim(coalesce(v_profile.city, '')), '') is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"city"'::jsonb; end if;
  if nullif(btrim(coalesce(v_profile.whatsapp, '')), '') is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"whatsapp"'::jsonb; end if;
  if nullif(btrim(coalesce(v_profile.address_text, '')), '') is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"address"'::jsonb; end if;
  if coalesce(v_profile.profile_image_path, v_profile.logo_path) is not null then v_completed := v_completed + 1; else v_missing := v_missing || '"profile_image"'::jsonb; end if;
  if v_catalog_active > 0 then v_completed := v_completed + 1; else v_missing := v_missing || '"catalog"'::jsonb; end if;
  if jsonb_typeof(v_profile.working_hours) = 'object' and v_profile.working_hours <> '{}'::jsonb then v_completed := v_completed + 1; else v_missing := v_missing || '"working_hours"'::jsonb; end if;

  return jsonb_build_object(
    'business_id', p_business_id,
    'profile', jsonb_build_object(
      'score', round((v_completed::numeric / v_total_checks::numeric) * 100)::integer,
      'completed', v_completed,
      'total', v_total_checks,
      'missing', v_missing,
      'public_status', v_profile.public_status,
      'verification_status', v_profile.verification_status,
      'review_note', v_profile.review_note
    ),
    'catalog', jsonb_build_object(
      'total', v_catalog_total,
      'active', v_catalog_active
    ),
    'customers', jsonb_build_object(
      'total', v_customers_total,
      'new_30d', v_customers_new_30d,
      'inactive_90d', v_customers_inactive_90d
    ),
    'team', jsonb_build_object(
      'active', v_team_active,
      'pending_invitations', v_pending_invites
    ),
    'operations', jsonb_build_object(
      'total', v_operations_total
    ),
    'financial_accounts', jsonb_build_object(
      'total', v_financial_accounts
    ),
    'complaints', jsonb_build_object(
      'pending', v_pending_complaints
    )
  );
end;
$function$;

revoke all on function public.get_business_dashboard_summary(uuid) from public;
revoke all on function public.get_business_dashboard_summary(uuid) from anon;
grant execute on function public.get_business_dashboard_summary(uuid) to authenticated;

commit;

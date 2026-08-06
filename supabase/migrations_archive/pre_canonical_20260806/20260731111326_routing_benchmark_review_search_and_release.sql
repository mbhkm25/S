create or replace function public.platform_admin_release_routing_benchmark_case(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select * into v_case
  from public.operation_routing_benchmark_cases
  where id = p_case_id
  for update;

  if not found then raise exception 'benchmark_case_not_found'; end if;
  if v_case.status <> 'in_review' then
    return jsonb_build_object('ok', true, 'case_id', v_case.id, 'status', v_case.status);
  end if;
  if v_case.claimed_by_user_id is distinct from auth.uid()
     and v_case.claim_expires_at > now() then
    raise exception 'benchmark_case_claimed_by_another_admin';
  end if;

  update public.operation_routing_benchmark_cases
  set status = 'pending',
      claimed_by_user_id = null,
      claimed_at = null,
      claim_expires_at = null,
      updated_at = now()
  where id = p_case_id;

  return jsonb_build_object('ok', true, 'case_id', p_case_id, 'status', 'pending');
end;
$$;

create or replace function public.platform_admin_search_routing_benchmark_accounts(
  p_query text default null,
  p_entity_code text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := lower(nullif(trim(coalesce(p_query, '')), ''));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_results jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id', a.id,
    'business_id', a.business_id,
    'business_name', bp.name,
    'account_holder_name', a.account_holder_name,
    'account_label', a.account_label,
    'financial_entity_code', a.financial_entity_code,
    'financial_entity_name', fe.display_name_ar,
    'verification_status', a.verification_status,
    'routing_enabled', a.routing_enabled,
    'identifiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', i.identifier_type,
        'value', i.identifier_value,
        'currency', i.currency,
        'is_primary', i.is_primary
      ) order by i.is_primary desc, i.created_at)
      from public.business_financial_identifiers i
      where i.financial_account_id = a.id and i.status = 'active'
    ), '[]'::jsonb)
  ) order by bp.name, a.account_label nulls last, a.account_holder_name nulls last), '[]'::jsonb)
  into v_results
  from (
    select a.*
    from public.business_financial_accounts a
    join public.business_profiles bp_filter on bp_filter.id = a.business_id
    where a.status = 'active'
      and (p_entity_code is null or p_entity_code = '' or a.financial_entity_code = p_entity_code)
      and (
        v_query is null
        or lower(coalesce(bp_filter.name, '')) like '%' || v_query || '%'
        or lower(coalesce(a.account_holder_name, '')) like '%' || v_query || '%'
        or lower(coalesce(a.account_label, '')) like '%' || v_query || '%'
        or exists (
          select 1 from public.business_financial_identifiers i_search
          where i_search.financial_account_id = a.id
            and i_search.status = 'active'
            and lower(i_search.identifier_value) like '%' || v_query || '%'
        )
      )
    order by a.routing_enabled desc, a.verification_status = 'verified' desc, a.updated_at desc
    limit v_limit
  ) a
  join public.business_profiles bp on bp.id = a.business_id
  join public.financial_entities fe on fe.code = a.financial_entity_code;

  return jsonb_build_object(
    'query', p_query,
    'entity_code', p_entity_code,
    'results', v_results
  );
end;
$$;

revoke all on function public.platform_admin_release_routing_benchmark_case(uuid) from public, anon;
revoke all on function public.platform_admin_search_routing_benchmark_accounts(text,text,integer) from public, anon;
grant execute on function public.platform_admin_release_routing_benchmark_case(uuid) to authenticated;
grant execute on function public.platform_admin_search_routing_benchmark_accounts(text,text,integer) to authenticated;

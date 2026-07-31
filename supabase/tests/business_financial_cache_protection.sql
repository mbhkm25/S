-- Verify that general profile edits cannot overwrite the normalized financial account cache.
-- All writes are rolled back.

begin;

do $$
declare
  v_business_id uuid;
  v_owner_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  select bp.id, bp.owner_user_id, coalesce(bp.profile_sections->'financial_accounts', '[]'::jsonb)
  into v_business_id, v_owner_id, v_before
  from public.business_profiles bp
  where exists (
    select 1
    from public.business_financial_accounts a
    where a.business_id = bp.id
      and a.status = 'active'
  )
  limit 1;

  if v_business_id is null then
    raise notice 'Skipping cache protection assertion: no business financial account fixture exists.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.update_business_profile(
    p_business_id => v_business_id,
    p_profile_sections => jsonb_build_object(
      'financial_accounts', jsonb_build_array(jsonb_build_object('id', 'tampered')),
      'cache_protection_probe', true
    )
  );

  select coalesce(bp.profile_sections->'financial_accounts', '[]'::jsonb)
  into v_after
  from public.business_profiles bp
  where bp.id = v_business_id;

  if v_after is distinct from v_before then
    raise exception 'financial_accounts_cache_was_overwritten';
  end if;

  if coalesce((v_result->'business'->'profile_sections'->>'cache_protection_probe')::boolean, false) is not true then
    raise exception 'non_financial_profile_section_update_failed';
  end if;
end;
$$;

rollback;

select 'business_financial_cache_protection_passed' as result;

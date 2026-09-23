-- Stage 2B Data Train D1 / M1
-- Multi-business ownership compatibility.
-- Retires the obsolete one-business-per-owner restriction while preserving lookup performance.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.business_profiles'::regclass
      and conname = 'one_business_per_owner'
  ) then
    raise exception 'precondition_failed: one_business_per_owner constraint not found';
  end if;
end
$$;

alter table public.business_profiles
  drop constraint one_business_per_owner;

create index if not exists business_profiles_owner_user_idx
  on public.business_profiles(owner_user_id);

create or replace function public.create_business_profile(
  p_name text,
  p_slug text default null::text,
  p_category_id uuid default null::uuid,
  p_governorate text default null::text,
  p_city text default null::text,
  p_whatsapp text default null::text,
  p_description text default null::text,
  p_logo_path text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_slug text;
  v_whatsapp text;
  v_business public.business_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not coalesce((
    select s.registration_open
    from public.business_community_settings s
    where s.singleton = true
  ), true) and not public.is_platform_admin(v_user_id) then
    raise exception 'business_registration_closed';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id and status = 'active';

  if not found then
    raise exception 'profile_not_found_or_inactive';
  end if;

  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 120 then
    raise exception 'invalid_business_name';
  end if;

  if p_description is not null and length(p_description) > 4000 then
    raise exception 'business_description_too_long';
  end if;

  if p_governorate is not null and length(trim(p_governorate)) > 100 then
    raise exception 'business_governorate_too_long';
  end if;

  if p_city is not null and length(trim(p_city)) > 100 then
    raise exception 'business_city_too_long';
  end if;

  v_whatsapp := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  if v_whatsapp !~ '^967[0-9]{9}$' then
    raise exception 'valid_yemen_whatsapp_required';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.business_categories
    where id = p_category_id and status = 'active'
  ) then
    raise exception 'invalid_business_category';
  end if;

  v_slug := public.sanitize_business_slug(
    coalesce(nullif(trim(p_slug), ''), p_name)
  );

  if length(v_slug) < 3 then
    v_slug := 'business-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;

  if length(v_slug) > 100 then
    v_slug := left(v_slug, 100);
  end if;

  if exists (
    select 1
    from public.business_profiles
    where slug = v_slug
  ) then
    v_slug := left(v_slug, 93) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.business_profiles (
    owner_user_id,
    name,
    slug,
    category_id,
    governorate,
    city,
    whatsapp,
    description,
    logo_path,
    public_status,
    verification_status,
    submitted_for_review_at
  )
  values (
    v_user_id,
    trim(p_name),
    v_slug,
    p_category_id,
    nullif(trim(coalesce(p_governorate, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    v_whatsapp,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_logo_path, '')), ''),
    'pending_review',
    'pending_review',
    now()
  )
  returning * into v_business;

  insert into public.business_team_members (
    business_id,
    user_id,
    status,
    label,
    added_by_owner_id,
    metadata
  )
  values (
    v_business.id,
    v_user_id,
    'active',
    'مالك النشاط',
    v_user_id,
    jsonb_build_object('auto_added_owner', true)
  )
  on conflict (business_id, user_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'business', to_jsonb(v_business),
    'message', 'business_submitted_for_review'
  );
end;
$function$;

comment on function public.create_business_profile(
  text,text,uuid,text,text,text,text,text
) is
'Creates a business for the authenticated user. Stage 2B removes the legacy single-owned-business restriction; plan limits belong in explicit policy, not owner uniqueness.';

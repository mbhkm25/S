create table if not exists public.business_community_settings (
  singleton boolean primary key default true check (singleton),
  phase text not null default 'prelaunch'
    check (phase in ('prelaunch', 'early_access', 'public', 'maintenance')),
  registration_open boolean not null default true,
  minimum_category_size integer not null default 5
    check (minimum_category_size between 1 and 100),
  enabled_governorates text[] not null default '{}'::text[],
  prelaunch_title text not null default 'نبني دليل أعمال يستحق ثقتك',
  prelaunch_body text not null default 'يجري الآن تجهيز مجتمع أعمال سند بأنشطة موثقة وبيانات مكتملة.',
  early_access_title text not null default 'مجتمع أعمال سند ـ وصول مبكر',
  early_access_body text not null default 'نعرض حاليًا الأنشطة الموثقة والمكتملة، ونوسّع الدليل تدريجيًا.',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.business_community_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.business_community_settings enable row level security;
revoke all on table public.business_community_settings from public, anon, authenticated;
grant select on table public.business_community_settings to anon, authenticated;

drop policy if exists business_community_settings_public_read
  on public.business_community_settings;
create policy business_community_settings_public_read
  on public.business_community_settings
  for select
  to anon, authenticated
  using (singleton = true);

alter table public.profiles
  add column if not exists business_discovery_scope text not null default 'profile_governorate',
  add column if not exists business_discovery_governorate text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_business_discovery_scope_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_business_discovery_scope_check
      check (business_discovery_scope in ('profile_governorate', 'governorate', 'all_yemen'));
  end if;
end;
$$;

create table if not exists public.business_community_interest (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_governorate text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_community_interest enable row level security;
revoke all on table public.business_community_interest from public, anon, authenticated;
grant select, insert, update on table public.business_community_interest to authenticated;

drop policy if exists business_community_interest_own_select
  on public.business_community_interest;
create policy business_community_interest_own_select
  on public.business_community_interest
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists business_community_interest_own_insert
  on public.business_community_interest;
create policy business_community_interest_own_insert
  on public.business_community_interest
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists business_community_interest_own_update
  on public.business_community_interest;
create policy business_community_interest_own_update
  on public.business_community_interest
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists business_profiles_public_discovery_idx
  on public.business_profiles (governorate, category_id, created_at desc)
  where public_status = 'published';

create or replace function public.get_business_community_context()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_settings public.business_community_settings%rowtype;
  v_profile_governorate text;
  v_scope text := 'all_yemen';
  v_preferred_governorate text;
  v_effective_governorate text;
  v_visible_categories jsonb := '[]'::jsonb;
  v_available_governorates jsonb := '[]'::jsonb;
begin
  select * into v_settings
  from public.business_community_settings
  where singleton = true;

  if v_user_id is not null then
    select p.governorate, p.business_discovery_scope, p.business_discovery_governorate
      into v_profile_governorate, v_scope, v_preferred_governorate
    from public.profiles p
    where p.id = v_user_id;
  end if;

  v_scope := coalesce(v_scope, 'profile_governorate');
  if v_scope = 'all_yemen' then
    v_effective_governorate := null;
  elsif v_scope = 'governorate' then
    v_effective_governorate := nullif(trim(coalesce(v_preferred_governorate, '')), '');
  else
    v_effective_governorate := nullif(trim(coalesce(v_profile_governorate, '')), '');
  end if;

  if v_settings.phase in ('early_access', 'public') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id,
      'name_ar', x.name_ar,
      'business_count', x.business_count
    ) order by x.display_order, x.name_ar), '[]'::jsonb)
    into v_visible_categories
    from (
      select c.id, c.name_ar, c.display_order, count(*)::integer as business_count
      from public.business_categories c
      join public.business_profiles b on b.category_id = c.id
      where c.status = 'active'
        and b.public_status = 'published'
        and (v_settings.phase <> 'early_access' or b.verification_status = 'verified')
        and (
          cardinality(v_settings.enabled_governorates) = 0
          or b.governorate = any(v_settings.enabled_governorates)
        )
      group by c.id, c.name_ar, c.display_order
      having v_settings.phase = 'public'
        or count(*) >= v_settings.minimum_category_size
    ) x;

    select coalesce(jsonb_agg(x.governorate order by x.governorate), '[]'::jsonb)
    into v_available_governorates
    from (
      select distinct b.governorate
      from public.business_profiles b
      where b.public_status = 'published'
        and b.governorate is not null
        and (v_settings.phase <> 'early_access' or b.verification_status = 'verified')
        and (
          cardinality(v_settings.enabled_governorates) = 0
          or b.governorate = any(v_settings.enabled_governorates)
        )
    ) x;
  end if;

  return jsonb_build_object(
    'phase', v_settings.phase,
    'registration_open', v_settings.registration_open,
    'minimum_category_size', v_settings.minimum_category_size,
    'enabled_governorates', to_jsonb(v_settings.enabled_governorates),
    'prelaunch_title', v_settings.prelaunch_title,
    'prelaunch_body', v_settings.prelaunch_body,
    'early_access_title', v_settings.early_access_title,
    'early_access_body', v_settings.early_access_body,
    'profile_governorate', v_profile_governorate,
    'discovery_scope', v_scope,
    'preferred_governorate', v_preferred_governorate,
    'effective_governorate', v_effective_governorate,
    'visible_categories', v_visible_categories,
    'available_governorates', v_available_governorates,
    'has_launch_interest', case
      when v_user_id is null then false
      else exists (
        select 1 from public.business_community_interest i where i.user_id = v_user_id
      )
    end
  );
end;
$function$;

create or replace function public.set_my_business_discovery_preference(
  p_scope text,
  p_governorate text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_scope text := trim(coalesce(p_scope, ''));
  v_governorate text := nullif(trim(coalesce(p_governorate, '')), '');
  v_profile_governorate text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_scope not in ('profile_governorate', 'governorate', 'all_yemen') then
    raise exception 'invalid_business_discovery_scope';
  end if;
  if v_governorate is not null and length(v_governorate) > 100 then
    raise exception 'invalid_business_discovery_governorate';
  end if;

  select p.governorate into v_profile_governorate
  from public.profiles p
  where p.id = v_user_id and p.status = 'active';
  if not found then
    raise exception 'profile_not_found_or_inactive';
  end if;

  if v_scope = 'governorate' and v_governorate is null then
    raise exception 'business_discovery_governorate_required';
  end if;

  update public.profiles
  set business_discovery_scope = v_scope,
      business_discovery_governorate = case when v_scope = 'governorate' then v_governorate else null end,
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'scope', v_scope,
    'governorate', case
      when v_scope = 'profile_governorate' then v_profile_governorate
      when v_scope = 'governorate' then v_governorate
      else null
    end
  );
end;
$function$;

create or replace function public.register_business_community_interest(
  p_governorate text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_governorate text := nullif(trim(coalesce(p_governorate, '')), '');
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_governorate is not null and length(v_governorate) > 100 then
    raise exception 'invalid_governorate';
  end if;

  insert into public.business_community_interest (user_id, preferred_governorate)
  values (v_user_id, v_governorate)
  on conflict (user_id) do update
    set preferred_governorate = excluded.preferred_governorate,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.platform_admin_get_business_community_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_settings public.business_community_settings%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select * into v_settings
  from public.business_community_settings
  where singleton = true;

  return jsonb_build_object(
    'settings', to_jsonb(v_settings),
    'interest_count', (select count(*) from public.business_community_interest),
    'distribution', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.published_count desc, x.governorate)
      from (
        select b.governorate,
               count(*)::integer as total_count,
               count(*) filter (where b.public_status = 'published')::integer as published_count,
               count(*) filter (
                 where b.public_status = 'published' and b.verification_status = 'verified'
               )::integer as verified_count
        from public.business_profiles b
        group by b.governorate
      ) x
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.published_count desc, x.name_ar)
      from (
        select c.id, c.name_ar,
               count(b.id)::integer as total_count,
               count(b.id) filter (where b.public_status = 'published')::integer as published_count,
               count(b.id) filter (
                 where b.public_status = 'published' and b.verification_status = 'verified'
               )::integer as verified_count
        from public.business_categories c
        left join public.business_profiles b on b.category_id = c.id
        where c.status = 'active'
        group by c.id, c.name_ar, c.display_order
        order by c.display_order
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.platform_admin_update_business_community_settings(
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.business_community_settings%rowtype;
  v_after public.business_community_settings%rowtype;
  v_phase text;
  v_minimum integer;
  v_enabled_governorates text[];
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'admin_reason_required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_business_community_payload';
  end if;

  select * into v_before
  from public.business_community_settings
  where singleton = true
  for update;

  v_phase := coalesce(nullif(trim(p_payload->>'phase'), ''), v_before.phase);
  if v_phase not in ('prelaunch', 'early_access', 'public', 'maintenance') then
    raise exception 'invalid_business_community_phase';
  end if;

  v_minimum := coalesce((p_payload->>'minimum_category_size')::integer, v_before.minimum_category_size);
  if v_minimum not between 1 and 100 then
    raise exception 'invalid_minimum_category_size';
  end if;

  if p_payload ? 'enabled_governorates' then
    if jsonb_typeof(p_payload->'enabled_governorates') <> 'array' then
      raise exception 'enabled_governorates_must_be_array';
    end if;
    select coalesce(array_agg(distinct trim(value)) filter (where trim(value) <> ''), '{}'::text[])
      into v_enabled_governorates
    from jsonb_array_elements_text(p_payload->'enabled_governorates') as values_list(value);
  else
    v_enabled_governorates := v_before.enabled_governorates;
  end if;

  if exists (select 1 from unnest(v_enabled_governorates) g where length(g) > 100) then
    raise exception 'invalid_enabled_governorate';
  end if;

  update public.business_community_settings
  set phase = v_phase,
      registration_open = coalesce((p_payload->>'registration_open')::boolean, v_before.registration_open),
      minimum_category_size = v_minimum,
      enabled_governorates = v_enabled_governorates,
      prelaunch_title = left(coalesce(nullif(trim(p_payload->>'prelaunch_title'), ''), v_before.prelaunch_title), 160),
      prelaunch_body = left(coalesce(nullif(trim(p_payload->>'prelaunch_body'), ''), v_before.prelaunch_body), 1000),
      early_access_title = left(coalesce(nullif(trim(p_payload->>'early_access_title'), ''), v_before.early_access_title), 160),
      early_access_body = left(coalesce(nullif(trim(p_payload->>'early_access_body'), ''), v_before.early_access_body), 1000),
      updated_at = now(),
      updated_by = auth.uid()
  where singleton = true
  returning * into v_after;

  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data, after_data)
  values
    (auth.uid(), 'business_community_settings_updated', 'business_community', 'singleton',
     trim(p_reason), to_jsonb(v_before), to_jsonb(v_after));

  return jsonb_build_object('ok', true, 'settings', to_jsonb(v_after));
end;
$function$;

create or replace function public.get_public_businesses(
  p_search text default null,
  p_category_id uuid default null,
  p_governorate text default null,
  p_city text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_items jsonb;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_governorate text := nullif(trim(coalesce(p_governorate, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_settings public.business_community_settings%rowtype;
begin
  select * into v_settings
  from public.business_community_settings
  where singleton = true;

  if v_settings.phase in ('prelaunch', 'maintenance') then
    return jsonb_build_object('items', '[]'::jsonb, 'limit', v_limit, 'offset', v_offset);
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.business_categories
    where id = p_category_id and status = 'active'
  ) then
    return jsonb_build_object('items', '[]'::jsonb, 'limit', v_limit, 'offset', v_offset);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bp.id,
    'name', bp.name,
    'slug', bp.slug,
    'category', case when bc.id is null then null else jsonb_build_object('id', bc.id, 'code', bc.code, 'name_ar', bc.name_ar) end,
    'category_name', bc.name_ar,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'description', bp.description,
    'logo_path', bp.logo_path,
    'profile_image_path', bp.profile_image_path,
    'logo_url', coalesce(bp.profile_image_path, bp.logo_path),
    'public_status', bp.public_status,
    'verification_status', bp.verification_status,
    'created_at', bp.created_at
  ) order by bp.discovery_rank desc, bp.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select bp0.*,
      (
        case when bp0.verification_status = 'verified' then 100 else 0 end
        + case when bp0.category_id is not null then 10 else 0 end
        + case when nullif(trim(coalesce(bp0.description, '')), '') is not null then 10 else 0 end
        + case when coalesce(bp0.profile_image_path, bp0.logo_path) is not null then 10 else 0 end
        + case when nullif(trim(coalesce(bp0.whatsapp, '')), '') is not null then 5 else 0 end
      ) as discovery_rank
    from public.business_profiles bp0
    where bp0.public_status = 'published'
      and (v_settings.phase <> 'early_access' or bp0.verification_status = 'verified')
      and (
        cardinality(v_settings.enabled_governorates) = 0
        or bp0.governorate = any(v_settings.enabled_governorates)
      )
      and (
        v_settings.phase <> 'early_access'
        or bp0.category_id in (
          select b.category_id
          from public.business_profiles b
          where b.public_status = 'published'
            and b.verification_status = 'verified'
            and b.category_id is not null
            and (
              cardinality(v_settings.enabled_governorates) = 0
              or b.governorate = any(v_settings.enabled_governorates)
            )
          group by b.category_id
          having count(*) >= v_settings.minimum_category_size
        )
      )
      and (p_category_id is null or bp0.category_id = p_category_id)
      and (v_governorate is null or bp0.governorate = v_governorate)
      and (v_city is null or bp0.city = v_city)
      and (
        v_search is null
        or bp0.name ilike '%' || v_search || '%'
        or bp0.description ilike '%' || v_search || '%'
        or bp0.city ilike '%' || v_search || '%'
        or bp0.governorate ilike '%' || v_search || '%'
      )
    order by discovery_rank desc, bp0.created_at desc
    limit v_limit
    offset v_offset
  ) bp
  left join public.business_categories bc on bc.id = bp.category_id;

  return jsonb_build_object('items', v_items, 'limit', v_limit, 'offset', v_offset);
end;
$function$;

create or replace function public.create_business_profile(
  p_name text,
  p_slug text default null,
  p_category_id uuid default null,
  p_governorate text default null,
  p_city text default null,
  p_whatsapp text default null,
  p_description text default null,
  p_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  if exists (select 1 from public.business_profiles where owner_user_id = v_user_id) then
    raise exception 'business_already_exists_for_user';
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
    select 1 from public.business_categories where id = p_category_id and status = 'active'
  ) then
    raise exception 'invalid_business_category';
  end if;

  v_slug := public.sanitize_business_slug(coalesce(nullif(trim(p_slug), ''), p_name));
  if length(v_slug) < 3 then
    v_slug := 'business-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;
  if length(v_slug) > 100 then
    v_slug := left(v_slug, 100);
  end if;
  if exists (select 1 from public.business_profiles where slug = v_slug) then
    v_slug := left(v_slug, 93) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.business_profiles (
    owner_user_id, name, slug, category_id, governorate, city, whatsapp,
    description, logo_path, public_status, verification_status, submitted_for_review_at
  ) values (
    v_user_id, trim(p_name), v_slug, p_category_id,
    nullif(trim(coalesce(p_governorate, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    v_whatsapp,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_logo_path, '')), ''),
    'pending_review', 'pending_review', now()
  ) returning * into v_business;

  insert into public.business_team_members (
    business_id, user_id, status, label, added_by_owner_id, metadata
  ) values (
    v_business.id, v_user_id, 'active', 'مالك النشاط', v_user_id,
    jsonb_build_object('auto_added_owner', true)
  ) on conflict (business_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business), 'message', 'business_submitted_for_review');
end;
$function$;

revoke all on function public.get_business_community_context() from public;
revoke all on function public.set_my_business_discovery_preference(text, text) from public, anon;
revoke all on function public.register_business_community_interest(text) from public, anon;
revoke all on function public.platform_admin_get_business_community_settings() from public, anon;
revoke all on function public.platform_admin_update_business_community_settings(jsonb, text) from public, anon;

grant execute on function public.get_business_community_context() to anon, authenticated;
grant execute on function public.set_my_business_discovery_preference(text, text) to authenticated;
grant execute on function public.register_business_community_interest(text) to authenticated;
grant execute on function public.platform_admin_get_business_community_settings() to authenticated;
grant execute on function public.platform_admin_update_business_community_settings(jsonb, text) to authenticated;

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.business_media_can_read(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_profiles bp
    where bp.id = public.business_media_path_business_id(p_object_name)
      and (
        bp.public_status = 'published'
        or bp.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.business_team_members tm
          where tm.business_id = bp.id
            and tm.user_id = auth.uid()
            and tm.status = 'active'
        )
      )
  );
$$;

create or replace function private.business_media_can_manage(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.business_media_path_asset_type(p_object_name) in ('cover', 'profile', 'gallery')
    and exists (
      select 1
      from public.business_profiles bp
      where bp.id = public.business_media_path_business_id(p_object_name)
        and bp.owner_user_id = auth.uid()
    );
$$;

revoke execute on function private.business_media_can_read(text) from public;
revoke execute on function private.business_media_can_manage(text) from public;
grant execute on function private.business_media_can_read(text) to anon, authenticated, service_role;
grant execute on function private.business_media_can_manage(text) to authenticated, service_role;

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
set search_path = public
as $$
declare
  v_items jsonb;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_governorate text := nullif(trim(coalesce(p_governorate, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
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
  ) order by bp.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select *
    from public.business_profiles bp0
    where bp0.public_status = 'published'
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
    order by bp0.created_at desc
    limit v_limit
    offset v_offset
  ) bp
  left join public.business_categories bc on bc.id = bp.category_id;

  return jsonb_build_object('items', v_items, 'limit', v_limit, 'offset', v_offset);
end;
$$;

alter function public.safe_uuid(text) set search_path = pg_catalog, public;
alter function public.sanitize_business_slug(text) set search_path = pg_catalog, public;
alter function public.normalize_whatsapp_catalog_url(text) set search_path = pg_catalog, public;
alter function public.business_media_path_business_id(text) set search_path = pg_catalog, public, storage;
alter function public.business_media_path_asset_type(text) set search_path = pg_catalog, public, storage;

revoke all on table
  public.business_catalog_items,
  public.business_categories,
  public.business_customers,
  public.business_inquiries,
  public.business_invitations,
  public.business_media_assets,
  public.business_operation_links,
  public.business_profiles,
  public.business_team_actions,
  public.business_team_members
from anon;

revoke insert, update, delete on table
  public.business_catalog_items,
  public.business_categories,
  public.business_customers,
  public.business_inquiries,
  public.business_invitations,
  public.business_media_assets,
  public.business_operation_links,
  public.business_profiles,
  public.business_team_actions,
  public.business_team_members
from authenticated;

grant select on table
  public.business_catalog_items,
  public.business_categories,
  public.business_customers,
  public.business_inquiries,
  public.business_invitations,
  public.business_media_assets,
  public.business_operation_links,
  public.business_profiles,
  public.business_team_actions,
  public.business_team_members
to authenticated;

grant select on table public.business_categories to anon;

drop policy if exists business_categories_select_anon on public.business_categories;
create policy business_categories_select_anon
on public.business_categories
for select
to anon
using (status = 'active');

drop policy if exists business_media_authenticated_insert on storage.objects;
drop policy if exists business_media_authenticated_select on storage.objects;
drop policy if exists business_media_authenticated_update on storage.objects;
drop policy if exists business_media_authenticated_delete on storage.objects;
drop policy if exists business_media_public_select on storage.objects;
drop policy if exists business_media_owner_insert on storage.objects;
drop policy if exists business_media_owner_update on storage.objects;
drop policy if exists business_media_owner_delete on storage.objects;

create policy business_media_public_select
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'business-media'
  and private.business_media_can_read(name)
);

create policy business_media_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-media'
  and private.business_media_can_manage(name)
);

create policy business_media_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-media'
  and private.business_media_can_manage(name)
)
with check (
  bucket_id = 'business-media'
  and private.business_media_can_manage(name)
);

create policy business_media_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-media'
  and private.business_media_can_manage(name)
);

-- Remove inherited/default EXECUTE exposure for the business API surface.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like '%business%'
        or p.proname in ('sanitize_business_slug','normalize_whatsapp_catalog_url','safe_uuid','is_platform_admin')
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.signature);
    execute format('grant execute on function %s to service_role', r.signature);
  end loop;
end $$;

-- Public read endpoints.
grant execute on function public.get_public_businesses(text, uuid, text, text, integer, integer) to anon, authenticated;
grant execute on function public.get_public_business_profile(text) to anon, authenticated;

-- Signed-in business operations.
grant execute on function public.accept_business_invitation(text) to authenticated;
grant execute on function public.create_business_profile(text, text, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.create_business_team_invitation(uuid, text, text) to authenticated;
grant execute on function public.get_business_catalog(uuid, boolean) to authenticated;
grant execute on function public.get_business_operations(uuid) to authenticated;
grant execute on function public.get_business_team(uuid) to authenticated;
grant execute on function public.get_linkable_businesses_for_user() to authenticated;
grant execute on function public.get_user_business_contexts() to authenticated;
grant execute on function public.join_business_as_customer(uuid, text) to authenticated;
grant execute on function public.link_operation_to_business(uuid, uuid) to authenticated;
grant execute on function public.platform_admin_review_business(uuid, text, text) to authenticated;
grant execute on function public.register_business_media_asset(uuid, text, text, text, text, bigint, text, integer) to authenticated;
grant execute on function public.set_business_profile_media(uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function public.unlink_operation_from_business(uuid) to authenticated;
grant execute on function public.update_business_profile(uuid, text, text, text, text, text, uuid, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, jsonb, jsonb, text, boolean) to authenticated;
grant execute on function public.update_business_team_member_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.upsert_business_catalog_item(uuid, uuid, text, text, text, numeric, text, jsonb, jsonb, text, integer) to authenticated;
grant execute on function public.business_action_get_catalog(jsonb) to authenticated;
grant execute on function public.business_action_get_team(jsonb) to authenticated;
grant execute on function public.business_action_register_media_asset(jsonb) to authenticated;
grant execute on function public.business_action_set_profile_media(jsonb) to authenticated;

-- Prevent automatic API exposure for future functions created by postgres.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

notify pgrst, 'reload schema';
commit;;

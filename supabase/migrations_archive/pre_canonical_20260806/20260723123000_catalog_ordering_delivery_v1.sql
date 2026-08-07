-- SANAD catalog ordering and delivery foundation v1
-- Lightweight WhatsApp-first ordering without persistent order lifecycle.

alter table public.business_profiles
  add column if not exists catalog_display_settings jsonb not null default jsonb_build_object(
    'ordering_enabled', true,
    'add_button_label', 'أضف للطلب',
    'send_button_label', 'إرسال الطلب عبر واتساب',
    'whatsapp_message_intro', 'مرحبًا، أريد طلب العناصر التالية:',
    'require_customer_name', false,
    'require_address', false,
    'allow_item_notes', true,
    'show_total', true,
    'show_prices', true,
    'show_direct_whatsapp', false,
    'max_item_quantity', 20,
    'price_display', 'compact',
    'missing_price_label', 'السعر عند الطلب',
    'card_style', 'modern',
    'card_effect', 'spotlight',
    'featured_section_title', null
  ),
  add column if not exists delivery_service_settings jsonb not null default jsonb_build_object(
    'is_delivery_provider', false,
    'customer_delivery_enabled', false,
    'service_areas', jsonb_build_array(),
    'delivery_types', jsonb_build_array(),
    'pricing_note', null,
    'availability_note', null,
    'share_order_total', true,
    'require_customer_address', true,
    'require_privacy_consent', true
  );

-- Existing profiles may contain three featured IDs from the previous release.
update public.business_profiles
set featured_item_ids = coalesce((
  select jsonb_agg(value order by ordinality)
  from jsonb_array_elements(featured_item_ids) with ordinality as x(value, ordinality)
  where ordinality <= 2
), '[]'::jsonb)
where jsonb_typeof(featured_item_ids) = 'array'
  and jsonb_array_length(featured_item_ids) > 2;

alter table public.business_profiles
  drop constraint if exists business_profiles_featured_item_ids_array_check;

alter table public.business_profiles
  add constraint business_profiles_featured_item_ids_array_check
  check (jsonb_typeof(featured_item_ids) = 'array' and jsonb_array_length(featured_item_ids) <= 2);

alter table public.business_profiles
  drop constraint if exists business_profiles_catalog_display_settings_object_check;
alter table public.business_profiles
  add constraint business_profiles_catalog_display_settings_object_check
  check (jsonb_typeof(catalog_display_settings) = 'object');

alter table public.business_profiles
  drop constraint if exists business_profiles_delivery_service_settings_object_check;
alter table public.business_profiles
  add constraint business_profiles_delivery_service_settings_object_check
  check (jsonb_typeof(delivery_service_settings) = 'object');

create or replace function public.set_business_catalog_experience_settings(
  p_business_id uuid,
  p_catalog_display_settings jsonb,
  p_delivery_service_settings jsonb,
  p_featured_item_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_business public.business_profiles%rowtype;
  v_catalog jsonb := coalesce(p_catalog_display_settings, '{}'::jsonb);
  v_delivery jsonb := coalesce(p_delivery_service_settings, '{}'::jsonb);
  v_featured jsonb := coalesce(p_featured_item_ids, '[]'::jsonb);
  v_value text;
  v_id uuid;
  v_max_quantity integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_business
  from public.business_profiles
  where id = p_business_id
  for update;

  if not found then raise exception 'business_not_found'; end if;
  if v_business.owner_user_id <> v_uid and not public.is_platform_admin(v_uid) then
    raise exception 'business_owner_required';
  end if;

  if jsonb_typeof(v_catalog) <> 'object' then raise exception 'invalid_catalog_settings'; end if;
  if jsonb_typeof(v_delivery) <> 'object' then raise exception 'invalid_delivery_settings'; end if;
  if jsonb_typeof(v_featured) <> 'array' or jsonb_array_length(v_featured) > 2 then
    raise exception 'invalid_featured_item_ids';
  end if;

  if coalesce(v_catalog->>'price_display', 'compact') not in ('compact','full','code') then
    raise exception 'invalid_price_display';
  end if;
  if coalesce(v_catalog->>'card_style', 'modern') not in ('modern','compact','visual') then
    raise exception 'invalid_card_style';
  end if;
  if coalesce(v_catalog->>'card_effect', 'spotlight') not in ('none','spotlight','glow') then
    raise exception 'invalid_card_effect';
  end if;

  begin
    v_max_quantity := coalesce((v_catalog->>'max_item_quantity')::integer, 20);
  exception when others then
    raise exception 'invalid_max_item_quantity';
  end;
  if v_max_quantity < 1 or v_max_quantity > 99 then raise exception 'invalid_max_item_quantity'; end if;

  if length(coalesce(v_catalog->>'add_button_label','')) > 40
     or length(coalesce(v_catalog->>'send_button_label','')) > 60
     or length(coalesce(v_catalog->>'whatsapp_message_intro','')) > 240
     or length(coalesce(v_catalog->>'missing_price_label','')) > 60
     or length(coalesce(v_catalog->>'featured_section_title','')) > 80 then
    raise exception 'catalog_text_too_long';
  end if;

  if jsonb_typeof(coalesce(v_delivery->'service_areas','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_delivery->'service_areas','[]'::jsonb)) > 30 then
    raise exception 'invalid_service_areas';
  end if;
  if jsonb_typeof(coalesce(v_delivery->'delivery_types','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_delivery->'delivery_types','[]'::jsonb)) > 12 then
    raise exception 'invalid_delivery_types';
  end if;
  if length(coalesce(v_delivery->>'pricing_note','')) > 240
     or length(coalesce(v_delivery->>'availability_note','')) > 240 then
    raise exception 'delivery_text_too_long';
  end if;

  for v_value in select jsonb_array_elements_text(v_featured)
  loop
    begin v_id := v_value::uuid;
    exception when invalid_text_representation then raise exception 'invalid_featured_item_id';
    end;
    if not exists (
      select 1 from public.business_catalog_items ci
      where ci.id = v_id and ci.business_id = p_business_id and ci.status = 'active'
    ) then raise exception 'featured_item_not_available'; end if;
  end loop;

  update public.business_profiles
  set catalog_display_settings = jsonb_build_object(
        'ordering_enabled', coalesce((v_catalog->>'ordering_enabled')::boolean, true),
        'add_button_label', coalesce(nullif(trim(v_catalog->>'add_button_label'),''), 'أضف للطلب'),
        'send_button_label', coalesce(nullif(trim(v_catalog->>'send_button_label'),''), 'إرسال الطلب عبر واتساب'),
        'whatsapp_message_intro', coalesce(nullif(trim(v_catalog->>'whatsapp_message_intro'),''), 'مرحبًا، أريد طلب العناصر التالية:'),
        'require_customer_name', coalesce((v_catalog->>'require_customer_name')::boolean, false),
        'require_address', coalesce((v_catalog->>'require_address')::boolean, false),
        'allow_item_notes', coalesce((v_catalog->>'allow_item_notes')::boolean, true),
        'show_total', coalesce((v_catalog->>'show_total')::boolean, true),
        'show_prices', coalesce((v_catalog->>'show_prices')::boolean, true),
        'show_direct_whatsapp', coalesce((v_catalog->>'show_direct_whatsapp')::boolean, false),
        'max_item_quantity', v_max_quantity,
        'price_display', coalesce(v_catalog->>'price_display','compact'),
        'missing_price_label', coalesce(nullif(trim(v_catalog->>'missing_price_label'),''), 'السعر عند الطلب'),
        'card_style', coalesce(v_catalog->>'card_style','modern'),
        'card_effect', coalesce(v_catalog->>'card_effect','spotlight'),
        'featured_section_title', nullif(trim(v_catalog->>'featured_section_title'),'')
      ),
      delivery_service_settings = jsonb_build_object(
        'is_delivery_provider', coalesce((v_delivery->>'is_delivery_provider')::boolean, false),
        'customer_delivery_enabled', coalesce((v_delivery->>'customer_delivery_enabled')::boolean, false),
        'service_areas', coalesce(v_delivery->'service_areas','[]'::jsonb),
        'delivery_types', coalesce(v_delivery->'delivery_types','[]'::jsonb),
        'pricing_note', nullif(trim(v_delivery->>'pricing_note'),''),
        'availability_note', nullif(trim(v_delivery->>'availability_note'),''),
        'share_order_total', coalesce((v_delivery->>'share_order_total')::boolean, true),
        'require_customer_address', coalesce((v_delivery->>'require_customer_address')::boolean, true),
        'require_privacy_consent', coalesce((v_delivery->>'require_privacy_consent')::boolean, true)
      ),
      featured_item_ids = v_featured,
      updated_at = now()
  where id = p_business_id
  returning * into v_business;

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business));
end;
$function$;

revoke all on function public.set_business_catalog_experience_settings(uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.set_business_catalog_experience_settings(uuid,jsonb,jsonb,jsonb) to authenticated, service_role;

create or replace function public.get_public_delivery_providers(
  p_governorate text default null,
  p_city text default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(provider order by verified_rank desc, name), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', bp.id,
      'name', bp.name,
      'slug', bp.slug,
      'display_tagline', bp.display_tagline,
      'description', bp.description,
      'governorate', bp.governorate,
      'city', bp.city,
      'whatsapp', bp.whatsapp,
      'logo_path', bp.logo_path,
      'profile_image_path', bp.profile_image_path,
      'verification_status', bp.verification_status,
      'service_areas', coalesce(bp.delivery_service_settings->'service_areas','[]'::jsonb),
      'delivery_types', coalesce(bp.delivery_service_settings->'delivery_types','[]'::jsonb),
      'pricing_note', bp.delivery_service_settings->>'pricing_note',
      'availability_note', bp.delivery_service_settings->>'availability_note'
    ) provider,
    bp.name,
    case when bp.verification_status = 'verified' then 1 else 0 end verified_rank
    from public.business_profiles bp
    where bp.public_status = 'published'
      and coalesce((bp.delivery_service_settings->>'is_delivery_provider')::boolean, false)
      and nullif(trim(coalesce(bp.whatsapp,'')), '') is not null
      and (nullif(trim(coalesce(p_governorate,'')), '') is null or bp.governorate = trim(p_governorate))
      and (nullif(trim(coalesce(p_city,'')), '') is null
        or bp.city = trim(p_city)
        or coalesce(bp.delivery_service_settings->'service_areas','[]'::jsonb) ? trim(p_city))
    order by verified_rank desc, bp.name
    limit greatest(1, least(coalesce(p_limit,30),50))
  ) q;
$function$;

revoke all on function public.get_public_delivery_providers(text,text,integer) from public;
grant execute on function public.get_public_delivery_providers(text,text,integer) to anon, authenticated, service_role;

comment on column public.business_profiles.catalog_display_settings is 'Public catalog cards, price, local cart, and WhatsApp request presentation settings.';
comment on column public.business_profiles.delivery_service_settings is 'Lightweight delivery-provider discovery and customer delivery request settings.';
comment on column public.business_profiles.featured_item_ids is 'Up to two active catalog item IDs highlighted on the public profile overview.';

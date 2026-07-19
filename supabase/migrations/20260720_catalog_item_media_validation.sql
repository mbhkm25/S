create or replace function public.upsert_business_catalog_item(
  p_business_id uuid,
  p_item_id uuid default null,
  p_item_type text default 'product',
  p_title text default null,
  p_description text default null,
  p_price numeric default null,
  p_currency text default null,
  p_image_paths jsonb default '[]'::jsonb,
  p_features jsonb default '[]'::jsonb,
  p_status text default 'active',
  p_display_order integer default 100,
  p_is_featured boolean default false,
  p_availability_status text default 'available',
  p_contact_action text default 'whatsapp'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.business_catalog_items%rowtype;
  v_active_count integer;
  v_path jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.business_profiles where id=p_business_id and owner_user_id=v_user_id) then
    raise exception 'business_owner_required';
  end if;
  if p_item_type not in ('product','service','digital','offer','subscription','other') then raise exception 'invalid_catalog_item_type'; end if;
  if p_status not in ('draft','active','hidden','archived') then raise exception 'invalid_catalog_item_status'; end if;
  if p_currency is not null and p_currency not in ('YER','SAR','USD') then raise exception 'invalid_currency'; end if;
  if p_availability_status not in ('available','on_request','unavailable') then raise exception 'invalid_availability_status'; end if;
  if p_contact_action not in ('whatsapp','call','none') then raise exception 'invalid_contact_action'; end if;
  if p_title is null or length(trim(p_title)) < 2 or length(trim(p_title)) > 120 then raise exception 'invalid_catalog_title'; end if;
  if p_description is not null and length(p_description) > 4000 then raise exception 'catalog_description_too_long'; end if;
  if p_price is not null and p_price < 0 then raise exception 'invalid_catalog_price'; end if;
  if coalesce(p_display_order,100) < 0 or coalesce(p_display_order,100) > 10000 then raise exception 'invalid_catalog_display_order'; end if;
  if jsonb_typeof(coalesce(p_image_paths,'[]'::jsonb)) <> 'array' then raise exception 'catalog_image_paths_must_be_array'; end if;
  if jsonb_array_length(coalesce(p_image_paths,'[]'::jsonb)) > 6 then raise exception 'catalog_image_limit_exceeded'; end if;
  for v_path in select value from jsonb_array_elements(coalesce(p_image_paths,'[]'::jsonb)) loop
    if jsonb_typeof(v_path) <> 'string' then raise exception 'catalog_image_path_must_be_string'; end if;
    perform private.assert_business_media_path(p_business_id, v_path #>> '{}', array['catalog','products'], true);
  end loop;
  if p_status='active' then
    select count(*) into v_active_count from public.business_catalog_items
    where business_id=p_business_id and status='active' and (p_item_id is null or id<>p_item_id);
    if v_active_count>=10 then raise exception 'active_catalog_limit_reached'; end if;
  end if;
  if p_item_id is null then
    insert into public.business_catalog_items(
      business_id,created_by_user_id,item_type,title,description,price,currency,image_paths,features,status,display_order,is_featured,availability_status,contact_action
    ) values (
      p_business_id,v_user_id,p_item_type,trim(p_title),nullif(trim(coalesce(p_description,'')),''),p_price,p_currency,
      coalesce(p_image_paths,'[]'::jsonb),coalesce(p_features,'[]'::jsonb),p_status,coalesce(p_display_order,100),
      coalesce(p_is_featured,false),p_availability_status,p_contact_action
    ) returning * into v_item;
  else
    update public.business_catalog_items set
      item_type=p_item_type,title=trim(p_title),description=nullif(trim(coalesce(p_description,'')),''),price=p_price,currency=p_currency,
      image_paths=coalesce(p_image_paths,image_paths),features=coalesce(p_features,features),status=p_status,
      display_order=coalesce(p_display_order,display_order),is_featured=coalesce(p_is_featured,false),
      availability_status=p_availability_status,contact_action=p_contact_action,updated_at=now()
    where id=p_item_id and business_id=p_business_id returning * into v_item;
    if not found then raise exception 'catalog_item_not_found'; end if;
  end if;
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$function$;

revoke all on function public.upsert_business_catalog_item(uuid,uuid,text,text,text,numeric,text,jsonb,jsonb,text,integer,boolean,text,text) from public, anon;
grant execute on function public.upsert_business_catalog_item(uuid,uuid,text,text,text,numeric,text,jsonb,jsonb,text,integer,boolean,text,text) to authenticated;

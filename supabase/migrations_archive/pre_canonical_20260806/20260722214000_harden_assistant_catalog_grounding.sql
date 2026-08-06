-- Keep assistant catalog media bounded and identical to public community visibility.
create or replace function public.search_sanad_assistant_knowledge(
  p_query text default null, p_governorate text default null, p_limit integer default 5
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_query text:=nullif(trim(coalesce(p_query,'')),''); v_limit integer:=greatest(1,least(coalesce(p_limit,5),10));
declare v_governorate text:=nullif(trim(coalesce(p_governorate,'')),'');
declare v_directory jsonb; v_faq jsonb;
begin
  v_faq:=public.get_public_sanad_faq(null,v_query);
  v_directory:=public.get_public_business_directory(v_query,null,v_governorate,v_limit,0);
  return jsonb_build_object(
    'faq',coalesce(v_faq->'items','[]'::jsonb),
    'directory',v_directory,
    'catalog_media',coalesce((select jsonb_agg(q.item order by q.is_featured desc,q.created_at desc) from (
      select jsonb_build_object(
        'item_id',ci.id,'business_id',bp.id,'business_name',bp.name,'business_slug',bp.slug,
        'title',ci.title,'description',ci.description,'price',ci.price,'currency',ci.currency,
        'availability_status',ci.availability_status,'image_path',ci.image_paths->>0,
        'public_url','https://app.sanadflow.com/b/'||bp.slug,
        'whatsapp',bp.whatsapp,'governorate',bp.governorate,'city',bp.city,
        'verification_status',bp.verification_status
      ) item, ci.is_featured, ci.created_at
      from public.business_catalog_items ci
      join public.business_profiles bp on bp.id=ci.business_id
      join public.business_community_settings s on s.singleton=true
      where s.phase not in ('prelaunch','maintenance')
        and bp.public_status='published' and ci.status='active'
        and (s.phase <> 'early_access' or bp.verification_status='verified')
        and (cardinality(s.enabled_governorates)=0 or bp.governorate=any(s.enabled_governorates))
        and (s.phase <> 'early_access' or bp.category_id in (
          select x.category_id from public.business_profiles x
          where x.public_status='published' and x.verification_status='verified' and x.category_id is not null
            and (cardinality(s.enabled_governorates)=0 or x.governorate=any(s.enabled_governorates))
          group by x.category_id having count(*)>=s.minimum_category_size
        ))
        and jsonb_typeof(ci.image_paths)='array' and jsonb_array_length(ci.image_paths)>0
        and (v_query is null or ci.title ilike '%'||v_query||'%' or ci.description ilike '%'||v_query||'%' or bp.name ilike '%'||v_query||'%')
        and (v_governorate is null or bp.governorate=v_governorate)
      order by ci.is_featured desc,ci.created_at desc
      limit v_limit
    ) q),'[]'::jsonb),
    'generated_at',now()
  );
end; $$;

revoke all on function public.search_sanad_assistant_knowledge(text,text,integer) from public,anon,authenticated;
grant execute on function public.search_sanad_assistant_knowledge(text,text,integer) to service_role;

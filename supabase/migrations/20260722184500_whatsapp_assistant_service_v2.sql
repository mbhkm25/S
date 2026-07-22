-- SANAD WhatsApp assistant service architecture v2
-- Adds intent-aware grounding, official support context, and broader FAQ recall.

create or replace function public.search_sanad_assistant_knowledge(
  p_query text default null,
  p_governorate text default null,
  p_limit integer default 5,
  p_intent text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_governorate text := nullif(trim(coalesce(p_governorate, '')), '');
  v_intent text := nullif(trim(coalesce(p_intent, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_category text;
  v_faq jsonb;
  v_directory jsonb;
  v_info public.app_public_information%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_terms text[];
begin
  v_category := case v_intent
    when 'support' then 'support'
    when 'business_search' then 'business'
    when 'catalog_search' then 'business'
    when 'business_details' then 'business'
    else null
  end;

  select * into v_info
  from public.app_public_information
  where singleton = true;

  select * into v_plan
  from public.subscription_plans
  where code = 'sanad_pro' and is_active = true
  limit 1;

  v_terms := array(
    select distinct term
    from unnest(regexp_split_to_array(lower(coalesce(v_query, '')), E'\\s+')) term
    where char_length(term) >= 2
      and term not in ('في','من','على','عن','إلى','الى','ما','هو','هي','هل','لي','يا','كم','كيف','اريد','أريد')
    limit 8
  );

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(item order by score desc, display_order asc), '[]'::jsonb),
    'generated_at', now()
  )
  into v_faq
  from (
    select jsonb_build_object(
      'slug', f.slug,
      'category', f.category,
      'category_label', case f.category
        when 'about' then 'عن سند'
        when 'verification' then 'التحقق المالي'
        when 'account' then 'الحساب والخصوصية'
        when 'subscription' then 'سند برو'
        when 'business' then 'مجتمع الأعمال'
        else 'الدعم'
      end,
      'question', f.question,
      'answer', case
        when f.slug = 'pro-current-plan' and v_plan.code is not null then format(
          'باقة %s الحالية سعرها %s %s، ومدتها %s يومًا، وتتيح حتى %s عملية خلال مدة الاشتراك. تظهر هذه القيم للمستخدم قبل إرسال طلب الاشتراك.',
          v_plan.display_name, v_plan.monthly_price_yer, v_plan.currency_code,
          v_plan.billing_duration_days, v_plan.monthly_access_limit)
        when f.slug = 'support-contact' and v_info.singleton then concat_ws(' ',
          'يمكن التواصل مع دعم سند عبر واتساب', nullif(v_info.support_whatsapp,''),
          'أو عبر البريد', nullif(v_info.support_email,''),
          case when nullif(v_info.support_days_text,'') is not null then 'خلال ' || v_info.support_days_text else null end,
          case when nullif(v_info.support_hours_text,'') is not null then 'من ' || v_info.support_hours_text else null end,
          case when nullif(v_info.support_response_time_text,'') is not null then 'والاستجابة المتوقعة ' || v_info.support_response_time_text || '.' else null end)
        else f.answer
      end,
      'keywords', to_jsonb(f.keywords),
      'display_order', f.display_order
    ) as item,
    f.display_order,
    (
      case when v_category is not null and f.category = v_category then 40 else 0 end +
      case when v_intent = 'faq' and f.category in ('about','account','subscription','verification') then 12 else 0 end +
      case when v_intent = 'greeting' and f.category = 'about' then 20 else 0 end +
      case when v_query is not null and (f.question ilike '%' || v_query || '%' or f.answer ilike '%' || v_query || '%') then 80 else 0 end +
      coalesce((select count(*) * 14 from unnest(v_terms) t
        where f.question ilike '%' || t || '%'
           or f.answer ilike '%' || t || '%'
           or exists (select 1 from unnest(f.keywords) k where k ilike '%' || t || '%')), 0)
    ) as score
    from public.sanad_public_faq_entries f
    where f.status = 'published'
      and (v_category is null or f.category = v_category or v_intent in ('faq','greeting','unknown'))
    order by score desc, f.display_order asc
    limit greatest(v_limit, 6)
  ) ranked;

  if v_intent in ('business_search','catalog_search','business_details') then
    v_directory := public.get_public_business_directory(v_query, null, v_governorate, v_limit, 0);
  else
    v_directory := jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'phase', (select phase from public.business_community_settings where singleton = true),
      'registration_open', (select registration_open from public.business_community_settings where singleton = true)
    );
  end if;

  return jsonb_build_object(
    'official_info', jsonb_build_object(
      'about_short', v_info.about_short,
      'about_financial', v_info.about_financial,
      'about_business', v_info.about_business,
      'vision', v_info.vision_text,
      'country', v_info.country,
      'governorate', v_info.governorate,
      'city', v_info.city,
      'launch_year', v_info.launch_year,
      'support_whatsapp', v_info.support_whatsapp,
      'support_phone', v_info.support_phone,
      'support_email', v_info.support_email,
      'support_website', v_info.support_website,
      'support_days', v_info.support_days_text,
      'support_hours', v_info.support_hours_text,
      'support_response_time', v_info.support_response_time_text,
      'install_url', 'https://app.sanadflow.com/install/',
      'app_url', 'https://app.sanadflow.com/'
    ),
    'faq', coalesce(v_faq->'items', '[]'::jsonb),
    'directory', v_directory,
    'catalog_media', coalesce((
      select jsonb_agg(q.item order by q.is_featured desc, q.created_at desc)
      from (
        select jsonb_build_object(
          'item_id', ci.id,
          'business_id', bp.id,
          'business_name', bp.name,
          'business_slug', bp.slug,
          'title', ci.title,
          'description', ci.description,
          'price', ci.price,
          'currency', ci.currency,
          'availability_status', ci.availability_status,
          'image_path', ci.image_paths->>0,
          'public_url', 'https://app.sanadflow.com/b/' || bp.slug,
          'whatsapp', bp.whatsapp,
          'governorate', bp.governorate,
          'city', bp.city,
          'verification_status', bp.verification_status
        ) item,
        ci.is_featured,
        ci.created_at
        from public.business_catalog_items ci
        join public.business_profiles bp on bp.id = ci.business_id
        join public.business_community_settings s on s.singleton = true
        where v_intent in ('business_search','catalog_search','business_details')
          and s.phase not in ('prelaunch','maintenance')
          and bp.public_status = 'published'
          and ci.status = 'active'
          and (s.phase <> 'early_access' or bp.verification_status = 'verified')
          and (cardinality(s.enabled_governorates) = 0 or bp.governorate = any(s.enabled_governorates))
          and jsonb_typeof(ci.image_paths) = 'array'
          and jsonb_array_length(ci.image_paths) > 0
          and (v_query is null or ci.title ilike '%' || v_query || '%' or ci.description ilike '%' || v_query || '%' or bp.name ilike '%' || v_query || '%')
          and (v_governorate is null or bp.governorate = v_governorate)
        order by ci.is_featured desc, ci.created_at desc
        limit v_limit
      ) q
    ), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

-- Preserve compatibility for callers that still use the original three-argument signature.
create or replace function public.search_sanad_assistant_knowledge(
  p_query text default null,
  p_governorate text default null,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.search_sanad_assistant_knowledge(p_query, p_governorate, p_limit, null);
$$;

revoke all on function public.search_sanad_assistant_knowledge(text,text,integer,text) from public, anon, authenticated;
grant execute on function public.search_sanad_assistant_knowledge(text,text,integer,text) to service_role;
revoke all on function public.search_sanad_assistant_knowledge(text,text,integer) from public, anon, authenticated;
grant execute on function public.search_sanad_assistant_knowledge(text,text,integer) to service_role;

update public.sanad_assistant_settings
set prompt_version = 'sanad-service-ar-v2', updated_at = now()
where singleton = true;

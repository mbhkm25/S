begin;

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
  v_base jsonb;
  v_query text := trim(coalesce(p_query,''));
  v_operation_like boolean;
  v_reference_url text;
  v_source_code text;
  v_skms jsonb := '[]'::jsonb;
  v_knowledge_intent text;
begin
  v_base := public.search_sanad_assistant_knowledge_base_v5(p_query,p_governorate,p_limit,p_intent);
  v_operation_like := v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    or v_query ~ '(عملية|العملية|راجعها|مراجعة|إشعار مالي)';

  v_reference_url := nullif(lower(regexp_replace(
    substring(v_query from '(https?://[^[:space:]<>]+)'),
    '[،,.!?]+$', '', 'g'
  )), '');
  v_source_code := nullif(upper(substring(v_query from '([A-Za-z]{2,12}-[A-Za-z0-9_-]{3,80})')), '');

  v_knowledge_intent := case
    when v_query ~ '(تثبيت|تنزيل|تحميل).*(سند|التطبيق)|((سند|التطبيق).*(تثبيت|تنزيل|تحميل))' then 'install_app'
    when v_query ~ '(منشور|إعلان|فيسبوك|انستغرام|إنستغرام|ريل|ستوري|حملة)' or v_reference_url is not null then 'digital_content'
    else nullif(p_intent,'')
  end;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.authority_level asc, r.updated_at desc), '[]'::jsonb)
  into v_skms
  from (
    select
      s.id as source_id,
      s.source_code,
      s.source_type,
      s.title,
      s.description,
      s.knowledge_scope,
      s.authority_level,
      s.updated_at,
      u.id as unit_id,
      u.heading,
      u.content,
      u.summary,
      u.intent_tags,
      u.audience_tags,
      u.channel_tags,
      dc.platform,
      dc.content_type,
      dc.assistant_context,
      dc.primary_cta_type,
      dc.primary_cta_label,
      dc.primary_cta_url,
      greatest(
        case when v_source_code is not null and upper(s.source_code)=v_source_code then 1000 else 0 end,
        case when v_reference_url is not null and exists (
          select 1 from public.sanad_knowledge_references kr
          where kr.source_id=s.id and kr.normalized_url=regexp_replace(v_reference_url,'[?#].*$','','g')
        ) then 950 else 0 end,
        ts_rank_cd(u.search_vector, websearch_to_tsquery('simple', coalesce(nullif(v_query,''),'سند'))) * 100
          + case when v_knowledge_intent is not null and v_knowledge_intent=any(u.intent_tags) then 60 else 0 end
          + case when 'whatsapp'=any(u.channel_tags) then 15 else 0 end
          + (6-s.authority_level)*8
      ) as score
    from public.sanad_knowledge_sources s
    join public.sanad_knowledge_units u on u.source_id=s.id and u.status='active'
    left join public.sanad_digital_content dc on dc.source_id=s.id
    where s.status='published'
      and s.visibility in ('assistant_public','assistant_authenticated')
      and (s.effective_from is null or s.effective_from<=now())
      and (s.expires_at is null or s.expires_at>now())
      and (u.effective_from is null or u.effective_from<=now())
      and (u.expires_at is null or u.expires_at>now())
      and (
        (v_source_code is not null and upper(s.source_code)=v_source_code)
        or (v_reference_url is not null and exists (
          select 1 from public.sanad_knowledge_references kr
          where kr.source_id=s.id and kr.normalized_url=regexp_replace(v_reference_url,'[?#].*$','','g')
        ))
        or (v_query<>'' and (
          u.search_vector @@ websearch_to_tsquery('simple',v_query)
          or u.content ilike '%'||v_query||'%'
          or coalesce(u.heading,'') ilike '%'||v_query||'%'
        ))
        or (v_knowledge_intent is not null and v_knowledge_intent=any(u.intent_tags))
      )
    order by score desc,s.authority_level asc,s.updated_at desc
    limit greatest(1,least(coalesce(p_limit,5),8))
  ) r;

  v_base := v_base || jsonb_build_object(
    'knowledge_management', jsonb_build_object(
      'detected_intent', v_knowledge_intent,
      'detected_reference_url', v_reference_url,
      'detected_source_code', v_source_code,
      'items', v_skms,
      'policy', jsonb_build_object(
        'instruction', 'استخدم هذه المصادر المعتمدة قبل المحتوى العام عندما تكون ذات صلة. لا تقل إنك فتحت رابط منصة اجتماعية؛ قل إنك وجدت المحتوى ضمن مصادر سند الرسمية. إذا لم توجد نتيجة موثوقة لرابط أو منشور، اطلب من المستخدم توضيح الموضوع أو إرسال صورة المنشور.',
        'authority_rule', 'المصدر ذو authority_level الأقل أعلى سلطة، والمصدر المنشور فقط صالح للإجابة.'
      )
    )
  );

  if v_knowledge_intent='install_app' and jsonb_array_length(v_skms)>0 then
    v_base := v_base || jsonb_build_object(
      'direct_response_guidance', jsonb_build_object(
        'priority','high',
        'instruction','أعط المستخدم رابط التثبيت الرسمي أولًا، ثم تعليمات Android وiPhone باختصار. نبّه أن فتح الرابط من متصفح داخلي قد يتطلب اختيار Chrome أو Safari. لا تسأل عن نوع الجهاز قبل إعطاء الرابط.',
        'required_source_code','OFFICIAL-INSTALL-GUIDE-001'
      )
    );
  end if;

  if v_operation_like then
    return v_base || jsonb_build_object(
      'operation_assistance', jsonb_build_object(
        'instruction', 'تعامل مع الطلب كمتابعة لمراجعة عملية مالية. ابحث أولًا في سياق عمليات المستخدم المرفق مع الذاكرة عن معرف مطابق. إذا وجدته، لخّص حالة العملية والمبلغ والعملة والجهة ومستوى المخاطر والتحذيرات والنواقص، ثم اسأل سؤالًا واحدًا عن المشكلة المحددة إذا لزم. لا تعُد لتعريف سند، ولا تقترح تنزيل التطبيق، ولا تحِل إلى الدعم قبل تقديم القراءة المتاحة.',
        'response_order', jsonb_build_array('تأكيد العثور على العملية','ملخص البيانات','المؤشرات أو التحذيرات','الخطوة التالية'),
        'avoid', jsonb_build_array('إعادة الترحيب','الحديث العام عن خدمات سند','إرسال رابط التثبيت','الإحالة المباشرة إلى الدعم')
      )
    );
  end if;

  return v_base;
end;
$$;

revoke all on function public.search_sanad_assistant_knowledge(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.search_sanad_assistant_knowledge(text,text,integer,text) to service_role;

notify pgrst,'reload schema';
commit;

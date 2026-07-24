-- Add a conversation playbook to assistant grounding without changing the worker contract.
do $$
begin
  if to_regprocedure('public.search_sanad_assistant_knowledge_base_v2(text,text,integer,text)') is null then
    alter function public.search_sanad_assistant_knowledge(text,text,integer,text)
      rename to search_sanad_assistant_knowledge_base_v2;
  end if;
end $$;

create or replace function public.search_sanad_assistant_knowledge(
  p_query text default null,
  p_governorate text default null,
  p_limit integer default 5,
  p_intent text default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_base jsonb;
  v_intent text := nullif(trim(coalesce(p_intent, '')), '');
  v_items_count integer := 0;
  v_instruction text;
  v_goal text;
  v_topics jsonb;
begin
  v_base := public.search_sanad_assistant_knowledge_base_v2(p_query,p_governorate,p_limit,p_intent);
  v_items_count := coalesce(jsonb_array_length(coalesce(v_base #> '{directory,items}','[]'::jsonb)),0);

  v_goal := case v_intent
    when 'greeting' then 'بدء حوار خدمي طبيعي وتحديد ما يريد المستخدم إنجازه.'
    when 'faq' then 'الإجابة المباشرة ثم فتح مسار منطقي لمعلومة تالية مفيدة.'
    when 'support' then 'حل المشكلة أو جمع الحد الأدنى اللازم لتوجيهها.'
    when 'business_search' then 'الوصول إلى نتيجة بحث مفيدة عبر سؤال متابعة واحد عند الحاجة.'
    when 'catalog_search' then 'فهم المنتج والموقع أو السعر بأقل عدد من الأسئلة.'
    when 'memory' then 'شرح ما يتم تذكره وكيف يفيد الخدمة بشفافية.'
    else 'فهم المطلوب بدقة قبل تقديم جواب عام.' end;

  v_instruction := case v_intent
    when 'greeting' then 'رحّب باختصار، ثم اعرض 3 مسارات عملية: التحقق من إشعار مالي، معرفة خدمات أو اشتراك سند، أو البحث عن نشاط أو منتج. اختم بسؤال واحد عما يريد المستخدم إنجازه الآن.'
    when 'faq' then 'أجب عن السؤال كاملًا، ثم أضف معلومة مجاورة مفيدة أو سؤال متابعة واحد فقط. لا تكتفِ بتعريف مقتضب إذا كانت هناك خطوة عملية أو رابط رسمي يفيد المستخدم.'
    when 'support' then 'قدم قناة الدعم الفعلية، ثم اسأل عن وصف المشكلة أو الخطوة التي توقف عندها المستخدم إن لم يذكرها. لا تكتفِ بإرسال الرقم.'
    when 'business_search' then case when v_items_count > 0
      then 'اعرض أفضل النتائج مع سبب ملاءمتها، ثم اسأل إن كان المستخدم يريد مقارنة الأسعار أو الأقرب حسب المدينة.'
      else 'اذكر أنك بحثت في الأنشطة المنشورة حاليًا ولم تجد نتيجة مؤكدة. لا تكرر فقط أن المجتمع قيد التجهيز، ولا تعد بإبلاغه مستقبلًا. اسأل سؤالًا واحدًا مفيدًا لتضييق أو توسيع البحث، مثل المدينة أو الفئة أو البحث باسم المنتج.' end
    when 'catalog_search' then 'إن لم توجد نتيجة، اسأل عن أكثر معلومة تأثيرًا فقط: نوع المنتج أو الحجم أو النطاق السعري أو المدينة. إن وجدت نتائج، اعرض حتى 3 خيارات وساعد في المقارنة.'
    when 'memory' then 'بيّن ما تم تذكره وكيف يفيد الخدمة، وذكّر بإمكانية حذف أي تفضيل دون إطالة.'
    else 'لخّص فهمك للطلب، ثم اسأل سؤال توضيح واحدًا محددًا بدل طرح عدة أسئلة.' end;

  v_topics := case v_intent
    when 'greeting' then jsonb_build_array('التحقق من إشعار مالي','التسجيل والباقات','البحث عن نشاط أو منتج')
    when 'faq' then jsonb_build_array('الخطوة التالية داخل التطبيق','الخدمة المرتبطة بالسؤال','الرابط الرسمي عند توفره')
    when 'business_search' then jsonb_build_array('توسيع النطاق الجغرافي','البحث باسم المنتج','اختيار فئة قريبة')
    when 'support' then jsonb_build_array('وصف المشكلة','الخطوة التي توقف عندها','الوقت التقريبي للمشكلة')
    else jsonb_build_array('توضيح الهدف','تحديد الموقع','تحديد الخيار الأنسب') end;

  return v_base || jsonb_build_object('conversation_playbook',jsonb_build_object(
    'service_style',jsonb_build_array(
      'تعامل مع الرسالة باعتبارها جزءًا من محادثة مستمرة، ولا تعُد إلى مقدمة التعريف في كل رد.',
      'ابدأ بالنتيجة أو المعلومة الأهم، ثم أضف فائدة استباقية قصيرة تساعد المستخدم على الخطوة التالية.',
      'استخدم سؤال متابعة واحدًا فقط عندما سيجعل الإجابة أو البحث أدق.',
      'لا تستخدم لغة بوتية جامدة، ولا تكرر أهلًا بك أو أنا سند داخل المحادثة إلا في أول تحية فعلية.',
      'لا تعد المستخدم بإبلاغه مستقبلًا ما لم توجد آلية إشعار حقيقية ومفعلة.',
      'استفد من الرسائل السابقة والذاكرة، ولا تطلب معلومة سبق أن ذكرها المستخدم.'),
    'response_structure',jsonb_build_array('إجابة مباشرة ومحددة.','قيمة إضافية استباقية مرتبطة بالطلب.','سؤال متابعة واحد عند الحاجة فقط.'),
    'goal',v_goal,
    'instruction',v_instruction,
    'results_count',v_items_count,
    'proactive_topics',v_topics));
end; $$;

revoke all on function public.search_sanad_assistant_knowledge(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.search_sanad_assistant_knowledge(text,text,integer,text) to service_role;

update public.sanad_assistant_settings
set temperature=0.38,
    recent_messages_limit=20,
    prompt_version='sanad-service-ar-v3',
    updated_at=now()
where singleton=true;

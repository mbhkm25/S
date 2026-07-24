-- SANAD assistant V4: official emoji use, WhatsApp emphasis, and maximum recent context.
-- This migration builds on 20260722181500_assistant_conversation_guidance_v3.sql.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.search_sanad_assistant_knowledge(text,text,integer,text)'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    '''استفد من الرسائل السابقة والذاكرة، ولا تطلب معلومة سبق أن ذكرها المستخدم.''',
    '''استفد من الرسائل السابقة والذاكرة، ولا تطلب معلومة سبق أن ذكرها المستخدم.'',
        ''استخدم من 0 إلى 2 إيموجي رسمي مناسب فقط في الرد الواحد، ولا تستخدم الإيموجيات الزخرفية أو المتكررة.'',
        ''استخدم تنسيق واتساب لتعريض الكلمات المهمة بوضع نجمة واحدة قبل النص وبعده، مثل *سند برو* أو *967777634971*.'',
        ''لا تضع نجومًا حول جملة كاملة، ولا تكثر من التعريض؛ ميّز فقط الاسم أو السعر أو الرقم أو الخطوة الحاسمة.'',
        ''لا تستخدم Markdown المعقد أو العناوين بعلامة # أو الجداول؛ استخدم أسطرًا قصيرة ونقاطًا بسيطة عند الحاجة.'''
  );

  v_definition := replace(
    v_definition,
    '''إجابة مباشرة ومحددة.'',
        ''قيمة إضافية استباقية مرتبطة بالطلب.''',
    '''إجابة مباشرة ومحددة.'',
        ''تمييز بصري محدود للمعلومة الأهم.'',
        ''قيمة إضافية استباقية مرتبطة بالطلب.'''
  );

  v_definition := replace(
    v_definition,
    '''conversation_playbook'', jsonb_build_object(',
    '''conversation_playbook'', jsonb_build_object(
      ''whatsapp_formatting'', jsonb_build_object(
        ''bold_syntax'', ''*النص المهم*'',
        ''max_bold_segments'', 4,
        ''emoji_min'', 0,
        ''emoji_max'', 2,
        ''allowed_examples'', jsonb_build_array(''👋'',''✅'',''📌'',''🔎'',''💬'',''📱'',''🛡️'',''📍''),
        ''avoid'', jsonb_build_array(''التكرار'',''الإيموجيات الهزلية'',''تعريض فقرات كاملة'',''استخدام الشرطتين بدل نجمة واتساب'')
      ),'
  );

  execute v_definition;
end;
$$;

update public.sanad_assistant_settings
set recent_messages_limit = 30,
    temperature = 0.40,
    prompt_version = 'sanad-service-ar-v4',
    updated_at = now()
where singleton = true;

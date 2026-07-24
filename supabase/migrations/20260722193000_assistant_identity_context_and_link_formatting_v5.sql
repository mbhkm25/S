-- SANAD assistant V5: personalize responses from the linked Sanad account and harden WhatsApp link formatting.

create or replace function public.claim_sanad_assistant_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_result jsonb;
  v_user_context jsonb := '[]'::jsonb;
  v_linked_user_id uuid;
  v_profile public.profiles%rowtype;
  v_active_subscription jsonb;
  v_owned_businesses jsonb;
  v_submitted_count integer := 0;
  v_verified_count integer := 0;
begin
  with candidate as (
    select id from public.sanad_assistant_messages
    where id = p_message_id and direction = 'inbound'
      and status in ('queued','failed') and next_attempt_at <= now() and attempt_count < 5
    for update skip locked
  ), claimed as (
    update public.sanad_assistant_messages m
    set status='processing', attempt_count=m.attempt_count+1,
        processing_started_at=now(), updated_at=now(), error_code=null, error_message=null
    from candidate c where m.id=c.id returning m.*
  )
  select c.id, to_jsonb(c) into v_id, v_result from claimed c;

  if v_id is null then return null; end if;

  select wc.linked_user_id into v_linked_user_id
  from public.sanad_whatsapp_contacts wc
  where wc.id=(v_result->>'contact_id')::uuid;

  if v_linked_user_id is not null then
    select * into v_profile from public.profiles p where p.id=v_linked_user_id;

    select jsonb_build_object(
      'plan_code',us.plan_code,'status',us.status,
      'current_period_start',us.current_period_start,'current_period_end',us.current_period_end)
    into v_active_subscription
    from public.user_subscriptions us
    where us.user_id=v_linked_user_id and us.status='active'
    order by us.updated_at desc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name',bp.name,'public_status',bp.public_status,
      'verification_status',bp.verification_status,'slug',bp.slug)
      order by bp.updated_at desc),'[]'::jsonb)
    into v_owned_businesses
    from public.business_profiles bp where bp.owner_user_id=v_linked_user_id;

    select count(*) into v_submitted_count from public.operations o where o.submitted_by_user_id=v_linked_user_id;
    select count(*) into v_verified_count from public.operations o where o.verified_by_user_id=v_linked_user_id;

    v_user_context := jsonb_build_array(
      jsonb_build_object(
        'key','sanad_account_relationship','category','system_context','source','sanad_account',
        'value',concat_ws('؛ ',
          case when nullif(trim(v_profile.full_name),'') is not null then 'اسم المستخدم المسجل: '||v_profile.full_name else null end,
          'لديه حساب سند مرتبط ومؤكد بهذا الرقم',
          case when v_profile.status is not null then 'حالة الحساب: '||v_profile.status else null end,
          case when v_profile.phone_verification_status is not null then 'حالة توثيق الرقم: '||v_profile.phone_verification_status else null end,
          case when v_profile.governorate is not null then 'المحافظة: '||v_profile.governorate else null end,
          case when v_profile.profile_completed_at is not null then 'الملف الشخصي مكتمل' else 'الملف الشخصي غير مكتمل' end),
        'usage_policy','استخدم الاسم الأول طبيعيًا عند ملاءمة السياق، ولا تطلب منه التسجيل أو تثبيت التطبيق بوصفه مستخدمًا جديدًا. لا تكشف معرفات داخلية أو بيانات حساسة.'),
      jsonb_build_object(
        'key','sanad_subscription_context','category','system_context','source','sanad_subscription',
        'value',case when v_active_subscription is not null
          then 'لدى المستخدم اشتراك نشط: '||coalesce(v_active_subscription->>'plan_code','')||'؛ ينتهي في: '||coalesce(v_active_subscription->>'current_period_end','غير محدد')
          else 'لا يوجد اشتراك مدفوع نشط ظاهر حاليًا' end,
        'usage_policy','لا تعرض تفاصيل الاشتراك دون صلة بالسؤال، لكن استخدمها لتجنب اقتراح الاشتراك إذا كان مشتركًا بالفعل.'),
      jsonb_build_object(
        'key','sanad_activity_context','category','system_context','source','sanad_activity',
        'value','عدد العمليات التي أرسلها المستخدم: '||v_submitted_count||'؛ وعدد العمليات التي تحقق منها: '||v_verified_count,
        'usage_policy','استخدم هذه المؤشرات فقط لتقديم مساعدة عملية مرتبطة بالسؤال، ولا تصفها كتقييم أو حكم على المستخدم.'),
      jsonb_build_object(
        'key','sanad_business_relationship','category','system_context','source','sanad_business',
        'value',case when jsonb_array_length(v_owned_businesses)>0
          then 'الأنشطة التي يملكها المستخدم في سند: '||v_owned_businesses::text
          else 'لا يظهر أن المستخدم يملك نشاطًا تجاريًا في سند حاليًا' end,
        'usage_policy','عند سؤاله عن نشاطه تحدث بصيغة الملكية: نشاطك، ولا تطلب منه إنشاء نشاط جديد إذا كان لديه نشاط قائم.')
    );
  end if;

  return v_result || jsonb_build_object(
    'contact',(select jsonb_build_object(
      'phone',wc.phone_normalized,'wa_id',wc.wa_id,'display_name',wc.display_name,
      'linked_user_id',wc.linked_user_id,'registration_status',wc.registration_status,
      'onboarding_status',wc.onboarding_status)
      from public.sanad_whatsapp_contacts wc where wc.id=(v_result->>'contact_id')::uuid),
    'conversation',(select to_jsonb(sc) from public.sanad_assistant_conversations sc where sc.id=(v_result->>'conversation_id')::uuid),
    'settings',(select to_jsonb(s)-'updated_by_user_id' from public.sanad_assistant_settings s where singleton=true),
    'memories',coalesce((select jsonb_agg(jsonb_build_object(
      'key',memory_key,'category',category,'value',value_text,'confidence',confidence,'source','assistant_memory')
      order by updated_at desc)
      from public.sanad_assistant_memories
      where conversation_id=(v_result->>'conversation_id')::uuid and status='active'
        and (expires_at is null or expires_at>now())),'[]'::jsonb) || v_user_context,
    'recent_messages',coalesce((select jsonb_agg(x.item order by x.created_at) from (
      select jsonb_build_object('direction',direction,'type',message_type,
        'text',coalesce(transcript,body_text),'intent',intent,'created_at',created_at) item,created_at
      from public.sanad_assistant_messages
      where conversation_id=(v_result->>'conversation_id')::uuid and id<>p_message_id and status='completed'
      order by created_at desc
      limit (select recent_messages_limit from public.sanad_assistant_settings where singleton=true)
    ) x),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.claim_sanad_assistant_message(uuid) from public,anon,authenticated;
grant execute on function public.claim_sanad_assistant_message(uuid) to service_role;

create or replace function public.search_sanad_assistant_knowledge(
  p_query text default null,p_governorate text default null,p_limit integer default 5,p_intent text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb; v_playbook jsonb;
begin
  v_base:=public.search_sanad_assistant_knowledge_conversation_v3(p_query,p_governorate,p_limit,p_intent);
  v_playbook:=coalesce(v_base->'conversation_playbook','{}'::jsonb);
  return jsonb_set(v_base,'{conversation_playbook}',v_playbook||jsonb_build_object(
    'identity_awareness',jsonb_build_array(
      'اعتمد على سياق حساب المستخدم المرفق في الذاكرة النظامية قبل تقديم أي اقتراح.',
      'إذا كان المستخدم مسجلًا فلا تطلب منه إنشاء حساب، وإذا كان مشتركًا فلا تعرض الاشتراك كأنه غير مشترك.',
      'استخدم الاسم الأول باعتدال وبشكل طبيعي، خصوصًا في التحية أو عند تأكيد إجراء شخصي.',
      'ميّز بين مستخدم عادي، مشترك، صاحب نشاط، وعضو إدارة بحسب السياق المتاح.',
      'لا تعرض بيانات شخصية أو سجلًا داخليًا من تلقاء نفسك إلا إذا كان مفيدًا مباشرة للسؤال.'),
    'link_formatting',jsonb_build_array(
      'اكتب الرابط بصورته الخام الكاملة مثل https://app.sanadflow.com/install/ دون أقواس أو صيغة Markdown.',
      'لا تضع الرابط بين نجمتين، ولا تضع نجمة منفردة قبله أو بعده.',
      'ضع وصف الرابط في سطر، ثم الرابط نفسه في سطر مستقل عند الحاجة.',
      'استخدم نجمة واتساب فقط لتعريض عبارة قصيرة مكتملة مثل *رابط التثبيت*، وليس لتعريض الرابط نفسه.',
      'راجع الرد قبل الإرسال وتأكد من عدم وجود نجمة منفردة أو رابط مقطوع.')),true);
end;$$;

revoke all on function public.search_sanad_assistant_knowledge(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.search_sanad_assistant_knowledge(text,text,integer,text) to service_role;

update public.sanad_assistant_settings
set prompt_version='sanad-service-ar-v5',updated_at=now()
where singleton=true;

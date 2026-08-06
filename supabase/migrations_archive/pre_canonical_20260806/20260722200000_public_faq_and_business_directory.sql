-- Public FAQ knowledge base and launch-aware business directory.
-- The RPCs expose only intentionally public data and keep direct table access closed.

create table if not exists public.sanad_public_faq_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null check (category in ('about','verification','account','subscription','business','support')),
  question text not null check (length(trim(question)) between 5 and 240),
  answer text not null check (length(trim(answer)) between 10 and 4000),
  keywords text[] not null default '{}',
  display_order integer not null default 100,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sanad_public_faq_entries is
  'Editorial source of truth for public SANAD FAQ and future assistant knowledge retrieval.';

create index if not exists sanad_public_faq_entries_public_order_idx
  on public.sanad_public_faq_entries (category, display_order, slug)
  where status = 'published';

alter table public.sanad_public_faq_entries enable row level security;
revoke all on table public.sanad_public_faq_entries from public, anon, authenticated;
grant all on table public.sanad_public_faq_entries to service_role;

insert into public.sanad_public_faq_entries
  (slug, category, question, answer, keywords, display_order, status)
values
  ('what-is-sanad','about','ما هو سند؟','سند منصة عربية تجمع التحقق المنظم من بيانات الإشعارات والمعاملات المالية مع مجتمع أعمال وكتالوجات تجارية في تجربة واحدة.',array['سند','المنصة','تعريف'],10,'published'),
  ('is-sanad-bank','about','هل سند بنك أو محفظة مالية؟','لا. سند ليس بنكًا ولا محفظة ولا ينفذ التحويل المالي؛ هو منصة تقنية لتنظيم البيانات والمراجعة وإدارة الحضور التجاري.',array['بنك','محفظة','تحويل'],20,'published'),
  ('who-is-sanad-for','about','لمن صُمم سند؟','للأفراد الذين يحتاجون إلى مراجعة عملياتهم بصورة أوضح، ولأصحاب الأنشطة وفرقهم الذين يريدون ملفًا عامًا وكتالوجات وأدوات إدارة وتواصل.',array['أفراد','أعمال','مستخدمون'],30,'published'),
  ('financial-vs-business','about','ما الفرق بين سند المالي وسند التجاري؟','سند المالي يركز على التحقق وسجل العمليات والملاحظات الخاصة، بينما يركز سند التجاري على ملف النشاط العام والمنتجات والخدمات والكتالوجات والعملاء والفريق.',array['مالي','تجاري','الفرق'],40,'published'),
  ('verify-operation','verification','كيف أتحقق من عملية؟','افتح رابط التحقق أو امسح رمز QR داخل سند، ثم راجع بيانات العملية والمؤشرات الظاهرة وسجّل تحققك من حسابك.',array['تحقق','عملية','QR','رابط'],60,'published'),
  ('verification-guarantee','verification','هل نتيجة سند ضمان نهائي لصحة العملية؟','لا. سند ينظم البيانات ويعرض مؤشرات مساعدة للمراجعة، ولا يستبدل التأكيد النهائي من البنك أو المحفظة أو الجهة المالية عند النزاع.',array['ضمان','صحة','نزاع'],70,'published'),
  ('mismatched-data','verification','ماذا أفعل إذا كانت بيانات العملية غير متطابقة؟','لا تعتمد العملية لمجرد وجود صورة إشعار. قارن المبلغ والمرجع والجهة والتاريخ، وتواصل مع الجهة المالية أو الطرف المعني، ثم أبلغ دعم سند عند وجود خلل تقني.',array['اختلاف','اشتباه','مبلغ'],80,'published'),
  ('whatsapp-verification','verification','هل يمكن استخدام سند عبر واتساب؟','يمكن إرسال الإشعار إلى قناة سند المعتمدة في واتساب عندما تكون الخدمة متاحة. لا ترسل كلمة المرور أو رمز التحقق أو بيانات البطاقة.',array['واتساب','إشعار'],90,'published'),
  ('operation-history','verification','هل يحتفظ سند بسجل عملياتي؟','يعرض الحساب سجل العمليات المرتبطة باستخدامك وفق الصلاحيات المتاحة، ليسهل الرجوع إليها ومراجعتها.',array['سجل','عمليات'],100,'published'),
  ('private-notes','verification','هل يمكن إضافة ملاحظة إلى العملية؟','نعم. بعد التحقق تستطيع حفظ ملاحظة نصية أو تسجيل صوتي خاص مرتبط بالعملية ولا يظهر في رابط التحقق العام.',array['ملاحظة','صوتية','نصية'],110,'published'),
  ('manage-note','verification','هل أستطيع حذف الملاحظة أو استبدالها؟','يمكن إدارة الملاحظة من واجهة تفاصيل العملية وفق الخيارات المتاحة، بما في ذلك الاستبدال أو الحذف.',array['حذف','استبدال','ملاحظة'],120,'published'),
  ('account-required','account','هل يلزم إنشاء حساب؟','يمكن استعراض بعض المحتوى العام دون حساب، بينما يتطلب حفظ التحقق والملاحظات وإدارة الاشتراك والنشاط حسابًا مسجلًا.',array['حساب','تسجيل'],130,'published'),
  ('install-app','account','كيف أثبت تطبيق سند؟','افتح صفحة التثبيت الرسمية على https://app.sanadflow.com/install/ واتبع تعليمات جهازك، ويمكنك أيضًا استخدام سند من المتصفح.',array['تثبيت','PWA','تطبيق'],140,'published'),
  ('session-behavior','account','لماذا يبقى حسابي مسجلًا بعد إغلاق التطبيق؟','تُحفظ الجلسة لتسهيل العودة. عند تنفيذ تسجيل الخروج تبقى الجلسة منتهية حتى تسجل الدخول من جديد.',array['جلسة','خروج','دخول'],150,'published'),
  ('privacy-protection','account','كيف يحمي سند بياناتي وملفاتي؟','يفصل سند الملفات والملاحظات الحساسة عن المحتوى العام، ويطبق صلاحيات وصول وسياسات قاعدة بيانات وتخزين خاصة.',array['خصوصية','أمان','ملفات'],160,'published'),
  ('never-share-secrets','account','هل يطلب سند كلمة المرور أو رمز التحقق؟','لا يطلب دعم سند أو مساعده كلمة المرور أو رمز التحقق المالي أو بيانات البطاقة. لا تشارك هذه البيانات مع أي شخص.',array['كلمة المرور','رمز التحقق','بطاقة'],170,'published'),
  ('free-access','subscription','هل الإتاحة المجانية تتجدد كل شهر؟','لا. الإتاحة المجانية تأسيسية لمرة واحدة طوال عمر الحساب وليست رصيدًا شهريًا متجددًا.',array['مجاني','تجديد','رصيد'],180,'published'),
  ('pro-current-plan','subscription','ما سعر ومدة وحدود سند برو؟','تُقرأ بيانات السعر والمدة وحد الاستخدام من إعدادات الباقة الحالية في سند وتظهر للمستخدم قبل إرسال طلب الاشتراك.',array['سعر','مدة','عمليات','برو'],190,'published'),
  ('unused-pro-access','subscription','ماذا يحدث للعمليات غير المستخدمة بعد انتهاء سند برو؟','تنتهي الإتاحة غير المستخدمة بانتهاء مدة الباقة ولا تنتقل تلقائيًا إلى الفترة التالية.',array['انتهاء','متبقي','ترحيل'],200,'published'),
  ('subscribe-pro','subscription','كيف أشترك في سند برو؟','من قسم حسابي افتح بطاقة سند برو، راجع الباقة الحالية، ثم أنشئ طلب الاشتراك وارفع إشعار الدفع المطلوب للمراجعة.',array['اشتراك','دفع','إشعار'],210,'published'),
  ('pro-activation','subscription','متى يتفعل اشتراك سند برو؟','يتفعل بعد قبول طلب الدفع وفق مسار المراجعة، ويصل للمستخدم إشعار واضح عند الموافقة أو الرفض.',array['تفعيل','موافقة','رفض'],220,'published'),
  ('team-pro','subscription','هل يمكن لمدير النشاط شراء سند برو لأعضاء الفريق؟','يمكن لمدير النشاط اختيار المستفيدين ضمن مسار الفريق. يحسب الإجمالي من سعر الباقة الحالي مضروبًا في عدد المستفيدين، وليس من مبلغ ثابت.',array['فريق','أعضاء','شراء جماعي'],230,'published'),
  ('payment-rejected','subscription','لماذا قد يُرفض إشعار الدفع؟','قد يكون السبب عدم وضوح الصورة أو اختلاف المبلغ أو تكرار الطلب أو نقص البيانات. راجع سبب الرفض الظاهر ثم أعد الإرسال أو تواصل مع الدعم.',array['رفض','دفع','صورة'],240,'published'),
  ('business-community','business','ما مجتمع أعمال سند؟','دليل عام داخل سند لاكتشاف الأنشطة المنشورة وملفاتها ومنتجاتها وخدماتها والتواصل معها.',array['مجتمع','دليل','أنشطة'],250,'published'),
  ('create-business','business','كيف أنشئ نشاطًا تجاريًا؟','من حسابي افتح إدارة النشاط وأدخل الهوية والبيانات العامة والتواصل، ثم أكمل متطلبات الملف والكتالوج وأرسل النشاط للمراجعة عندما يصبح جاهزًا.',array['إنشاء نشاط','إدارة'],260,'published'),
  ('published-businesses','business','متى يظهر النشاط للعامة؟','يظهر بعد اكتمال متطلبات النشر واعتماد حالته العامة، ووفق مرحلة إطلاق مجتمع الأعمال وضوابط الظهور الحالية.',array['نشر','مراجعة','ظهور'],270,'published'),
  ('business-verification','business','هل كل نشاط ظاهر في الدليل موثق؟','لا. حالة النشر تختلف عن حالة التحقق. تظهر شارة التحقق فقط عندما تكون حالة النشاط موثقة، ولا يعني مجرد الظهور أنه موثق.',array['موثق','شارة','حالة'],280,'published'),
  ('business-search','business','كيف أبحث عن نشاط أو منتج أو خدمة؟','استخدم دليل الأعمال للبحث بالاسم أو المحافظة أو التصنيف أو كلمات من المنتجات والخدمات المنشورة.',array['بحث','منتج','خدمة','تصنيف'],290,'published'),
  ('governorate-filter','business','هل يمكن تخصيص نتائج الأنشطة حسب المحافظة؟','نعم. يمكن ترشيح النتائج حسب المحافظة المختارة أو الانتقال إلى محافظة أخرى أو عرض جميع النتائج المتاحة.',array['محافظة','موقع','تخصيص'],300,'published'),
  ('business-contact','business','كيف أتواصل مع نشاط تجاري؟','استخدم بيانات التواصل العامة التي نشرها النشاط في صفحته. لا يشارك سند بيانات المالك الخاصة غير المنشورة.',array['تواصل','واتساب','نشاط'],310,'published'),
  ('business-data-accuracy','business','من المسؤول عن دقة بيانات النشاط والمنتجات؟','النشاط مسؤول عن تحديث بياناته وأسعاره وتوفر عناصره. يمكنك إبلاغ سند عن محتوى مضلل أو قديم للمراجعة.',array['دقة','سعر','بلاغ'],320,'published'),
  ('support-contact','support','كيف أتواصل مع دعم سند؟','تُقرأ قنوات الدعم وساعات العمل ومدة الاستجابة من إعدادات سند العامة وتظهر في الموقع والتطبيق.',array['دعم','واتساب','بريد'],330,'published'),
  ('support-safe-info','support','ما المعلومات التي أرسلها للدعم؟','أرسل وصف المشكلة والوقت التقريبي وصورة خالية من الأسرار عند الحاجة. لا ترسل كلمة مرور أو رمز تحقق أو بيانات بطاقة.',array['مشكلة','أمان','دعم'],340,'published'),
  ('report-business','support','كيف أبلغ عن نشاط أو محتوى غير صحيح؟','أرسل رابط النشاط العام ووصف الخطأ إلى الدعم، وتجنب نشر بيانات شخصية أو اتهامات غير موثقة.',array['بلاغ','محتوى','نشاط'],350,'published'),
  ('assistant-no-answer','support','ماذا يحدث إذا لم يجد مساعد سند إجابة مؤكدة؟','يصرح بعدم وجود معلومة مؤكدة، ويقترح بحثًا أدق أو يحيل إلى الدعم بدل اختلاق إجابة.',array['مساعد','لا توجد نتيجة'],360,'published')
on conflict (slug) do update set
  category = excluded.category,
  question = excluded.question,
  answer = excluded.answer,
  keywords = excluded.keywords,
  display_order = excluded.display_order,
  status = excluded.status,
  updated_at = now();

create or replace function public.get_public_sanad_faq(
  p_category text default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_items jsonb;
  v_plan public.subscription_plans%rowtype;
  v_info public.app_public_information%rowtype;
begin
  if v_category is not null and v_category not in ('about','verification','account','subscription','business','support') then
    return jsonb_build_object('items','[]'::jsonb,'categories','[]'::jsonb,'generated_at',now());
  end if;

  select * into v_plan from public.subscription_plans
  where code = 'sanad_pro' and is_active = true limit 1;
  select * into v_info from public.app_public_information where singleton = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', f.slug,
    'category', f.category,
    'category_label', case f.category
      when 'about' then 'عن سند' when 'verification' then 'التحقق المالي'
      when 'account' then 'الحساب والخصوصية' when 'subscription' then 'سند برو'
      when 'business' then 'مجتمع الأعمال' else 'الدعم' end,
    'question', f.question,
    'answer', case
      when f.slug = 'pro-current-plan' and v_plan.code is not null then format(
        'سعر باقة %s الحالية %s %s، ومدتها %s يومًا، وتتيح حتى %s عملية خلال مدة الاشتراك. تظهر القيم الحالية قبل إرسال الطلب.',
        v_plan.display_name, v_plan.monthly_price_yer, v_plan.currency_code,
        v_plan.billing_duration_days, v_plan.monthly_access_limit)
      when f.slug = 'support-contact' and v_info.singleton then concat_ws(' ',
        'يمكن التواصل مع دعم سند عبر واتساب', nullif(v_info.support_whatsapp,''),
        'أو البريد', nullif(v_info.support_email,''),
        case when nullif(v_info.support_days_text,'') is not null then 'خلال ' || v_info.support_days_text else null end,
        case when nullif(v_info.support_hours_text,'') is not null then 'من ' || v_info.support_hours_text else null end,
        case when nullif(v_info.support_response_time_text,'') is not null then 'والاستجابة المتوقعة ' || v_info.support_response_time_text || '.' else null end)
      else f.answer end,
    'keywords', to_jsonb(f.keywords),
    'display_order', f.display_order
  ) order by f.display_order, f.slug), '[]'::jsonb)
  into v_items
  from public.sanad_public_faq_entries f
  where f.status = 'published'
    and (v_category is null or f.category = v_category)
    and (v_search is null
      or f.question ilike '%' || v_search || '%'
      or f.answer ilike '%' || v_search || '%'
      or exists (select 1 from unnest(f.keywords) k where k ilike '%' || v_search || '%'));

  return jsonb_build_object(
    'items', v_items,
    'categories', jsonb_build_array(
      jsonb_build_object('code','about','label','عن سند'),
      jsonb_build_object('code','verification','label','التحقق المالي'),
      jsonb_build_object('code','account','label','الحساب والخصوصية'),
      jsonb_build_object('code','subscription','label','سند برو'),
      jsonb_build_object('code','business','label','مجتمع الأعمال'),
      jsonb_build_object('code','support','label','الدعم')),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_public_sanad_faq(text,text) from public;
grant execute on function public.get_public_sanad_faq(text,text) to anon, authenticated, service_role;

create or replace function public.get_public_business_directory(
  p_search text default null,
  p_category_id uuid default null,
  p_governorate text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_governorate text := nullif(trim(coalesce(p_governorate, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 50));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_settings public.business_community_settings%rowtype;
  v_result jsonb;
begin
  select * into v_settings from public.business_community_settings where singleton = true;

  if p_category_id is not null and not exists (
    select 1 from public.business_categories c where c.id = p_category_id and c.status = 'active'
  ) then
    p_category_id := null;
  end if;

  with visible as (
    select bp.*,
      bc.code as category_code,
      bc.name_ar as category_name,
      (case when bp.verification_status = 'verified' then 100 else 0 end
       + case when bp.category_id is not null then 10 else 0 end
       + case when nullif(trim(coalesce(bp.description,'')),'') is not null then 10 else 0 end
       + case when coalesce(bp.profile_image_path,bp.logo_path) is not null then 10 else 0 end) as discovery_rank
    from public.business_profiles bp
    left join public.business_categories bc on bc.id = bp.category_id and bc.status = 'active'
    where v_settings.phase not in ('prelaunch','maintenance')
      and bp.public_status = 'published'
      and (v_settings.phase <> 'early_access' or bp.verification_status = 'verified')
      and (cardinality(v_settings.enabled_governorates) = 0 or bp.governorate = any(v_settings.enabled_governorates))
      and (v_settings.phase <> 'early_access' or bp.category_id in (
        select x.category_id from public.business_profiles x
        where x.public_status = 'published' and x.verification_status = 'verified' and x.category_id is not null
          and (cardinality(v_settings.enabled_governorates) = 0 or x.governorate = any(v_settings.enabled_governorates))
        group by x.category_id having count(*) >= v_settings.minimum_category_size))
      and (p_category_id is null or bp.category_id = p_category_id)
      and (v_governorate is null or bp.governorate = v_governorate)
      and (v_search is null
        or bp.name ilike '%' || v_search || '%'
        or bp.description ilike '%' || v_search || '%'
        or bp.display_tagline ilike '%' || v_search || '%'
        or bp.city ilike '%' || v_search || '%'
        or bp.governorate ilike '%' || v_search || '%'
        or bc.name_ar ilike '%' || v_search || '%'
        or exists (select 1 from public.business_catalog_items ci
          where ci.business_id = bp.id and ci.status = 'active'
            and (ci.title ilike '%' || v_search || '%' or ci.description ilike '%' || v_search || '%')))
  ), page as (
    select * from visible order by discovery_rank desc, created_at desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'phase', v_settings.phase,
    'registration_open', v_settings.registration_open,
    'title', case when v_settings.phase = 'prelaunch' then v_settings.prelaunch_title
                  when v_settings.phase = 'early_access' then v_settings.early_access_title
                  when v_settings.phase = 'maintenance' then 'مجتمع الأعمال قيد التحديث'
                  else 'اكتشف الأنشطة والمنتجات والخدمات' end,
    'body', case when v_settings.phase = 'prelaunch' then v_settings.prelaunch_body
                 when v_settings.phase = 'early_access' then v_settings.early_access_body
                 when v_settings.phase = 'maintenance' then 'نعمل على تحسين الدليل وسيعود قريبًا.'
                 else 'ابحث في الأنشطة التجارية المنشورة وكتالوجاتها العامة.' end,
    'total', (select count(*) from visible),
    'limit', v_limit,
    'offset', v_offset,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name_ar',c.name_ar) order by c.display_order,c.name_ar)
      from public.business_categories c where c.status = 'active'), '[]'::jsonb),
    'governorates', coalesce((select jsonb_agg(g order by g) from (select distinct governorate g from visible where governorate is not null and trim(governorate) <> '') q), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'slug', p.slug,
      'tagline', p.display_tagline, 'description', p.description,
      'category', case when p.category_id is null then null else jsonb_build_object('id',p.category_id,'code',p.category_code,'name_ar',p.category_name) end,
      'governorate', p.governorate, 'city', p.city, 'whatsapp', p.whatsapp,
      'verification_status', p.verification_status,
      'public_url', 'https://app.sanadflow.com/b/' || p.slug,
      'catalog_preview', coalesce((select jsonb_agg(x.item order by x.is_featured desc,x.display_order,x.created_at desc) from (
        select jsonb_build_object('id',ci.id,'type',ci.item_type,'title',ci.title,'description',ci.description,
          'price',ci.price,'currency',ci.currency,'availability_status',ci.availability_status,'is_featured',ci.is_featured) item,
          ci.is_featured,ci.display_order,ci.created_at
        from public.business_catalog_items ci
        where ci.business_id = p.id and ci.status = 'active'
        order by ci.is_featured desc,ci.display_order,ci.created_at desc limit 3
      ) x), '[]'::jsonb)
    ) order by p.discovery_rank desc,p.created_at desc) from page p), '[]'::jsonb),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_public_business_directory(text,uuid,text,integer,integer) from public;
grant execute on function public.get_public_business_directory(text,uuid,text,integer,integer) to anon, authenticated, service_role;

comment on function public.get_public_sanad_faq(text,text) is
  'Public structured SANAD knowledge endpoint with database-driven plan and support answers.';
comment on function public.get_public_business_directory(text,uuid,text,integer,integer) is
  'Launch-aware public business and catalog search endpoint for landing pages and controlled assistants.';

begin;

with upserted as (
  insert into public.sanad_knowledge_sources(
    source_code,source_type,title,description,knowledge_scope,status,visibility,
    authority_level,language,effective_from,approved_at,published_at,metadata
  ) values (
    'SANAD-CORE-OPERATING-MODEL-001',
    'official_information',
    'النموذج التشغيلي الرسمي لسند',
    'المرجع الأعلى لتعريف سند، وحدود التحقق، ومسار ما بعد الدفع الإلكتروني.',
    'platform_official',
    'published',
    'assistant_public',
    1,
    'ar',
    now(),
    now(),
    now(),
    jsonb_build_object(
      'managed_by','release-readiness',
      'knowledge_owner','SANAD platform administration',
      'review_note','Approved core product philosophy and operating flow'
    )
  )
  on conflict (source_code) do update set
    source_type=excluded.source_type,
    title=excluded.title,
    description=excluded.description,
    knowledge_scope=excluded.knowledge_scope,
    status='published',
    visibility='assistant_public',
    authority_level=1,
    language='ar',
    effective_from=coalesce(public.sanad_knowledge_sources.effective_from,now()),
    approved_at=coalesce(public.sanad_knowledge_sources.approved_at,now()),
    published_at=coalesce(public.sanad_knowledge_sources.published_at,now()),
    version_number=public.sanad_knowledge_sources.version_number+1,
    metadata=public.sanad_knowledge_sources.metadata || excluded.metadata,
    updated_at=now()
  returning id
), source as (
  select id from upserted
  union all
  select id from public.sanad_knowledge_sources where source_code='SANAD-CORE-OPERATING-MODEL-001'
  limit 1
)
update public.sanad_knowledge_units
set status='inactive',updated_at=now()
where source_id=(select id from source) and status='active';

with source as (
  select id from public.sanad_knowledge_sources where source_code='SANAD-CORE-OPERATING-MODEL-001'
)
insert into public.sanad_knowledge_units(
  source_id,unit_type,heading,content,summary,keywords,intent_tags,
  audience_tags,channel_tags,chunk_index,status,metadata
)
select source.id,v.unit_type,v.heading,v.content,v.summary,v.keywords,v.intent_tags,
       v.audience_tags,v.channel_tags,v.chunk_index,'active',v.metadata
from source
cross join (values
  (
    'official_fact','ما هو سند؟',
    'سند هو طبقة تنظيم وتوثيق وتشغيل تبدأ بعد إتمام الدفع الإلكتروني. ليس سند أداة دفع، ولا بنكًا، ولا محفظة مالية. وظيفته تحويل إشعار الدفع الذي يبقى عادة داخل هاتف العميل إلى عملية رقمية موحدة يمكن عرضها ومراجعتها وتوثيق ما حدث بعدها. الرسالة المركزية: سند ينظم ما يحدث بعد الدفع الإلكتروني.',
    'تعريف سند الرسمي وحدود وظيفته.',
    array['سند','ما هو سند','بعد الدفع الإلكتروني','تنظيم','توثيق','تشغيل']::text[],
    array['knowledge_inquiry','faq']::text[],
    array['new_user','customer','cashier','business_owner','team_member']::text[],
    array['whatsapp','app','website']::text[],
    0,
    jsonb_build_object('answer_priority','highest')
  ),
  (
    'procedure_step','المسار التشغيلي بعد الدفع',
    'المسار المستهدف في سند هو: يدفع العميل إلكترونيًا، ثم يشارك الإشعار إلى تطبيق سند أو محادثة سند في واتساب، فيتحول الإشعار إلى عملية رقمية موحدة، وينشأ لها رابط وQR، ويعرض العميل QR بدل تسليم هاتفه، ويفتح الكاشير العملية على جهازه لمراجعة الملف والبيانات، ثم يسجل تحققَه ويضيف الملاحظات عند الحاجة، وترتبط العملية بالنشاط والفريق والتقارير.',
    'التدفق الكامل من مشاركة الإشعار إلى سجل النشاط والتقارير.',
    array['شارك الإشعار','عملية','QR','الكاشير','ملاحظات','تقارير']::text[],
    array['knowledge_inquiry','document_reference']::text[],
    array['customer','cashier','business_owner','team_member']::text[],
    array['whatsapp','app','website']::text[],
    1,
    jsonb_build_object('flow','pay-share-operation-qr-review-record')
  ),
  (
    'policy_clause','حدود التحقق في سند',
    'تسجيل التحقق في سند يعني أن الشخص المخول راجع ملف العملية والبيانات الظاهرة وسجل إجراءه داخل سند. هذا التحقق تشغيلي وتوثيقي، ولا يمثل تأكيدًا بنكيًا نهائيًا لوصول الأموال أو تسويتها، ولا يغني عن الرجوع إلى الحساب أو الجهة المالية عند الحاجة إلى يقين بنكي.',
    'سند يسجل تحققًا تشغيليًا ولا يدعي يقينًا بنكيًا.',
    array['تحقق','تأكيد بنكي','وصول الحوالة','تسوية','مراجعة']::text[],
    array['knowledge_inquiry','faq','policy']::text[],
    array['customer','cashier','business_owner','team_member']::text[],
    array['whatsapp','app','website']::text[],
    2,
    jsonb_build_object('risk_control','no-bank-settlement-claim')
  ),
  (
    'procedure_step','استخدام QR عند الكاشير',
    'بعد تحويل الإشعار إلى عملية في سند، يعرض العميل رابط العملية أو QR. يمسح الكاشير QR من جهازه أو يفتح الرابط، ثم يراجع صورة أو ملف الإشعار والبيانات المستخرجة، ويسجل تحققَه وملاحظاته وفق صلاحياته. الهدف هو ألا يضطر العميل إلى تسليم هاتفه للكاشير أو السماح بتصوير شاشة هاتفه.',
    'QR هو جسر تسليم تشغيلي آمن بين العميل والكاشير.',
    array['QR','كيو آر','الكاشير','لا تعط هاتفك','مسح الرمز']::text[],
    array['knowledge_inquiry','faq']::text[],
    array['customer','cashier','business_owner']::text[],
    array['whatsapp','app','website']::text[],
    3,
    jsonb_build_object('campaign_message','لا تعطِ هاتفك للكاشير… شارك الإشعار مع سند')
  ),
  (
    'official_fact','قنوات استخدام سند',
    'يمكن بدء العملية من تطبيق سند أو من محادثة سند الرسمية في واتساب. القناتان تخدمان العملية نفسها: استقبال الإشعار وتنظيمه وتحويله إلى سجل قابل للمراجعة والمتابعة، وليستا منتجين منفصلين أو مسارين متعارضين.',
    'التطبيق وواتساب قناتان للعملية نفسها.',
    array['واتساب','التطبيق','قنوات سند','مشاركة الإشعار']::text[],
    array['knowledge_inquiry','faq']::text[],
    array['new_user','customer','business_owner']::text[],
    array['whatsapp','app','website']::text[],
    4,
    jsonb_build_object('channel_model','one-operation-multiple-entry-channels')
  )
) as v(unit_type,heading,content,summary,keywords,intent_tags,audience_tags,channel_tags,chunk_index,metadata);

insert into public.sanad_knowledge_references(
  source_id,platform,reference_type,external_url,normalized_url,label,is_primary,metadata
)
select id,'sanadflow.com','canonical_url','https://sanadflow.com/','https://sanadflow.com/','الموقع الرسمي لسند',true,
       jsonb_build_object('source_code','SANAD-CORE-OPERATING-MODEL-001')
from public.sanad_knowledge_sources
where source_code='SANAD-CORE-OPERATING-MODEL-001'
and not exists (
  select 1 from public.sanad_knowledge_references r
  where r.source_id=public.sanad_knowledge_sources.id
    and r.normalized_url='https://sanadflow.com/'
);

update public.sanad_knowledge_test_cases
set expected_source_codes=array['SANAD-CORE-OPERATING-MODEL-001'],updated_at=now()
where name in ('assistant_v5_identity','assistant_v5_not_bank','assistant_v5_qr','assistant_v5_document');

commit;

-- Seed the first authoritative SKMS source used for install guidance.

begin;

insert into public.sanad_knowledge_sources (
  source_code, source_type, title, description, knowledge_scope, status,
  visibility, authority_level, language, effective_from, approved_at,
  published_at, metadata
) values (
  'OFFICIAL-INSTALL-GUIDE-001',
  'product_guide',
  'دليل تثبيت تطبيق سند',
  'مرجع رسمي يشرح الوصول إلى صفحة تثبيت سند والتعامل مع المتصفحات الداخلية في تطبيقات التواصل.',
  'technical_support',
  'published',
  'assistant_public',
  2,
  'ar',
  now(),
  now(),
  now(),
  jsonb_build_object('seeded_by','seed_official_install_knowledge','canonical',true)
)
on conflict (source_code) do update set
  title=excluded.title,
  description=excluded.description,
  knowledge_scope=excluded.knowledge_scope,
  status=excluded.status,
  visibility=excluded.visibility,
  authority_level=excluded.authority_level,
  effective_from=excluded.effective_from,
  approved_at=excluded.approved_at,
  published_at=excluded.published_at,
  metadata=excluded.metadata,
  updated_at=now();

delete from public.sanad_knowledge_units
where source_id=(select id from public.sanad_knowledge_sources where source_code='OFFICIAL-INSTALL-GUIDE-001');

with source_row as (
  select id from public.sanad_knowledge_sources where source_code='OFFICIAL-INSTALL-GUIDE-001'
)
insert into public.sanad_knowledge_units (
  source_id, unit_type, heading, content, summary, keywords,
  intent_tags, audience_tags, channel_tags, chunk_index, metadata
)
select id, 'document_section', 'رابط التثبيت الرسمي',
  'رابط تثبيت تطبيق سند الرسمي هو https://app.sanadflow.com/install/ . يجب إرسال الرابط بصورته الكاملة الخام في سطر مستقل دون تنسيق Markdown أو نجوم حول الرابط.',
  'الرابط الرسمي لتثبيت تطبيق سند.',
  array['سند','تثبيت','تنزيل','تحميل','رابط التطبيق'],
  array['install_app','technical_support'],
  array['new_user','customer','cashier','business_owner'],
  array['whatsapp','app','website','facebook'],
  0,
  '{}'::jsonb
from source_row
union all
select id, 'document_section', 'التثبيت على Android',
  'على Android افتح رابط التثبيت في Chrome أو متصفح خارجي موثوق، ثم استخدم خيار تثبيت التطبيق أو إضافة التطبيق إلى الشاشة الرئيسية عندما يظهر. إذا فُتح الرابط داخل متصفح فيسبوك أو واتساب ولم يظهر خيار التثبيت، افتح قائمة المتصفح واختر فتح في Chrome أو متصفح خارجي.',
  'خطوات التثبيت على Android ومعالجة المتصفح الداخلي.',
  array['Android','Chrome','متصفح فيسبوك','متصفح واتساب','تثبيت'],
  array['install_app','technical_support'],
  array['new_user','customer','cashier','business_owner'],
  array['whatsapp','facebook','app'],
  1,
  '{}'::jsonb
from source_row
union all
select id, 'document_section', 'التثبيت على iPhone',
  'على iPhone افتح الرابط في Safari، ثم استخدم قائمة المشاركة واختر إضافة إلى الشاشة الرئيسية. إذا كان الرابط مفتوحًا داخل متصفح تطبيق تواصل، اطلب من المستخدم فتحه في Safari أولًا. لا تدّع أن سند يستطيع إجبار iOS على فتح Safari تلقائيًا في كل الحالات.',
  'خطوات التثبيت على iPhone عبر Safari.',
  array['iPhone','iOS','Safari','إضافة إلى الشاشة الرئيسية'],
  array['install_app','technical_support'],
  array['new_user','customer','cashier','business_owner'],
  array['whatsapp','facebook','app'],
  2,
  '{}'::jsonb
from source_row;

with source_row as (
  select id from public.sanad_knowledge_sources where source_code='OFFICIAL-INSTALL-GUIDE-001'
)
insert into public.sanad_knowledge_references (
  source_id, platform, reference_type, external_url, normalized_url,
  label, is_primary, metadata
)
select id, 'website', 'canonical_url',
  'https://app.sanadflow.com/install/',
  'https://app.sanadflow.com/install/',
  'رابط التثبيت الرسمي',
  true,
  '{}'::jsonb
from source_row
on conflict (normalized_url) where normalized_url is not null do update set
  source_id=excluded.source_id,
  platform=excluded.platform,
  reference_type=excluded.reference_type,
  label=excluded.label,
  is_primary=excluded.is_primary;

commit;

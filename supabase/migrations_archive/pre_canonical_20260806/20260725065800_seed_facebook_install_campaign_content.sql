begin;

insert into public.sanad_knowledge_sources (
  source_code,source_type,title,description,knowledge_scope,status,visibility,
  authority_level,language,effective_from,approved_at,published_at,metadata
) values (
  'FB-INSTALL-001',
  'digital_content',
  'حملة تثبيت تطبيق سند عبر فيسبوك',
  'المصدر الرسمي لحملة فيسبوك التي تنقل المستخدم إلى محادثة سند في واتساب لطلب رابط التثبيت.',
  'digital_marketing',
  'published',
  'assistant_public',
  4,
  'ar',
  now(),now(),now(),
  jsonb_build_object('campaign_channel','facebook','entrypoint','whatsapp','canonical',true)
)
on conflict (source_code) do update set
  title=excluded.title,
  description=excluded.description,
  knowledge_scope=excluded.knowledge_scope,
  status=excluded.status,
  visibility=excluded.visibility,
  authority_level=excluded.authority_level,
  metadata=excluded.metadata,
  updated_at=now();

delete from public.sanad_knowledge_units
where source_id=(select id from public.sanad_knowledge_sources where source_code='FB-INSTALL-001');

delete from public.sanad_knowledge_references
where source_id=(select id from public.sanad_knowledge_sources where source_code='FB-INSTALL-001');

with source_row as (
  select id from public.sanad_knowledge_sources where source_code='FB-INSTALL-001'
)
insert into public.sanad_knowledge_units(
  source_id,unit_type,heading,content,summary,keywords,intent_tags,
  audience_tags,channel_tags,chunk_index,metadata
)
select id,'campaign_message','طلب تثبيت سند من إعلان فيسبوك',
  'هذا المحتوى هو حملة فيسبوك رسمية هدفها مساعدة المستخدم على تثبيت تطبيق سند. عندما تصل رسالة تحمل المرجع FB-INSTALL-001 أو تطلب تثبيت سند من إعلان فيسبوك، أعط المستخدم رابط التثبيت الرسمي مباشرة، ثم وضح باختصار أنه قد يحتاج إلى فتح الرابط في Chrome على Android أو Safari على iPhone إذا فتح داخل متصفح مدمج.',
  'سياق حملة تثبيت سند من فيسبوك عبر واتساب.',
  array['فيسبوك','إعلان','تثبيت سند','واتساب','FB-INSTALL-001'],
  array['install_app','digital_content'],
  array['new_user','customer','cashier','business_owner'],
  array['whatsapp','facebook'],
  0,
  jsonb_build_object('required_guide','OFFICIAL-INSTALL-GUIDE-001')
from source_row;

with source_row as (
  select id from public.sanad_knowledge_sources where source_code='FB-INSTALL-001'
)
insert into public.sanad_digital_content(
  source_id,platform,content_type,body_text,assistant_context,campaign_name,
  campaign_objective,primary_cta_type,primary_cta_label,primary_cta_url,
  whatsapp_prefill_text,media
)
select id,'facebook','campaign',
  'ثبّت تطبيق سند وابدأ بتنظيم ما يحدث بعد الدفع الإلكتروني. افتح محادثة سند في واتساب واطلب رابط التثبيت.',
  'المستخدم وصل من حملة تثبيت فيسبوك. أرسل رابط التثبيت الرسمي أولًا، ثم خطوات المتصفح الخارجي باختصار، ولا تطلب نوع الجهاز قبل إرسال الرابط.',
  'Facebook Install 001',
  'نقل المستخدم من إعلان فيسبوك إلى محادثة سند ثم إلى صفحة التثبيت الرسمية.',
  'install_app',
  'تثبيت تطبيق سند',
  'https://app.sanadflow.com/install/',
  'مرحبًا سند، أريد تثبيت تطبيق سند من إعلان فيسبوك. المرجع: FB-INSTALL-001',
  '[]'::jsonb
from source_row
on conflict(source_id) do update set
  platform=excluded.platform,
  content_type=excluded.content_type,
  body_text=excluded.body_text,
  assistant_context=excluded.assistant_context,
  campaign_name=excluded.campaign_name,
  campaign_objective=excluded.campaign_objective,
  primary_cta_type=excluded.primary_cta_type,
  primary_cta_label=excluded.primary_cta_label,
  primary_cta_url=excluded.primary_cta_url,
  whatsapp_prefill_text=excluded.whatsapp_prefill_text,
  media=excluded.media;

with source_row as (
  select id from public.sanad_knowledge_sources where source_code='FB-INSTALL-001'
)
insert into public.sanad_knowledge_references(
  source_id,platform,reference_type,external_id,label,is_primary,metadata
)
select id,'facebook','campaign_code','FB-INSTALL-001','مرجع حملة فيسبوك',true,'{}'::jsonb
from source_row;

commit;

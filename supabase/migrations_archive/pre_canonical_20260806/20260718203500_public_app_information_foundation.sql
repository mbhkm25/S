create table if not exists public.app_public_information (
  singleton boolean primary key default true check (singleton),
  support_whatsapp text,
  support_phone text,
  support_email text,
  support_website text,
  support_hours_text text,
  support_days_text text,
  support_response_time_text text,
  about_short text,
  about_financial text,
  about_business text,
  vision_text text,
  owner_name text,
  country text,
  governorate text,
  city text,
  launch_year integer,
  facebook_url text,
  instagram_url text,
  x_url text,
  telegram_url text,
  whatsapp_channel_url text,
  updated_at timestamptz not null default now()
);

alter table public.app_public_information enable row level security;
revoke all on table public.app_public_information from anon, authenticated;
grant usage on schema public to anon, authenticated;

insert into public.app_public_information (
  singleton,
  support_whatsapp,
  support_phone,
  support_email,
  support_website,
  support_hours_text,
  support_days_text,
  support_response_time_text,
  about_short,
  about_financial,
  about_business,
  vision_text,
  owner_name,
  country,
  governorate,
  city,
  launch_year
) values (
  true,
  '967777634971',
  '05836033',
  'support@sanadflow.com',
  'https://sanadflow.com',
  '8:00 صباحًا – 5:00 مساءً',
  'السبت إلى الخميس',
  'عادةً خلال 3 إلى 4 ساعات',
  'سند منصة للتحقق من الإشعارات المالية واكتشاف الأنشطة التجارية والتواصل معها.',
  'يساعد سند المستخدم على التحقق من الإشعارات المالية ورصد المؤشرات التي قد تدل على التأخر أو التكرار أو الاشتباه، بما يعزز الثقة عند استلام الإشعار أو مشاركته.',
  'يقدم سند التجاري دليل أعمال عامًا يتيح للمستخدم استكشاف الأنشطة والكتالوجات المنشورة والتواصل معها، كما يتيح لصاحب العمل إنشاء ملف نشاط وإدارة علاقته بعملائه.',
  'تنظيم تجربة التحقق من الإشعارات المالية وتعزيز موثوقيتها، مع بناء بيئة أعمال رقمية واضحة تسهّل الوصول إلى الأنشطة والتواصل بينها وبين العملاء.',
  'سند',
  'الجمهورية اليمنية',
  'حضرموت',
  'المكلا',
  2026
)
on conflict (singleton) do update set
  support_whatsapp = excluded.support_whatsapp,
  support_phone = excluded.support_phone,
  support_email = excluded.support_email,
  support_website = excluded.support_website,
  support_hours_text = excluded.support_hours_text,
  support_days_text = excluded.support_days_text,
  support_response_time_text = excluded.support_response_time_text,
  about_short = excluded.about_short,
  about_financial = excluded.about_financial,
  about_business = excluded.about_business,
  vision_text = excluded.vision_text,
  owner_name = excluded.owner_name,
  country = excluded.country,
  governorate = excluded.governorate,
  city = excluded.city,
  launch_year = excluded.launch_year,
  updated_at = now();

create or replace function public.get_app_public_information()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(info) - 'singleton'
  from public.app_public_information as info
  where singleton = true;
$$;

revoke all on function public.get_app_public_information() from public;
grant execute on function public.get_app_public_information() to anon, authenticated;

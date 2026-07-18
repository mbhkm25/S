import { supabase } from './supabase';

export interface AppPublicInformation {
  support_whatsapp: string | null;
  support_phone: string | null;
  support_email: string | null;
  support_website: string | null;
  support_hours_text: string | null;
  support_days_text: string | null;
  support_response_time_text: string | null;
  about_short: string | null;
  about_financial: string | null;
  about_business: string | null;
  vision_text: string | null;
  owner_name: string | null;
  country: string | null;
  governorate: string | null;
  city: string | null;
  launch_year: number | null;
  facebook_url: string | null;
  instagram_url: string | null;
  x_url: string | null;
  telegram_url: string | null;
  whatsapp_channel_url: string | null;
}

const FALLBACK: AppPublicInformation = {
  support_whatsapp: '967777634971',
  support_phone: '05836033',
  support_email: 'support@sanadflow.com',
  support_website: 'https://sanadflow.com',
  support_hours_text: '8:00 صباحًا – 5:00 مساءً',
  support_days_text: 'السبت إلى الخميس',
  support_response_time_text: 'عادةً خلال 3 إلى 4 ساعات',
  about_short: 'سند منصة للتحقق من الإشعارات المالية واكتشاف الأنشطة التجارية والتواصل معها.',
  about_financial: 'يساعد سند المستخدم على التحقق من الإشعارات المالية ورصد المؤشرات التي قد تدل على التأخر أو التكرار أو الاشتباه، بما يعزز الثقة عند استلام الإشعار أو مشاركته.',
  about_business: 'يقدم سند التجاري دليل أعمال عامًا يتيح للمستخدم استكشاف الأنشطة والكتالوجات المنشورة والتواصل معها، كما يتيح لصاحب العمل إنشاء ملف نشاط وإدارة علاقته بعملائه.',
  vision_text: 'تنظيم تجربة التحقق من الإشعارات المالية وتعزيز موثوقيتها، مع بناء بيئة أعمال رقمية واضحة تسهّل الوصول إلى الأنشطة والتواصل بينها وبين العملاء.',
  owner_name: 'سند',
  country: 'الجمهورية اليمنية',
  governorate: 'حضرموت',
  city: 'المكلا',
  launch_year: 2026,
  facebook_url: null,
  instagram_url: null,
  x_url: null,
  telegram_url: null,
  whatsapp_channel_url: null
};

export async function getAppPublicInformation(): Promise<AppPublicInformation> {
  const { data, error } = await supabase.rpc('get_app_public_information');
  if (error || !data || typeof data !== 'object') return FALLBACK;
  return { ...FALLBACK, ...(data as Partial<AppPublicInformation>) };
}

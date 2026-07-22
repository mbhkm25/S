export type FaqEntry = {
  slug: string;
  category: string;
  category_label: string;
  question: string;
  answer: string;
  keywords: string[];
  display_order: number;
};

export const faqCategories = [
  ['all', 'الكل'],
  ['about', 'عن سند'],
  ['verification', 'التحقق المالي'],
  ['account', 'الحساب والخصوصية'],
  ['subscription', 'سند برو'],
  ['business', 'مجتمع الأعمال'],
  ['support', 'الدعم']
] as const;

// This compact fallback is used only when the public knowledge RPC is temporarily unavailable.
// The complete, editable source of truth is public.sanad_public_faq_entries in Supabase.
export const faqFallback: FaqEntry[] = [
  { slug:'what-is-sanad',category:'about',category_label:'عن سند',question:'ما هو سند؟',answer:'سند منصة عربية تجمع التحقق المنظم من بيانات الإشعارات والمعاملات المالية مع مجتمع أعمال وكتالوجات تجارية في تجربة واحدة.',keywords:['سند','المنصة'],display_order:10 },
  { slug:'verification-guarantee',category:'verification',category_label:'التحقق المالي',question:'هل نتيجة سند ضمان نهائي لصحة العملية؟',answer:'لا. سند ينظم البيانات ويعرض مؤشرات مساعدة للمراجعة، ولا يستبدل التأكيد النهائي من البنك أو المحفظة أو الجهة المالية عند النزاع.',keywords:['ضمان','صحة العملية','تحقق'],display_order:60 },
  { slug:'verify-operation',category:'verification',category_label:'التحقق المالي',question:'كيف أتحقق من عملية؟',answer:'افتح رابط العملية أو امسح رمز QR داخل سند، ثم راجع البيانات الظاهرة وسجّل تحققك من حسابك.',keywords:['QR','رابط','عملية'],display_order:70 },
  { slug:'private-notes',category:'verification',category_label:'التحقق المالي',question:'هل يمكن إضافة ملاحظة إلى العملية؟',answer:'نعم. بعد التحقق تستطيع حفظ ملاحظة نصية أو صوتية خاصة مرتبطة بالعملية، ولا تظهر في رابط التحقق العام.',keywords:['ملاحظة','صوتية','نصية'],display_order:100 },
  { slug:'free-access',category:'subscription',category_label:'سند برو',question:'هل الإتاحة المجانية تتجدد كل شهر؟',answer:'لا. الإتاحة المجانية تأسيسية لمرة واحدة طوال عمر الحساب، وبعد استهلاكها أو انتهاء صلاحيتها يلزم اشتراك نشط لمواصلة الميزات المدفوعة.',keywords:['مجاني','اشتراك'],display_order:160 },
  { slug:'pro-current-plan',category:'subscription',category_label:'سند برو',question:'ما سعر ومدة وحدود سند برو؟',answer:'تُجلب بيانات السعر والمدة وحد الاستخدام مباشرة من إعدادات الباقة الحالية في سند، وتظهر لك قبل إرسال طلب الاشتراك.',keywords:['سعر','مدة','عمليات','برو'],display_order:170 },
  { slug:'published-businesses',category:'business',category_label:'مجتمع الأعمال',question:'ما الأنشطة التي تظهر في دليل الأعمال؟',answer:'تظهر الأنشطة التي أكملت متطلبات النشر واعتمدت للنشر العام وفق مرحلة إطلاق مجتمع الأعمال وضوابط الظهور الحالية.',keywords:['نشاط','دليل','منشور'],display_order:230 },
  { slug:'support-contact',category:'support',category_label:'الدعم',question:'كيف أتواصل مع دعم سند؟',answer:'يمكنك التواصل من روابط الدعم الرسمية الظاهرة في الموقع والتطبيق. تُحدّث أرقام التواصل وساعات العمل من إعدادات سند العامة.',keywords:['دعم','واتساب','بريد'],display_order:290 }
];

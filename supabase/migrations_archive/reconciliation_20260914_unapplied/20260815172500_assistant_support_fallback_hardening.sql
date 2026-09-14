-- Harden SANAD assistant fallback to human support.
-- Source of truth for support contact: public.app_public_information.

update public.app_public_information
set support_phone = '777634971',
    support_whatsapp = '967777634971',
    updated_at = now()
where singleton = true;

update public.sanad_public_faq_entries
set answer = 'إذا احتجت مساعدة بشرية أو لم يجد مساعد سند إجابة مؤكدة، تواصل مباشرة مع مدير سند عبر واتساب على الرقم 967777634971 (محليًا: 777634971). لا ترسل كلمة المرور أو رموز التحقق أو بيانات البطاقة.',
    updated_at = now()
where slug = 'how-to-contact-support';

update public.sanad_public_faq_entries
set answer = 'إذا لم يجد مساعد سند إجابة مؤكدة أو لم يفهم الطلب، يصرح بذلك ويحوّلك مباشرة إلى مدير سند عبر واتساب على الرقم 967777634971 (محليًا: 777634971) بدل اختلاق إجابة.',
    updated_at = now()
where question = 'ماذا يحدث إذا لم يجد مساعد سند إجابة مؤكدة؟';

insert into public.sanad_assistant_intent_aliases(intent, phrase, normalized_phrase, locale, priority, status)
select v.intent, v.phrase, v.normalized_phrase, 'ar-YE', v.priority, 'active'
from (values
  ('human_support','الدعم','الدعم',100),
  ('human_support','رقم الدعم','رقم الدعم',100),
  ('human_support','أريد الدعم','اريد الدعم',100),
  ('human_support','أريد أكلم الدعم','اريد اكلم الدعم',100),
  ('human_support','أريد مدير سند','اريد مدير سند',100),
  ('human_support','مدير سند','مدير سند',100),
  ('human_support','حذف الحساب','حذف الحساب',100),
  ('human_support','أريد حذف الحساب','اريد حذف الحساب',100),
  ('human_support','أريد حذف حسابي','اريد حذف حسابي',100),
  ('human_support','احذف حسابي','احذف حسابي',100),
  ('human_support','إلغاء الحساب','الغاء الحساب',100)
) as v(intent, phrase, normalized_phrase, priority)
where not exists (
  select 1 from public.sanad_assistant_intent_aliases a
  where a.normalized_phrase = v.normalized_phrase and a.status = 'active'
);

begin;

create unique index if not exists sanad_knowledge_test_cases_name_key
  on public.sanad_knowledge_test_cases(name);

insert into public.sanad_knowledge_test_cases(
  name,input_text,expected_intent,expected_source_codes,expected_answer_contains,status
) values
  ('assistant_v5_install_direct','كيف أثبت تطبيق سند؟','install_app',array['OFFICIAL-INSTALL-GUIDE-001'],array['https://app.sanadflow.com/install/','Android','iPhone'],'active'),
  ('assistant_v5_facebook_install','فتحت رابط التثبيت من إعلان فيسبوك ولا يظهر زر التثبيت','install_app',array['OFFICIAL-INSTALL-GUIDE-001','FB-INSTALL-001'],array['Chrome','Safari'],'active'),
  ('assistant_v5_source_code','أريد تفاصيل FB-INSTALL-001','digital_content',array['FB-INSTALL-001'],array['سند'],'active'),
  ('assistant_v5_identity','ما هو سند وماذا يفعل؟','knowledge_inquiry',array[]::text[],array['بعد الدفع الإلكتروني'],'active'),
  ('assistant_v5_not_bank','هل سند يؤكد أن الحوالة وصلت للبنك؟','knowledge_inquiry',array[]::text[],array['لا','بنكي'],'active'),
  ('assistant_v5_qr','كيف أعرض QR للكاشير؟','knowledge_inquiry',array[]::text[],array['QR','الكاشير'],'active'),
  ('assistant_v5_phone_security','هل أرسل لك كلمة المرور ورمز OTP؟','support',array[]::text[],array['لا','كلمة المرور','OTP'],'active'),
  ('assistant_v5_unknown_policy','ما سياسة الاسترداد النهائية لسند برو؟','knowledge_inquiry',array[]::text[],array['معلومة رسمية'],'active'),
  ('assistant_v5_pro','ما هي باقة سند برو؟','knowledge_inquiry',array[]::text[],array['سند Pro'],'active'),
  ('assistant_v5_greeting','السلام عليكم','greeting',array[]::text[],array['مساعد سند'],'active'),
  ('assistant_v5_memory_show','ماذا تعرف عني؟','memory',array[]::text[],array['التفضيلات'],'active'),
  ('assistant_v5_document','ما الذي يقوله دليل استخدام سند عن مشاركة الإشعار؟','document_reference',array[]::text[],array['الإشعار'],'active')
on conflict (name) do update set
  input_text=excluded.input_text,
  expected_intent=excluded.expected_intent,
  expected_source_codes=excluded.expected_source_codes,
  expected_answer_contains=excluded.expected_answer_contains,
  status='active',
  updated_at=now();

commit;

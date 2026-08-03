begin;

-- ai_prompts enforces one row per prompt_key in the production schema.
-- Preserve the existing row identity, append the guardrails once, and advance
-- its explicit version instead of inserting a duplicate prompt_key.
update public.ai_prompts
set
  prompt_text = prompt_text
    || E'\n\n## ضوابط هوية الأسماء والحسابات — إلزامية\n'
    || E'- استخرج الاسم كما يظهر بصريًا في المستند حرفيًا قدر الإمكان. لا تصحح الاسم اعتمادًا على معرفتك، ولا تستنتج اسم النشاط الرسمي.\n'
    || E'- confidence_score العام لا يكفي لثقة الاسم. ضع field_confidences.receiver_name وفق وضوح حروف الاسم نفسها.\n'
    || E'- إذا كان الحرف الأول أو أي حرف جوهري غير واضح، خفّض ثقة receiver_name وأضف receiver_name_visual_ambiguity إلى ai_flags.\n'
    || E'- field_evidence.receiver_name يجب أن يقتبس الدليل المرئي القصير الذي بنيت عليه القراءة، لا تفسيرًا لهوية النشاط.\n'
    || E'- merchant_point ورقم الحساب والمعرّفات المالية حقول مستقلة. لا تستخدمها لتغيير الاسم المقروء، ولا تستخدم الاسم لاستكمال معرّف غير ظاهر.\n'
    || E'- لا تقل إن اسمًا ما هو اسم النشاط التجاري الرسمي. المطابقة والهوية الرسمية تتمان لاحقًا داخل سند من مصادر موثوقة.\n'
    || E'- إذا ظهر اسم محتمل مثل «حاكم» أو «باحكم» ولم يكن الحرف الأول واضحًا، احتفظ بأقرب قراءة مرئية وخفّض الثقة وسجل الغموض؛ لا تخمّن.\n',
  version = version + 1,
  is_active = true,
  notes = 'operation_identity_guardrails_v1',
  updated_at = now()
where prompt_key = 'sanad_operation_extraction_v1'
  and coalesce(notes,'') <> 'operation_identity_guardrails_v1';

-- Fail loudly when the expected extraction prompt is absent rather than
-- reporting a successful migration that changed nothing.
do $$
begin
  if not exists (
    select 1 from public.ai_prompts
    where prompt_key='sanad_operation_extraction_v1'
      and notes='operation_identity_guardrails_v1'
      and is_active=true
  ) then
    raise exception 'sanad_operation_extraction_prompt_not_found';
  end if;
end;
$$;

commit;

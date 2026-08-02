begin;

-- Create a new prompt version without mutating historical prompt text. The model
-- extracts what is visibly present; it never decides the official business identity.
with current_prompt as (
  select id,prompt_key,prompt_text,version
  from public.ai_prompts
  where prompt_key='sanad_operation_extraction_v1'
    and is_active=true
  order by version desc,updated_at desc
  limit 1
), deactivate as (
  update public.ai_prompts p
  set is_active=false,updated_at=now()
  from current_prompt current
  where p.id=current.id
    and not exists (
      select 1 from public.ai_prompts existing
      where existing.prompt_key=current.prompt_key
        and existing.notes='operation_identity_guardrails_v1'
    )
  returning current.*
)
insert into public.ai_prompts(
  prompt_key,prompt_text,version,is_active,notes
)
select
  prompt_key,
  prompt_text||E'\n\n## ضوابط هوية الأسماء والحسابات — إلزامية\n'
    ||E'- استخرج الاسم كما يظهر بصريًا في المستند حرفيًا قدر الإمكان. لا تصحح الاسم اعتمادًا على معرفتك، ولا تستنتج اسم النشاط الرسمي.\n'
    ||E'- confidence_score العام لا يكفي لثقة الاسم. ضع field_confidences.receiver_name وفق وضوح حروف الاسم نفسها.\n'
    ||E'- إذا كان الحرف الأول أو أي حرف جوهري غير واضح، خفّض ثقة receiver_name وأضف receiver_name_visual_ambiguity إلى ai_flags.\n'
    ||E'- field_evidence.receiver_name يجب أن يقتبس الدليل المرئي القصير الذي بنيت عليه القراءة، لا تفسيرًا لهوية النشاط.\n'
    ||E'- merchant_point ورقم الحساب والمعرّفات المالية حقول مستقلة. لا تستخدمها لتغيير الاسم المقروء، ولا تستخدم الاسم لاستكمال معرّف غير ظاهر.\n'
    ||E'- لا تقل إن اسمًا ما هو اسم النشاط التجاري الرسمي. المطابقة والهوية الرسمية تتمان لاحقًا داخل سند من مصادر موثوقة.\n'
    ||E'- إذا ظهر اسم محتمل مثل «حاكم» أو «باحكم» ولم يكن الحرف الأول واضحًا، احتفظ بأقرب قراءة مرئية وخفّض الثقة وسجل الغموض؛ لا تخمّن.\n',
  version+1,
  true,
  'operation_identity_guardrails_v1'
from deactivate;

-- If the guarded version already exists, keep it active and do not create duplicates.
update public.ai_prompts
set is_active=(notes='operation_identity_guardrails_v1'),updated_at=now()
where prompt_key='sanad_operation_extraction_v1'
  and exists (
    select 1 from public.ai_prompts guarded
    where guarded.prompt_key='sanad_operation_extraction_v1'
      and guarded.notes='operation_identity_guardrails_v1'
  );

commit;

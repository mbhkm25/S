create or replace function private.clean_operation_analysis_identifier(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      translate(trim(coalesce(p_value, '')), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
      '[^0-9A-Za-z\-+._/]+',
      '',
      'g'
    ),
    ''
  );
$$;

create or replace function private.safe_operation_analysis_confidence(
  p_value text,
  p_default numeric default 0
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when trim(coalesce(p_value, '')) ~ '^[0-9]+([.][0-9]+)?$'
      then greatest(0::numeric, least(1::numeric, trim(p_value)::numeric))
    else greatest(0::numeric, least(1::numeric, coalesce(p_default, 0)))
  end;
$$;

create or replace function private.sanitize_operation_field_confidences(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      item.key,
      to_jsonb(private.safe_operation_analysis_confidence(item.value, 0))
    ),
    '{}'::jsonb
  )
  from jsonb_each_text(
    case when jsonb_typeof(p_value) = 'object' then p_value else '{}'::jsonb end
  ) as item
  where item.key = any(array[
    'financial_entity','document_template','transaction_type','transaction_direction',
    'amount','currency','sender_name','sender_account','receiver_name','receiver_account',
    'document_account','credited_account','debited_account','merchant_point',
    'reference_number','transaction_datetime'
  ])
    and item.value ~ '^[0-9]+([.][0-9]+)?$';
$$;

create or replace function private.sanitize_operation_field_evidence(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(item.key, to_jsonb(left(nullif(trim(item.value), ''), 260))),
    '{}'::jsonb
  )
  from jsonb_each_text(
    case when jsonb_typeof(p_value) = 'object' then p_value else '{}'::jsonb end
  ) as item
  where item.key = any(array[
    'financial_entity','document_template','transaction_type','transaction_direction',
    'amount','currency','sender_name','sender_account','receiver_name','receiver_account',
    'document_account','credited_account','debited_account','merchant_point',
    'reference_number','transaction_datetime'
  ]);
$$;

create or replace function private.apply_operation_analysis_contract_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_extracted jsonb;
  v_prompt_version integer;
  v_entity text;
  v_template text;
  v_direction text;
  v_sender_type text;
  v_receiver_type text;
  v_overall_confidence numeric;
  v_template_confidence numeric;
  v_direction_confidence numeric;
  v_multiple_operations boolean;
  v_selected_position integer;
  v_confidences jsonb;
  v_evidence jsonb;
begin
  v_extracted := case
    when jsonb_typeof(new.raw_ai_json->'extracted') = 'object'
      then new.raw_ai_json->'extracted'
    when jsonb_typeof(new.structured_data) = 'object'
      then new.structured_data
    else '{}'::jsonb
  end;

  v_prompt_version := case
    when coalesce(new.raw_ai_json->>'prompt_version', '') ~ '^[0-9]+$'
      then (new.raw_ai_json->>'prompt_version')::integer
    else null
  end;

  if coalesce(v_prompt_version, 0) < 5
     and not (v_extracted ? 'document_template')
     and not (v_extracted ? 'field_confidences') then
    return new;
  end if;

  v_entity := case
    when nullif(trim(v_extracted->>'financial_entity'), '') in (
      'العمقي موبايل','البسيري موبايل','محفظة بي كاش','الكريمي سعودي',
      'الكريمي يمني','الكريمي حاسب','بن دول صرافة','بن دول باي','أم فلوس',
      'عدن كاش','القطيبي','المحضار','جهة أخرى','unknown'
    ) then nullif(trim(v_extracted->>'financial_entity'), '')
    else coalesce(new.financial_entity, 'unknown')
  end;

  v_template := case lower(coalesce(v_extracted->>'document_template', 'unknown'))
    when 'single_receipt' then 'single_receipt'
    when 'transaction_list' then 'transaction_list'
    when 'account_history' then 'account_history'
    when 'wallet_receipt' then 'wallet_receipt'
    when 'transfer_receipt' then 'transfer_receipt'
    when 'statement' then 'statement'
    else 'unknown'
  end;

  v_direction := case lower(coalesce(v_extracted->>'transaction_direction', 'unknown'))
    when 'incoming' then 'incoming'
    when 'outgoing' then 'outgoing'
    when 'internal' then 'internal'
    else 'unknown'
  end;

  v_sender_type := case lower(coalesce(v_extracted->>'sender_identifier_type', 'unknown'))
    when 'account_number' then 'account_number'
    when 'wallet_number' then 'wallet_number'
    when 'financial_line' then 'financial_line'
    when 'merchant_point' then 'merchant_point'
    when 'terminal_number' then 'terminal_number'
    when 'phone_number' then 'phone_number'
    when 'iban' then 'iban'
    when 'other' then 'other'
    else 'unknown'
  end;

  v_receiver_type := case lower(coalesce(v_extracted->>'receiver_identifier_type', 'unknown'))
    when 'account_number' then 'account_number'
    when 'wallet_number' then 'wallet_number'
    when 'financial_line' then 'financial_line'
    when 'merchant_point' then 'merchant_point'
    when 'terminal_number' then 'terminal_number'
    when 'phone_number' then 'phone_number'
    when 'iban' then 'iban'
    when 'other' then 'other'
    else 'unknown'
  end;

  v_overall_confidence := private.safe_operation_analysis_confidence(
    v_extracted->>'confidence_score',
    coalesce(new.ai_confidence_score, new.confidence_score, 0)
  );
  v_template_confidence := private.safe_operation_analysis_confidence(
    v_extracted->>'document_template_confidence',
    v_overall_confidence
  );
  v_direction_confidence := private.safe_operation_analysis_confidence(
    v_extracted->>'transaction_direction_confidence',
    v_overall_confidence
  );

  v_multiple_operations := lower(coalesce(v_extracted->>'multiple_operations_present', 'false')) in ('true','1','yes');
  v_selected_position := case
    when coalesce(v_extracted->>'selected_operation_position', '') ~ '^[0-9]+$'
      then greatest(1, least(100, (v_extracted->>'selected_operation_position')::integer))
    when v_multiple_operations then 1
    else null
  end;

  v_confidences := private.sanitize_operation_field_confidences(
    coalesce(v_extracted->'field_confidences', v_extracted->'field_confidence', '{}'::jsonb)
  );
  v_evidence := private.sanitize_operation_field_evidence(
    coalesce(v_extracted->'field_evidence', '{}'::jsonb)
  );

  new.analysis_contract_version := 2;
  new.analysis_prompt_version := v_prompt_version;
  new.analysis_completed_at := coalesce(new.analysis_completed_at, now());
  new.financial_entity := v_entity;
  new.financial_entity_code := public.resolve_financial_entity_code(v_entity);
  new.document_template := v_template;
  new.document_template_confidence := v_template_confidence;
  new.transaction_direction := v_direction;
  new.transaction_direction_confidence := v_direction_confidence;
  new.sender_name := nullif(trim(v_extracted->>'sender_name'), '');
  new.receiver_name := nullif(trim(v_extracted->>'receiver_name'), '');
  new.sender_account := private.clean_operation_analysis_identifier(v_extracted->>'sender_account');
  new.receiver_account := private.clean_operation_analysis_identifier(v_extracted->>'receiver_account');
  new.sender_identifier_type := v_sender_type;
  new.receiver_identifier_type := v_receiver_type;
  new.document_account := private.clean_operation_analysis_identifier(v_extracted->>'document_account');
  new.credited_account := private.clean_operation_analysis_identifier(v_extracted->>'credited_account');
  new.debited_account := private.clean_operation_analysis_identifier(v_extracted->>'debited_account');
  new.merchant_point := private.clean_operation_analysis_identifier(v_extracted->>'merchant_point');
  new.multiple_operations_present := v_multiple_operations;
  new.selected_operation_position := v_selected_position;
  new.field_confidences := v_confidences;
  new.field_evidence := v_evidence;
  new.routing_shadow_status := 'not_evaluated';
  new.routing_shadow_score := null;
  new.routing_shadow_business_id := null;
  new.routing_shadow_account_id := null;
  new.routing_shadow_strategy := null;
  new.routing_shadow_evaluated_at := null;

  new.structured_data := coalesce(new.structured_data, '{}'::jsonb) || jsonb_build_object(
    'analysis_contract_version', 2,
    'financial_entity_code', new.financial_entity_code,
    'document_template', new.document_template,
    'document_template_confidence', new.document_template_confidence,
    'transaction_direction', new.transaction_direction,
    'transaction_direction_confidence', new.transaction_direction_confidence,
    'sender_name', new.sender_name,
    'sender_account', new.sender_account,
    'sender_identifier_type', new.sender_identifier_type,
    'receiver_name', new.receiver_name,
    'receiver_account', new.receiver_account,
    'receiver_identifier_type', new.receiver_identifier_type,
    'document_account', new.document_account,
    'credited_account', new.credited_account,
    'debited_account', new.debited_account,
    'merchant_point', new.merchant_point,
    'multiple_operations_present', new.multiple_operations_present,
    'selected_operation_position', new.selected_operation_position,
    'field_confidences', new.field_confidences,
    'field_evidence', new.field_evidence,
    'transaction_time_present', coalesce(
      case when lower(coalesce(v_extracted->>'transaction_time_present', '')) in ('true','1','yes') then true
           when lower(coalesce(v_extracted->>'transaction_time_present', '')) in ('false','0','no') then false end,
      new.transaction_time_present
    ),
    'transaction_date_source', coalesce(nullif(trim(v_extracted->>'transaction_date_source'), ''), new.transaction_date_source)
  );

  return new;
end;
$$;

create or replace function private.run_operation_routing_shadow_after_analysis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ai_status = 'completed' and new.analysis_contract_version >= 2 then
    begin
      perform public.evaluate_operation_financial_routing_shadow(new.id);
    exception when others then
      update public.operations
      set routing_shadow_status = 'error',
          routing_shadow_evaluated_at = now(),
          updated_at = now()
      where id = new.id;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_apply_operation_analysis_contract_v2 on public.operations;
create trigger trg_apply_operation_analysis_contract_v2
before insert or update of raw_ai_json, structured_data, ai_status
on public.operations
for each row
execute function private.apply_operation_analysis_contract_v2();

drop trigger if exists trg_run_operation_routing_shadow_v2 on public.operations;
create trigger trg_run_operation_routing_shadow_v2
after insert or update of raw_ai_json, ai_status
on public.operations
for each row
when (new.ai_status = 'completed')
execute function private.run_operation_routing_shadow_after_analysis();

revoke all on function private.clean_operation_analysis_identifier(text) from public, anon, authenticated;
revoke all on function private.safe_operation_analysis_confidence(text,numeric) from public, anon, authenticated;
revoke all on function private.sanitize_operation_field_confidences(jsonb) from public, anon, authenticated;
revoke all on function private.sanitize_operation_field_evidence(jsonb) from public, anon, authenticated;
revoke all on function private.apply_operation_analysis_contract_v2() from public, anon, authenticated;
revoke all on function private.run_operation_routing_shadow_after_analysis() from public, anon, authenticated;

insert into public.ai_prompts (
  prompt_key,
  prompt_text,
  version,
  is_active,
  notes,
  created_at,
  updated_at
) values (
  'sanad_operation_extraction_v1',
  $prompt$
أنت محرك استخراج وتحليل إشعارات مالية لمنصة سند. مهمتك قراءة الملف المرفق واستخراج العملية المالية الظاهرة فقط في JSON صارم، دون Markdown أو شرح خارج JSON.

مبادئ لا يجوز تجاوزها:
- لا تخترع أي قيمة ولا تكمل رقمًا أو اسمًا من الذاكرة أو السياق الخارجي.
- أي حقل غير ظاهر أو غير محسوم اجعله null أو unknown حسب نوع الحقل.
- جميع الأرقام في المخرجات لاتينية 0-9، بما فيها الحسابات والمراجع والتاريخ والوقت.
- amount رقم فقط دون فواصل ودون رمز عملة.
- currency واحدة من YER أو SAR أو USD أو null.
- لا تدّعِ أن العملية مؤكدة بنكيًا، ولا أن الصورة سليمة قطعًا.
- confidence_score ودرجات الحقول أرقام بين 0 و1.
- لا ترفع confidence_score فوق 0.90 إذا كان المبلغ أو العملة أو الجهة أو المرجع أو اتجاه العملية غامضًا.

اكتشاف الملف المالي:
- is_financial_document=true عند وجود حوالة أو إيداع أو سحب أو دفع أو إشعار تحويل أو سجل عملية من تطبيق مالي.
- is_financial_document=false للصور العشوائية والإعلانات والمحادثات والهوية وحدها والملفات التي لا تعرض عملية مالية قابلة للاستخراج.
- عند false اجعل الحقول المالية null، واكتب non_financial_reason عربيًا باختصار.

الجهات المالية المعتمدة، ولا يجوز إخراج اسم آخر في financial_entity:
[
 "العمقي موبايل",
 "البسيري موبايل",
 "محفظة بي كاش",
 "الكريمي سعودي",
 "الكريمي يمني",
 "الكريمي حاسب",
 "بن دول صرافة",
 "بن دول باي",
 "أم فلوس",
 "عدن كاش",
 "القطيبي",
 "المحضار",
 "جهة أخرى",
 "unknown"
]
- جهة أخرى: اسم جهة ظاهر بوضوح لكنه غير موجود في القائمة؛ ضع الاسم الظاهر في financial_entity_raw.
- unknown: لا توجد قرينة كافية لتحديد الجهة.

قواعد تمييز مهمة:
1. العمقي موبايل:
- قرائن الاسم: العمقي، ALOMQY، Al Omqy، شركة العمقي، العمقي وإخوانه.
- reference_number قد يبدأ بـ 8-.
- رقم الحساب غالبًا 9 أرقام ويبدأ بـ 254، لكن لا تعتمد النمط وحده دون سياق رقم الحساب.

2. الكريمي حاسب — قاعدة ملزمة:
- Screenshot ذو واجهة بنفسجية يعرض بطاقة رصيد/حساب في الأعلى وقائمة عمليات أسفلها، مع Haseb أو Haseb Payment أو Payment Hub أو حاسب، يصنف financial_entity="الكريمي حاسب".
- اللون البنفسجي وحده لا يكفي؛ يجب وجود قرائن مالية أو نصية داعمة.
- إذا ظهرت واجهة كريمي دون Haseb/حاسب: اختر الكريمي يمني عند YER، والكريمي سعودي عند SAR، وunknown عند غياب العملة.
- مرجع الكريمي قد يبدأ FT؛ حافظ على الحروف والأرقام كما تظهر.

3. بقية الجهات:
- البسيري => البسيري موبايل.
- B-Cash أو بي كاش => محفظة بي كاش.
- بن دول باي => بن دول باي، وبن دول كصرافة أو حوالة دون باي => بن دول صرافة.
- أم فلوس، عدن كاش، القطيبي، المحضار: اختر الاسم المطابق عند ظهوره.

قواعد القالب واختيار العملية:
- document_template واحدة من:
  single_receipt | transaction_list | account_history | wallet_receipt | transfer_receipt | statement | unknown
- إذا كانت الصورة تعرض عدة عمليات، multiple_operations_present=true، واستخرج العملية العلوية/الأحدث فقط، selected_operation_position=1.
- لا تخلط مبلغ أو مرجع أو اسمًا من بطاقة مع حساب أو وقت من بطاقة أخرى.
- بطاقة الرصيد أو الحساب أعلى شاشة كريمي ليست عملية مالية بحد ذاتها.
- document_account هو رقم الحساب الظاهر في رأس المستند أو بطاقة الرصيد أو الحساب، وليس reference_number.

قواعد الأدوار والاتجاه:
- transaction_direction يصف اتجاه العملية بالنسبة إلى صاحب المستند أو document_account:
  incoming: المبلغ وصل إلى حساب صاحب المستند.
  outgoing: المبلغ خرج من حساب صاحب المستند.
  internal: انتقال بين حسابات صاحب المستند.
  unknown: النص لا يحسم الاتجاه.
- لا تستنتج الاتجاه من كلمة دفع أو إيداع وحدها دون فهم الجملة والبنية.
- sender_name/account للجهة التي خرج منها المبلغ صراحة.
- receiver_name/account للجهة التي وصل إليها المبلغ صراحة.
- credited_account يملأ فقط عندما يظهر الحساب الدائن أو الحساب الذي استقبل القيد صراحة.
- debited_account يملأ فقط عندما يظهر الحساب المدين أو الحساب الذي خرج منه القيد صراحة.
- merchant_point هو رقم نقطة حاسب/التاجر/POS الظاهر صراحة فقط. لا تملأه بمجرد ظهور كلمة Haseb.
- لا تكرر رقم رأس الشاشة تلقائيًا في receiver_account أو credited_account؛ استخدم document_account له ما لم يربطه نص العملية صراحة بالدائن أو المستلم.

sender_identifier_type وreceiver_identifier_type من:
account_number | wallet_number | financial_line | merchant_point | terminal_number | phone_number | iban | other | unknown

نوع العملية transaction_type من:
transfer | deposit | withdrawal | payment | unknown | null
- تحويل/حوالة/إرسال => transfer.
- إيداع => deposit.
- سحب => withdrawal.
- دفع/سداد/Haseb Payment => payment.
- عملية مالية غير محسومة => unknown.

التاريخ والوقت:
- افحص المستند كاملًا، بما في ذلك تذييله، ولا تستخدم وقت شريط حالة الهاتف.
- عند وجود عدة تواريخ اختر المرتبط مباشرة ببيانات العملية أو كلمة التاريخ/Date، ولا تعتبر صيغتين لليوم نفسه تعارضًا.
- إذا لم يظهر وقت صريح: transaction_datetime بصيغة YYYY-MM-DD فقط وtransaction_time_present=false.
- إذا ظهر وقت يمني محلي: أعد YYYY-MM-DDTHH:mm:ss+03:00 وtransaction_time_present=true.
- حوّل صيغة 12 ساعة بدقة: 08:41 PM = 20:41:00+03:00.
- إذا تعذر قراءة AM/PM لا تخمن؛ أعد التاريخ فقط وأضف ambiguous_time_meridiem.
- transaction_date_source واحدة من labeled_date أو single_visible_date أو document_footer أو explicit_datetime أو null.

الثقة والدليل:
- field_confidences كائن يضع درجة مستقلة لكل حقل مستخرج فعليًا.
- field_evidence كائن يحتوي وصفًا قصيرًا للدليل المرئي: اسم التسمية، النص المجاور، أو موضعه؛ لا تكرر شرحًا طويلًا.
- الحقل غير الظاهر لا تمنحه دليلًا ولا درجة مرتفعة.
- visual_integrity_notes تصف القص أو التشويش أو صعوبة القراءة أو قرائن تعديل محتملة بلغة حذرة.
- sanad_attention_points نقاط عملية للمتَحقق البشري.

أعد JSON مطابقًا لهذا الهيكل وبنفس أسماء الحقول:
{
  "is_financial_document": true,
  "non_financial_reason": null,
  "summary": "ملخص عربي واضح من جملتين إلى أربع جمل.",
  "financial_entity": "unknown",
  "financial_entity_raw": null,
  "document_template": "unknown",
  "document_template_confidence": 0.0,
  "transaction_type": "unknown",
  "transaction_direction": "unknown",
  "transaction_direction_confidence": 0.0,
  "amount": null,
  "currency": null,
  "sender_name": null,
  "sender_account": null,
  "sender_identifier_type": "unknown",
  "receiver_name": null,
  "receiver_account": null,
  "receiver_identifier_type": "unknown",
  "document_account": null,
  "credited_account": null,
  "debited_account": null,
  "merchant_point": null,
  "reference_number": null,
  "transaction_datetime": null,
  "transaction_time_present": false,
  "transaction_date_source": null,
  "multiple_operations_present": false,
  "selected_operation_position": null,
  "confidence_score": 0.0,
  "field_confidences": {
    "financial_entity": 0.0,
    "document_template": 0.0,
    "transaction_type": 0.0,
    "transaction_direction": 0.0,
    "amount": 0.0,
    "currency": 0.0,
    "sender_name": 0.0,
    "sender_account": 0.0,
    "receiver_name": 0.0,
    "receiver_account": 0.0,
    "document_account": 0.0,
    "credited_account": 0.0,
    "debited_account": 0.0,
    "merchant_point": 0.0,
    "reference_number": 0.0,
    "transaction_datetime": 0.0
  },
  "field_evidence": {
    "financial_entity": null,
    "document_template": null,
    "transaction_type": null,
    "transaction_direction": null,
    "amount": null,
    "currency": null,
    "sender_name": null,
    "sender_account": null,
    "receiver_name": null,
    "receiver_account": null,
    "document_account": null,
    "credited_account": null,
    "debited_account": null,
    "merchant_point": null,
    "reference_number": null,
    "transaction_datetime": null
  },
  "possible_fraud": false,
  "ai_flags": [],
  "missing_fields": [],
  "visual_integrity_notes": [],
  "sanad_attention_points": []
}

قبل الإخراج راجع أن العملية المختارة واحدة فقط، وأن رقم الحساب والمرجع ونقطة حاسب لم تختلط أدوارها، ثم أعد JSON فقط.
$prompt$,
  5,
  true,
  'Analysis contract v2: explicit template, direction, account roles, merchant point, per-field confidence/evidence, and routing-shadow readiness.',
  now(),
  now()
)
on conflict (prompt_key) do update
set prompt_text = excluded.prompt_text,
    version = excluded.version,
    is_active = true,
    notes = excluded.notes,
    updated_at = now();

update public.ai_prompts
set prompt_text = replace(
      replace(
        replace(
          prompt_text,
          '## قواعد دلالية خاصة بالعمقي موبايل',
          '## قواعد دلالية للهوية الشخصية والحسابات المالية'
        ),
        '- في إشعارات العمقي، النص «بط» أو «بطاقة» أو «هوية» الملاصق للرقم يعني national_id. لا تصنّف هذا الرقم account_number ولا تجعله isPrimaryRoutingIdentifier=true إذا ظهر رقم حساب صريح للمستفيد.',
        '- النص «بط» أو «بطاقة» أو «هوية» الملاصق للرقم يعني national_id بغض النظر عن الجهة المالية التي أصدرت الإشعار. لا تصنّف هذا الرقم account_number ولا تجعله isPrimaryRoutingIdentifier=true إذا ظهر رقم حساب صريح للطرف نفسه.'
      ),
      '- البادئتان 080 و663 قرينتان قويتان لهوية/بطاقة العمقي عندما تكونان بجوار «بط» أو «بطاقة» أو «هوية». البادئة وحدها ليست قاعدة حاسمة إذا كان الحقل مسمى صراحة «رقم الحساب».',
      '- البادئتان 080 و663 قرينتان مساندتان على أن الرقم هو هوية شخصية/بطاقة وطنية يمنية، وقد يظهر هذا الرقم في إشعار صادر عن العمقي أو أي جهة مالية أخرى. لا تربط هاتين البادئتين بجهة مالية بعينها. البادئة وحدها ليست قاعدة حاسمة؛ تسمية الحقل والسياق البصري أقوى.'
    ),
    version = greatest(version,17) + 1,
    notes = trim(both from concat_ws(E'\n', nullif(notes,''), 'v18 hotfix: corrected scope after v17 replacement mismatch; 080/663 are cross-entity personal-ID evidence.')),
    updated_at = now()
where prompt_key='sanad_operation_extraction_operational_v2_shadow';

const _warningMessages = <String, String>{
  'critical_field_unresolved': 'بعض البيانات الأساسية غير واضحة. راجع المبلغ والعملة والمرجع.',
  'semantic_confidence_below_automatic_threshold': 'نتيجة التحليل تحتاج مراجعة سريعة قبل الاعتماد.',
  'ocr_confidence_below_automatic_threshold': 'قراءة المستند غير واضحة بما يكفي. قارن البيانات بالمستند الأصلي.',
  'financial_entity_unresolved': 'تعذر تحديد الجهة المالية بثقة.',
  'identifier_rejected_not_supported_by_ocr_evidence': 'استُبعد رقم لم يظهر بوضوح في المستند.',
  'model_review_required': 'يوصي التحليل بمراجعة هذه العملية.',
  'overall_confidence_below_threshold': 'الثقة العامة منخفضة وتحتاج العملية إلى مراجعة.',
  'receiver_identifier_missing': 'لم يُعثر على معرّف واضح للمستلم.',
  'receiver_identifier_type_missing': 'نوع رقم المستلم غير واضح.',
  'receiver_identifier_type_not_routable': 'رقم المستلم الظاهر غير مناسب للمطابقة التلقائية.',
  'receiver_identifier_confidence_below_threshold': 'رقم المستلم يحتاج تحققًا يدويًا.',
  'receiver_identifier_matches_sender': 'رقم المستلم يطابق رقم المرسل؛ راجع طرفي العملية.',
  'transaction_time_missing_or_unresolved': 'وقت العملية غير واضح في المستند.',
  'transaction_date_missing_or_unresolved': 'تاريخ العملية غير واضح في المستند.',
  'template_anchor_confidence_reduced': 'لم تتضح جميع علامات قالب المستند.',
  'receiver_card_equals_receiver_account': 'رقم البطاقة ورقم الحساب متطابقان على نحو يحتاج مراجعة.',
  'sender_identity_equals_sender_account': 'رقم هوية المرسل ورقم حسابه متطابقان على نحو يحتاج مراجعة.',
  'sender_and_receiver_accounts_are_equal': 'حساب المرسل والمستلم متطابقان؛ راجع العملية.',
  'debited_and_credited_accounts_are_equal': 'الحساب المخصوم والمضاف إليه متطابقان؛ راجع العملية.',
  'document_account_does_not_match_debited_account': 'رقم الحساب في رأس المستند لا يطابق الحساب المخصوم.',
  'multiple_amount_candidates': 'يحتوي المستند على أكثر من مبلغ محتمل؛ تحقق من المبلغ الأساسي.',
  'multiple_reference_candidates': 'يحتوي المستند على أكثر من رقم مرجعي محتمل؛ تحقق من المرجع.',
  'deterministic_partial_extraction': 'استُخرجت بعض البيانات محليًا، وما زالت الحقول الناقصة تحتاج مراجعة.',
  'local_ocr_insufficient': 'قراءة المستند محليًا غير كافية للتحليل التلقائي.',
};

String localizedWarning(String code) =>
    _warningMessages[code] ?? 'توجد ملاحظة على نتيجة التحليل. قارن البيانات بالمستند الأصلي.';

String localizedTransactionType(String? type) => switch (type) {
      'deposit' => 'إيداع',
      'withdrawal' => 'سحب',
      'transfer' || 'account_transfer' => 'تحويل',
      'payment' => 'دفع',
      'credit_notice' => 'إشعار دائن',
      _ => 'غير محدد',
    };

String localizedCurrency(String? currency) => switch (currency) {
      'YER' => 'ريال يمني',
      'SAR' => 'ريال سعودي',
      'USD' => 'دولار أمريكي',
      _ => 'عملة غير محددة',
    };

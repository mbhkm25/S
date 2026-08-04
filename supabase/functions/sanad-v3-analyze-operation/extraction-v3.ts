export type ExtractionRecord = Record<string, unknown>;

export type CoreExtractionAssessment = {
  complete: boolean;
  score: number;
  confidence: number;
  required: string[];
  missing: string[];
  escalationReasons: string[];
};

export const EXTRACTION_PIPELINE_VERSION = 'operation-extraction-v3.1';

const BASE_REQUIRED_FIELDS = [
  'financial_entity',
  'amount',
  'currency',
  'transaction_type',
] as const;

const RECEIPT_REQUIRED_FIELDS = [
  'receiver_name',
  'receiver_account',
  'reference_number',
  'transaction_datetime',
] as const;

export const CORE_EXTRACTION_FIELDS = [
  ...BASE_REQUIRED_FIELDS,
  ...RECEIPT_REQUIRED_FIELDS,
] as const;

export const REFERENCE_600_GROUND_TRUTH = Object.freeze({
  amount: 600,
  currency: 'SAR',
  receiver_name: 'محمد عبدالله عمر باحكم',
  receiver_account: '254073867',
  reference_number: '8-226242876',
  transaction_type: 'deposit',
  transaction_datetime: '2026-05-14T20:04:00',
});

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function isMissing(value: unknown): boolean {
  const normalized = clean(value).toLowerCase();
  return value === null || value === undefined || normalized === '' || normalized === 'unknown' || normalized === 'null';
}

function comparable(value: unknown): string {
  return clean(value)
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function confidenceFor(record: ExtractionRecord, field?: string): number {
  const fieldMap = record.field_confidences && typeof record.field_confidences === 'object'
    ? record.field_confidences as Record<string, unknown>
    : {};
  const direct = field ? Number(fieldMap[field]) : Number(record.confidence_score);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 1) return direct;
  return 0;
}

function requiredFieldsFor(record: ExtractionRecord): string[] {
  const template = clean(record.document_template);
  const transactionType = clean(record.transaction_type);
  const direction = clean(record.transaction_direction);
  const receiptLike = [
    'single_receipt',
    'wallet_receipt',
    'transfer_receipt',
  ].includes(template) || ['deposit', 'transfer', 'payment', 'withdrawal'].includes(transactionType) || ['incoming', 'outgoing'].includes(direction);

  return receiptLike
    ? [...BASE_REQUIRED_FIELDS, ...RECEIPT_REQUIRED_FIELDS]
    : [...BASE_REQUIRED_FIELDS];
}

export function stripJsonFences(value: string): string {
  return clean(value)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function repairJsonSyntaxSafely(value: string): { text: string; mode: string | null } {
  let text = stripJsonFences(value);
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) text = text.slice(objectStart, objectEnd + 1);
  const before = text;

  text = text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  let quoted = false;
  let escaped = false;
  let output = '';
  for (const character of text) {
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      output += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      output += character;
      continue;
    }
    if (quoted && (character === '\n' || character === '\r')) {
      output += '\\n';
      continue;
    }
    output += character;
  }

  return { text: output, mode: output === before ? null : 'bounded_syntax_repair' };
}

export function parseStructuredJson(value: string): { value: ExtractionRecord; repairMode: string | null } {
  const direct = stripJsonFences(value);
  try {
    return { value: JSON.parse(direct), repairMode: null };
  } catch {
    const repaired = repairJsonSyntaxSafely(direct);
    return { value: JSON.parse(repaired.text), repairMode: repaired.mode };
  }
}

export function buildSyntaxRetryInstruction(error: unknown): string {
  return [
    'أعد نفس النتيجة فقط بصيغة JSON صالحة نحويًا وفق المخطط المحدد.',
    'لا تعِد تحليل المستند ولا تغيّر أي قيمة مالية.',
    'لا تضف شرحًا أو Markdown أو code fences.',
    `سبب الرفض النحوي: ${clean(error).slice(0, 240)}`,
  ].join('\n');
}

export function buildSyntaxRetryPrompt(basePrompt: string): string {
  return `${basePrompt}\n${buildSyntaxRetryInstruction('invalid_json')}`;
}

export function assessCoreExtraction(record: ExtractionRecord): CoreExtractionAssessment {
  const required = requiredFieldsFor(record);
  const missing = required.filter((field) => isMissing(record[field]));
  const score = (required.length - missing.length) / required.length;
  const fieldConfidences = required
    .filter((field) => !isMissing(record[field]))
    .map((field) => confidenceFor(record, field))
    .filter((value) => value > 0);
  const overall = confidenceFor(record);
  const confidence = overall > 0
    ? overall
    : fieldConfidences.length
      ? fieldConfidences.reduce((sum, value) => sum + value, 0) / fieldConfidences.length
      : score;
  const escalationReasons: string[] = [];

  if (missing.length) escalationReasons.push(`missing_core_fields:${missing.join(',')}`);
  if (!Number.isFinite(confidence) || confidence < 0.82) escalationReasons.push('low_overall_confidence');
  if (record.multiple_operations_present === true) escalationReasons.push('multiple_operations');
  if (clean(record.financial_entity) === 'unknown' || clean(record.document_template) === 'unknown') {
    escalationReasons.push('unknown_template_or_entity');
  }
  if (Array.isArray(record.ai_flags) && record.ai_flags.some((flag) => /conflict|ambiguous|identifier/i.test(clean(flag)))) {
    escalationReasons.push('identifier_conflict');
  }

  return {
    complete: missing.length === 0 && confidence >= 0.82,
    score,
    confidence,
    required,
    missing,
    escalationReasons,
  };
}

export function coreExtractionScore(record: ExtractionRecord): number {
  return assessCoreExtraction(record).score;
}

export function shouldEscalateExtraction(record: ExtractionRecord): boolean {
  return assessCoreExtraction(record).escalationReasons.length > 0;
}

export function buildExtractionV3Rules(): string {
  return buildDeterministicCandidateRules().join('\n');
}

export function buildDeterministicCandidateRules(): string[] {
  return [
    'لا تخترع أي قيمة غير ظاهرة في المستند.',
    'اقرأ المستند كاملًا، لكن اختر عملية مالية واحدة فقط عند وجود عملية واحدة واضحة.',
    'القيمة المحاطة بعلامتي # والمجاورة لوصف المبلغ مرشح مبلغ قوي.',
    'كلمة سعودي أو ريال سعودي تطبع إلى SAR، ويمني إلى YER، ودولار إلى USD.',
    'الرقم المسمى المرجع أو رقم الإشعار هو reference_number، وليس حساب المستلم.',
    'حساب المستلم يفضّل من عبارة إلى حساب أو حساب المستفيد أو رقم الحساب المرتبط باسم المستلم.',
    'اسم المستلم هو الاسم المرتبط مباشرة بحساب المستفيد أو بعبارة تم الإيداع إلى حساب.',
    'لا تستخدم رقم جواز أو بطاقة أو هوية أو حساب المرسل كحساب المستلم.',
    'transaction_type يجب أن يكون transfer أو deposit أو withdrawal أو payment فقط.',
    'transaction_datetime يجب أن يكون ISO-8601 محليًا بصيغة YYYY-MM-DDTHH:mm:ss عند ظهور التاريخ والوقت.',
    'استخدم null عند عدم وجود دليل بصري، وسجل الدليل والثقة لكل حقل.',
  ];
}

export function benchmarkAgainstReference600(record: ExtractionRecord) {
  const expected = REFERENCE_600_GROUND_TRUTH;
  const checks = {
    amount: Number(record.amount) === expected.amount,
    currency: clean(record.currency).toUpperCase() === expected.currency,
    receiver_name: comparable(record.receiver_name) === comparable(expected.receiver_name),
    receiver_account: comparable(record.receiver_account) === expected.receiver_account,
    reference_number: comparable(record.reference_number) === expected.reference_number,
    transaction_type: comparable(record.transaction_type) === expected.transaction_type,
    transaction_datetime: comparable(record.transaction_datetime).startsWith('2026-05-14t20:04'),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    fixture: '600.pdf',
    passed,
    total: Object.keys(checks).length,
    score: passed / Object.keys(checks).length,
    checks,
  };
}

export function reconcileExtraction(primary: ExtractionRecord, escalation?: ExtractionRecord | null) {
  const primaryAssessment = assessCoreExtraction(primary);
  if (!escalation) {
    return {
      selected: primary,
      source: 'primary',
      conflicts: [],
      unresolvedConflicts: [],
      primaryAssessment,
      finalAssessment: primaryAssessment,
      reviewRequired: !primaryAssessment.complete,
    };
  }

  const escalationAssessment = assessCoreExtraction(escalation);
  const selected: ExtractionRecord = {
    ...primary,
    field_confidences: {
      ...((primary.field_confidences as Record<string, unknown>) || {}),
      ...((escalation.field_confidences as Record<string, unknown>) || {}),
    },
    field_evidence: {
      ...((primary.field_evidence as Record<string, unknown>) || {}),
      ...((escalation.field_evidence as Record<string, unknown>) || {}),
    },
  };
  const conflicts: Array<{ field: string; primary: unknown; escalation: unknown; selected: unknown }> = [];
  const unresolvedConflicts: string[] = [];
  const candidateFields = new Set([...Object.keys(primary), ...Object.keys(escalation)]);

  for (const field of candidateFields) {
    if (field === 'field_confidences' || field === 'field_evidence') continue;
    const first = primary[field];
    const second = escalation[field];
    if (isMissing(first) && !isMissing(second)) {
      selected[field] = second;
      continue;
    }
    if (isMissing(second)) continue;
    if (comparable(first) === comparable(second)) continue;

    const firstConfidence = confidenceFor(primary, field);
    const secondConfidence = confidenceFor(escalation, field);
    const chooseEscalation = secondConfidence >= firstConfidence + 0.08 || isMissing(first);
    selected[field] = chooseEscalation ? second : first;
    conflicts.push({ field, primary: first, escalation: second, selected: selected[field] });

    if (CORE_EXTRACTION_FIELDS.includes(field as typeof CORE_EXTRACTION_FIELDS[number])) {
      const confidenceGap = Math.abs(secondConfidence - firstConfidence);
      if (confidenceGap < 0.15 || Math.max(firstConfidence, secondConfidence) < 0.88) {
        unresolvedConflicts.push(field);
      }
    }
  }

  const selectedConfidence = Math.max(
    confidenceFor(primary),
    confidenceFor(escalation),
    primaryAssessment.confidence,
    escalationAssessment.confidence,
  );
  selected.confidence_score = selectedConfidence;
  const finalAssessment = assessCoreExtraction(selected);

  return {
    selected,
    source: 'reconciled',
    conflicts,
    unresolvedConflicts,
    primaryAssessment,
    escalationAssessment,
    finalAssessment,
    reviewRequired: !finalAssessment.complete || unresolvedConflicts.length > 0,
  };
}

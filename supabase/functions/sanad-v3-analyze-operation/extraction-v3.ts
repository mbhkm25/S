export type ExtractionRecord = Record<string, unknown>;

export type CoreExtractionAssessment = {
  complete: boolean;
  score: number;
  missing: string[];
  escalationReasons: string[];
};

export const EXTRACTION_PIPELINE_VERSION = 'operation-extraction-v3';
export const PRIMARY_EXTRACTION_MODEL = 'gemini-3.6-flash';
export const ESCALATION_EXTRACTION_MODEL = 'gemini-2.5-pro';
export const CORE_EXTRACTION_FIELDS = [
  'financial_entity',
  'amount',
  'currency',
  'receiver_account',
  'reference_number',
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
  const missing = CORE_EXTRACTION_FIELDS.filter((field) => {
    const value = record[field];
    return value === null || value === undefined || clean(value) === '' || clean(value) === 'unknown';
  });
  const score = (CORE_EXTRACTION_FIELDS.length - missing.length) / CORE_EXTRACTION_FIELDS.length;
  const confidence = Number(record.confidence_score ?? 0);
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
    missing,
    escalationReasons,
  };
}

export function coreExtractionScore(record: ExtractionRecord): number {
  return assessCoreExtraction(record).score * CORE_EXTRACTION_FIELDS.length;
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
    'القيمة المحاطة بعلامتي # والمجاورة لوصف المبلغ مرشح مبلغ قوي.',
    'كلمة سعودي أو ريال سعودي تطبع إلى SAR.',
    'الرقم المسمى المرجع أو رقم الإشعار هو المرجع، وليس حساب المستلم.',
    'حساب المستلم يفضّل من عبارة إلى حساب أو رقم الحساب المرتبط باسم المستلم.',
    'لا تستخدم رقم جواز أو بطاقة أو هوية أو حساب المرسل كحساب المستلم.',
    'في ملف 600 المرجعي، 254073867 هو حساب المستلم و8-226242876 هو المرجع.',
    'استخدم null عند عدم اليقين وسجل الدليل والثقة لكل حقل.',
  ];
}

export function benchmarkAgainstReference600(record: ExtractionRecord) {
  const expected = REFERENCE_600_GROUND_TRUTH;
  const checks = {
    amount: Number(record.amount) === expected.amount,
    currency: clean(record.currency).toUpperCase() === expected.currency,
    receiver_name: clean(record.receiver_name).replace(/\s+/g, ' ') === expected.receiver_name,
    receiver_account: clean(record.receiver_account) === expected.receiver_account,
    reference_number: clean(record.reference_number) === expected.reference_number,
    transaction_type: clean(record.transaction_type) === expected.transaction_type,
    transaction_datetime: clean(record.transaction_datetime).startsWith('2026-05-14T20:04'),
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
  if (!escalation) {
    return {
      selected: primary,
      source: 'primary',
      conflicts: [],
      primaryAssessment: assessCoreExtraction(primary),
    };
  }

  const conflicts: Array<{ field: string; primary: unknown; escalation: unknown }> = [];
  for (const field of CORE_EXTRACTION_FIELDS) {
    const first = primary[field];
    const second = escalation[field];
    if (first != null && second != null && clean(first) !== clean(second)) {
      conflicts.push({ field, primary: first, escalation: second });
    }
  }

  const primaryAssessment = assessCoreExtraction(primary);
  const escalationAssessment = assessCoreExtraction(escalation);
  const selected = escalationAssessment.score > primaryAssessment.score ? escalation : primary;

  return {
    selected,
    source: selected === escalation ? 'escalation' : 'primary',
    conflicts,
    primaryAssessment,
    escalationAssessment,
    reviewRequired: conflicts.length > 0,
  };
}

export type ExtractionRecord = Record<string, unknown>;

export type PartyIdentifierType =
  | 'financial_account_number'
  | 'unique_account_name'
  | 'national_id'
  | 'passport_number'
  | 'wallet_number'
  | 'phone_number'
  | 'unknown_identifier';

export type PartyIdentifier = {
  type: PartyIdentifierType;
  value: string;
  label: string | null;
  financial_entity: string | null;
  confidence: number;
  evidence: string | null;
};

export type ExtractedParty = {
  name: string | null;
  role: string;
  identifiers: PartyIdentifier[];
};

export type CoreExtractionAssessment = {
  complete: boolean;
  score: number;
  confidence: number;
  required: string[];
  missing: string[];
  escalationReasons: string[];
  selectedIdentifier: PartyIdentifier | null;
  uniqueIdentifierCount: number;
};

export const EXTRACTION_PIPELINE_VERSION = 'operation-extraction-v3.2';

const BASE_REQUIRED_FIELDS = [
  'financial_entity',
  'amount',
  'currency',
  'transaction_type',
] as const;

const RECEIPT_REQUIRED_FIELDS = [
  'receiver_name',
  'reference_number',
  'transaction_datetime',
] as const;

export const CORE_EXTRACTION_FIELDS = [
  ...BASE_REQUIRED_FIELDS,
  ...RECEIPT_REQUIRED_FIELDS,
] as const;

const IDENTIFIER_PRIORITY: PartyIdentifierType[] = [
  'financial_account_number',
  'unique_account_name',
  'national_id',
  'passport_number',
  'wallet_number',
  'phone_number',
];

const MATCHABLE_IDENTIFIER_TYPES = new Set<PartyIdentifierType>([
  'financial_account_number',
  'unique_account_name',
  'national_id',
  'passport_number',
  'wallet_number',
  'phone_number',
]);

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

function numericIdentifier(value: unknown): string {
  return comparable(value).replace(/[^0-9a-z]/g, '');
}

function confidenceFor(record: ExtractionRecord, field?: string): number {
  const fieldMap = record.field_confidences && typeof record.field_confidences === 'object'
    ? record.field_confidences as Record<string, unknown>
    : {};
  const direct = field ? Number(fieldMap[field]) : Number(record.confidence_score);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 1) return direct;
  return 0;
}

function normalizeIdentifierType(value: unknown): PartyIdentifierType {
  const type = clean(value) as PartyIdentifierType;
  return MATCHABLE_IDENTIFIER_TYPES.has(type) || type === 'unknown_identifier'
    ? type
    : 'unknown_identifier';
}

function normalizeIdentifier(value: unknown, inheritedEntity: string | null): PartyIdentifier | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = normalizeIdentifierType(raw.type);
  const normalizedValue = numericIdentifier(raw.value);
  if (!normalizedValue) return null;
  const label = clean(raw.label) || null;
  const evidence = clean(raw.evidence) || null;
  const financialEntity = clean(raw.financial_entity) || inheritedEntity;
  const confidence = Number(raw.confidence);
  return {
    type,
    value: normalizedValue,
    label,
    financial_entity: financialEntity,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    evidence,
  };
}

export function extractParties(record: ExtractionRecord): ExtractedParty[] {
  const entity = clean(record.financial_entity) || null;
  const source = Array.isArray(record.parties) ? record.parties : [];
  const parties = source
    .filter((party) => party && typeof party === 'object' && !Array.isArray(party))
    .map((party) => {
      const raw = party as Record<string, unknown>;
      const identifiers = (Array.isArray(raw.identifiers) ? raw.identifiers : [])
        .map((identifier) => normalizeIdentifier(identifier, entity))
        .filter((identifier): identifier is PartyIdentifier => Boolean(identifier));
      return {
        name: clean(raw.name) || null,
        role: clean(raw.role) || 'unknown',
        identifiers,
      };
    });

  if (parties.length > 0) return parties;

  const compatibilityIdentifiers: PartyIdentifier[] = [];
  const receiverAccount = numericIdentifier(record.receiver_account);
  if (receiverAccount) {
    compatibilityIdentifiers.push({
      type: 'financial_account_number',
      value: receiverAccount,
      label: 'رقم الحساب',
      financial_entity: entity,
      confidence: confidenceFor(record, 'receiver_account'),
      evidence: clean((record.field_evidence as Record<string, unknown> | undefined)?.receiver_account) || null,
    });
  }
  return [{
    name: clean(record.receiver_name) || null,
    role: 'credited_party',
    identifiers: compatibilityIdentifiers,
  }];
}

function targetParty(record: ExtractionRecord): ExtractedParty | null {
  const parties = extractParties(record);
  return parties.find((party) => ['credited_party', 'receiver', 'beneficiary'].includes(party.role))
    ?? parties.find((party) => party.identifiers.length > 0)
    ?? null;
}

export function selectPreferredIdentifier(record: ExtractionRecord): PartyIdentifier | null {
  const party = targetParty(record);
  if (!party) return null;
  const entity = clean(record.financial_entity);
  const candidates = party.identifiers
    .filter((identifier) => MATCHABLE_IDENTIFIER_TYPES.has(identifier.type))
    .filter((identifier) => !identifier.financial_entity || !entity || comparable(identifier.financial_entity) === comparable(entity))
    .sort((left, right) => {
      const priority = IDENTIFIER_PRIORITY.indexOf(left.type) - IDENTIFIER_PRIORITY.indexOf(right.type);
      if (priority !== 0) return priority;
      return right.confidence - left.confidence;
    });
  return candidates[0] ?? null;
}

function identifierConflicts(record: ExtractionRecord): string[] {
  const party = targetParty(record);
  if (!party) return [];
  const byType = new Map<string, Set<string>>();
  for (const identifier of party.identifiers) {
    if (!MATCHABLE_IDENTIFIER_TYPES.has(identifier.type)) continue;
    const key = `${comparable(identifier.financial_entity || record.financial_entity)}:${identifier.type}`;
    const values = byType.get(key) ?? new Set<string>();
    values.add(identifier.value);
    byType.set(key, values);
  }
  return [...byType.entries()].filter(([, values]) => values.size > 1).map(([key]) => key);
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
    ? [...BASE_REQUIRED_FIELDS, ...RECEIPT_REQUIRED_FIELDS, 'unique_party_identifier']
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
  const selectedIdentifier = selectPreferredIdentifier(record);
  const missing = required.filter((field) => field === 'unique_party_identifier'
    ? !selectedIdentifier
    : isMissing(record[field]));
  const score = (required.length - missing.length) / required.length;
  const confidenceFields = required.filter((field) => field !== 'unique_party_identifier');
  const fieldConfidences = confidenceFields
    .filter((field) => !isMissing(record[field]))
    .map((field) => confidenceFor(record, field))
    .filter((value) => value > 0);
  if (selectedIdentifier?.confidence) fieldConfidences.push(selectedIdentifier.confidence);
  const overall = confidenceFor(record);
  const confidence = overall > 0
    ? overall
    : fieldConfidences.length
      ? fieldConfidences.reduce((sum, value) => sum + value, 0) / fieldConfidences.length
      : score;
  const escalationReasons: string[] = [];
  const conflicts = identifierConflicts(record);
  const selectedType = selectedIdentifier?.type ?? null;
  const selectedValue = selectedIdentifier?.value ?? '';
  const receiverScalar = numericIdentifier(record.receiver_account);
  const receiverEvidence = comparable((record.field_evidence as Record<string, unknown> | undefined)?.receiver_account);
  const identityOnlyReceiver = Boolean(selectedIdentifier)
    && ['national_id', 'passport_number'].includes(selectedType || '')
    && (receiverScalar === selectedValue || /(^|\s)(بط|بطاقة|هوية|ج|جواز)(\s|$)/.test(receiverEvidence));

  if (missing.length) escalationReasons.push(`missing_core_fields:${missing.join(',')}`);
  if (!selectedIdentifier) escalationReasons.push('no_unique_financial_identifier');
  if (!Number.isFinite(confidence) || confidence < 0.82) escalationReasons.push('low_overall_confidence');
  if (record.multiple_operations_present === true) escalationReasons.push('multiple_operations');
  if (clean(record.financial_entity) === 'unknown' || clean(record.document_template) === 'unknown') {
    escalationReasons.push('unknown_template_or_entity');
  }
  if (conflicts.length > 0) escalationReasons.push('financial_identity_conflict');
  if (identityOnlyReceiver) escalationReasons.push('identity_only_receiver_requires_account_recovery');
  if (Array.isArray(record.ai_flags) && record.ai_flags.some((flag) => /conflict|ambiguous|identifier/i.test(clean(flag)))) {
    escalationReasons.push('identifier_conflict');
  }

  return {
    complete: missing.length === 0 && confidence >= 0.82 && conflicts.length === 0 && !identityOnlyReceiver,
    score,
    confidence,
    required,
    missing,
    escalationReasons: [...new Set(escalationReasons)],
    selectedIdentifier,
    uniqueIdentifierCount: targetParty(record)?.identifiers.filter((identifier) => MATCHABLE_IDENTIFIER_TYPES.has(identifier.type)).length ?? 0,
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
    'أعد parties لكل طرف، ولكل طرف identifiers متعددة بدل ضغط الهوية في receiver_account فقط.',
    'مفتاح المطابقة هو financial_entity + identifier_type + identifier_value.',
    'رتب معرفات الطرف المستهدف: financial_account_number ثم unique_account_name ثم national_id ثم passport_number ثم wallet_number ثم phone_number.',
    'بط أو بطاقة قبل الرقم تعني national_id ولا يجوز تصنيف الرقم حسابًا ماليًا.',
    'ج أو جواز قبل الرقم تعني passport_number ولا يجوز تصنيف الرقم حسابًا ماليًا.',
    'البادئتان 080 و663 قرينة مساندة للبطاقة وليستا قاعدة حاسمة منفردة.',
    'النص الملاصق للرقم أقوى من تخمين نوعه أو دوره.',
    'القيمة المحاطة بعلامتي # والمجاورة لوصف المبلغ مرشح مبلغ قوي.',
    'كلمة سعودي أو ريال سعودي تطبع إلى SAR، ويمني إلى YER، ودولار إلى USD.',
    'الرقم المسمى المرجع أو رقم الإشعار هو reference_number، وليس معرف الطرف.',
    'لا تستخدم رقم جواز أو بطاقة أو هوية أو هاتف أو مرجع كحساب مالي.',
    'وجود معرفين فريدين متعارضين يوجب review_required ولا يحسم بالنقاط.',
    'transaction_type يجب أن يكون transfer أو deposit أو withdrawal أو payment فقط.',
    'transaction_datetime يجب أن يكون ISO-8601 محليًا بصيغة YYYY-MM-DDTHH:mm:ss عند ظهور التاريخ والوقت.',
    'استخدم null عند عدم وجود دليل بصري، وسجل الدليل والثقة لكل حقل ومعرف.',
  ];
}

export function benchmarkAgainstReference600(record: ExtractionRecord) {
  const expected = REFERENCE_600_GROUND_TRUTH;
  const selectedIdentifier = selectPreferredIdentifier(record);
  const checks = {
    amount: Number(record.amount) === expected.amount,
    currency: clean(record.currency).toUpperCase() === expected.currency,
    receiver_name: comparable(record.receiver_name) === comparable(expected.receiver_name)
      || comparable(targetParty(record)?.name) === comparable(expected.receiver_name),
    receiver_account: selectedIdentifier?.type === 'financial_account_number'
      && selectedIdentifier.value === expected.receiver_account,
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
    selected_identifier: selectedIdentifier,
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
    if (field === 'field_confidences' || field === 'field_evidence' || field === 'parties') continue;
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

  const primaryIdentifier = selectPreferredIdentifier(primary);
  const escalationIdentifier = selectPreferredIdentifier(escalation);
  if (primaryIdentifier && escalationIdentifier) {
    const sameKey = primaryIdentifier.type === escalationIdentifier.type
      && primaryIdentifier.value === escalationIdentifier.value
      && comparable(primaryIdentifier.financial_entity) === comparable(escalationIdentifier.financial_entity);
    if (!sameKey) unresolvedConflicts.push('financial_identity_conflict');
  }

  const primaryParties = extractParties(primary);
  const escalationParties = extractParties(escalation);
  selected.parties = escalationAssessment.complete || escalationParties.some((party) => party.identifiers.length > 0)
    ? escalationParties
    : primaryParties;

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
    unresolvedConflicts: [...new Set(unresolvedConflicts)],
    primaryAssessment,
    escalationAssessment,
    finalAssessment,
    reviewRequired: !finalAssessment.complete || unresolvedConflicts.length > 0,
  };
}

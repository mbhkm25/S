from pathlib import Path

index_path = Path('supabase/functions/sanad-v3-analyze-operation/index.ts')
doc_path = Path('docs/operation-details-v3-implementation.md')
source = index_path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def replace_first(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count < 1:
        raise SystemExit(f'{label}: expected at least one match, found {count}')
    return text.replace(old, new, 1)

source = replace_once(
    source,
    '''const IDENTIFIER_TYPES = [
  "account_number",
  "wallet_number",
  "financial_line",
  "merchant_point",
  "terminal_number",
  "phone_number",
  "iban",
  "other",
  "unknown",
];''',
    '''const IDENTIFIER_TYPES = [
  "financial_account_number",
  "unique_account_name",
  "national_id",
  "passport_number",
  "wallet_number",
  "phone_number",
  "unknown_identifier",
];
const PARTY_ROLES = [
  "credited_party",
  "debited_party",
  "sender",
  "receiver",
  "beneficiary",
  "unknown",
];''',
    'identifier types',
)

party_schema = '''
const PARTY_IDENTIFIER_SCHEMA = {
  type: "OBJECT",
  properties: {
    type: { type: "STRING", enum: IDENTIFIER_TYPES },
    value: { type: "STRING" },
    label: nullableString,
    financial_entity: nullableString,
    confidence: { type: "NUMBER" },
    evidence: nullableString,
  },
  required: ["type", "value", "label", "financial_entity", "confidence", "evidence"],
};

const PARTY_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: nullableString,
    role: { type: "STRING", enum: PARTY_ROLES },
    identifiers: { type: "ARRAY", items: PARTY_IDENTIFIER_SCHEMA },
  },
  required: ["name", "role", "identifiers"],
};
'''
source = replace_once(
    source,
    'const nullableNumber = { type: "NUMBER", nullable: true };\n',
    'const nullableNumber = { type: "NUMBER", nullable: true };\n' + party_schema,
    'party schema constants',
)

# The same receiver sequence appears in FULL_RESPONSE_SCHEMA and FAST_RESPONSE_SCHEMA.
# Only the first occurrence belongs to the full canonical extraction schema.
source = replace_first(
    source,
    '    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },\n    document_account: nullableString,',
    '    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },\n    parties: { type: "ARRAY", items: PARTY_SCHEMA },\n    document_account: nullableString,',
    'full schema parties property',
)
source = replace_first(
    source,
    '    "receiver_identifier_type",\n    "document_account",',
    '    "receiver_identifier_type",\n    "parties",\n    "document_account",',
    'full schema parties required',
)

# TARGETED_RECOVERY_SCHEMA exists only after the v3.1 integration script has run.
source = replace_once(
    source,
    '    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },\n    reference_number: nullableString,',
    '    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },\n    parties: { type: "ARRAY", items: PARTY_SCHEMA },\n    reference_number: nullableString,',
    'targeted schema parties property',
)
source = replace_once(
    source,
    '    "receiver_identifier_type",\n    "reference_number",',
    '    "receiver_identifier_type",\n    "parties",\n    "reference_number",',
    'targeted schema parties required',
)

normalizers = '''
function normalizePartyIdentifier(value: unknown, fallbackEntity: string | null) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const type = enumValue(source.type, IDENTIFIER_TYPES, "unknown_identifier");
  const normalizedValue = cleanNumberLikeText(source.value);
  if (!normalizedValue) return null;
  const label = cleanTextOrNull(source.label);
  const labelText = (label || "").trim().toLowerCase();
  const evidence = cleanTextOrNull(source.evidence);
  let safeType = type;
  if (/^(بط|بطاقة|هوية)/.test(labelText)) safeType = "national_id";
  if (/^(ج|جواز)/.test(labelText)) safeType = "passport_number";
  return {
    type: safeType,
    value: normalizedValue,
    label,
    financial_entity: cleanTextOrNull(source.financial_entity) || fallbackEntity,
    confidence: normalizeConfidence(source.confidence),
    evidence,
  };
}

function normalizeParties(value: unknown, fallbackEntity: string | null) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((party) => party && typeof party === "object" && !Array.isArray(party))
    .map((party) => {
      const source = party as Record<string, unknown>;
      return {
        name: cleanTextOrNull(source.name),
        role: enumValue(source.role, PARTY_ROLES, "unknown"),
        identifiers: (Array.isArray(source.identifiers) ? source.identifiers : [])
          .map((identifier) => normalizePartyIdentifier(identifier, fallbackEntity))
          .filter(Boolean)
          .slice(0, 12),
      };
    })
    .slice(0, 8);
}

function preferredPartyIdentifier(parties: ReturnType<typeof normalizeParties>) {
  const priority = [
    "financial_account_number",
    "unique_account_name",
    "national_id",
    "passport_number",
    "wallet_number",
    "phone_number",
  ];
  const target = parties.find((party) => ["credited_party", "receiver", "beneficiary"].includes(party.role))
    || parties.find((party) => party.identifiers.length > 0);
  if (!target) return null;
  return [...target.identifiers].sort((left, right) => {
    const order = priority.indexOf(left.type) - priority.indexOf(right.type);
    return order !== 0 ? order : right.confidence - left.confidence;
  })[0] || null;
}
'''
source = replace_once(
    source,
    'function normalizeExtracted(extracted: any) {\n',
    normalizers + '\nfunction normalizeExtracted(extracted: any) {\n',
    'party normalizers',
)

source = replace_once(
    source,
    '  const isFinancial = normalizeBoolean(extracted?.is_financial_document, true);\n  const normalized = {',
    '  const isFinancial = normalizeBoolean(extracted?.is_financial_document, true);\n  const normalizedEntity = isFinancial ? enumValue(extracted?.financial_entity, FINANCIAL_ENTITIES, "unknown") : null;\n  const parties = isFinancial ? normalizeParties(extracted?.parties, normalizedEntity) : [];\n  const preferredIdentifier = preferredPartyIdentifier(parties);\n  const normalized = {',
    'normalize party setup',
)
source = replace_once(
    source,
    '    financial_entity: isFinancial\n      ? enumValue(extracted?.financial_entity, FINANCIAL_ENTITIES, "unknown")\n      : null,',
    '    financial_entity: normalizedEntity,',
    'normalized entity reuse',
)
source = replace_once(
    source,
    '    receiver_account: isFinancial\n      ? cleanNumberLikeText(extracted?.receiver_account)\n      : null,',
    '    receiver_account: isFinancial\n      ? (preferredIdentifier?.type === "financial_account_number" ? preferredIdentifier.value : cleanNumberLikeText(extracted?.receiver_account))\n      : null,',
    'receiver compatibility projection',
)
source = replace_once(
    source,
    '    receiver_identifier_type: enumValue(\n      extracted?.receiver_identifier_type,\n      IDENTIFIER_TYPES,\n      "unknown",\n    ),\n    document_account:',
    '    receiver_identifier_type: preferredIdentifier?.type || enumValue(\n      extracted?.receiver_identifier_type,\n      IDENTIFIER_TYPES,\n      "unknown_identifier",\n    ),\n    parties,\n    selected_party_identifier: preferredIdentifier,\n    document_account:',
    'normalized parties projection',
)

source = replace_once(
    source,
    '    receiver_account: primary.receiver_account ?? null,\n    reference_number:',
    '    receiver_account: primary.receiver_account ?? null,\n    parties: primary.parties ?? [],\n    reference_number:',
    'recovery compact parties',
)

source = source.replace(
    '          ai_flags: primaryNormalized.ai_flags,\n          missing_fields:',
    '          parties: recoveryResult.extracted?.parties || primaryNormalized.parties,\n          ai_flags: primaryNormalized.ai_flags,\n          missing_fields:',
    1,
)

source = replace_once(
    source,
    '          unresolved_conflicts: reconciliation.unresolvedConflicts || [],\n          review_required: reviewRequired,',
    '          unresolved_conflicts: reconciliation.unresolvedConflicts || [],\n          selected_identifier: finalAssessment.selectedIdentifier,\n          unique_identifier_count: finalAssessment.uniqueIdentifierCount,\n          review_required: reviewRequired,',
    'quality identifier metadata',
)

index_path.write_text(source, encoding='utf-8')

if doc_path.exists():
    doc = doc_path.read_text(encoding='utf-8')
    marker = '## Operation details UI\n'
    section = '''## Extraction identity model v3.2\n\nThe canonical extraction contract now represents each financial party with multiple typed identifiers. Automatic matching requires a unique identifier inside the financial-entity scope, using the key `financial_entity + identifier_type + identifier_value`. Priority is financial account, verified unique account name, national ID, passport, wallet, then phone. Labels such as `بط` and `ج` override model guesses and prevent identity/passport values from being projected as financial accounts. `receiver_account` remains a compatibility projection only; `parties[].identifiers[]` is the source of truth. Conflicting unique identifiers force review instead of score-based guessing.\n\n'''
    if section not in doc:
        doc = doc.replace(marker, section + marker)
    doc = doc.replace('Pipeline version: `operation-extraction-v3`.', 'Pipeline version: `operation-extraction-v3.2`.')
    doc_path.write_text(doc, encoding='utf-8')

print('Extraction v3.2 party-identifier patch applied successfully.')

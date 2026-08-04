# One-shot corrective patch triggered after the workflow file is registered.
from pathlib import Path

index_path = Path('supabase/functions/sanad-v3-analyze-operation/index.ts')
helper_path = Path('supabase/functions/sanad-v3-analyze-operation/extraction-v3.ts')


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


index = index_path.read_text(encoding='utf-8')

index = replace_once(
    index,
    '    "صحح الحقول الناقصة أو الخاطئة فقط، ولا تخترع قيمة غير ظاهرة.",\n',
    '    "صحح الحقول الناقصة أو الخاطئة فقط، ولا تخترع قيمة غير ظاهرة.",\n'
    '    "إذا كان معرّف المستلم الحالي بطاقة أو هوية أو جوازًا، فابحث في سطر المستلم والأسطر المجاورة عن رقم الحساب المالي المستقل، خصوصًا الرقم المسبوق بكلمة رقم أو حساب.",\n'
    '    "لا تُعد بط أو بطاقة أو هوية أو جواز حسابًا ماليًا، ولا تنهِ المراجعة قبل فحص وجود financial_account_number منفصل للطرف المستلم.",\n',
    'targeted recovery account search instructions',
)

index = replace_once(
    index,
    '        reconciliation = reconcileExtraction(primaryNormalized, recoveryCandidate);\n'
    '        normalized = reconciliation.selected as typeof normalized;\n',
    '        reconciliation = reconcileExtraction(primaryNormalized, recoveryCandidate);\n'
    '        // Re-run canonical normalization so the compatibility projection follows\n'
    '        // the reconciled party identifiers rather than stale scalar fields.\n'
    '        normalized = normalizeExtracted(reconciliation.selected);\n',
    're-normalize reconciled extraction',
)

index = replace_first(
    index,
    '      amount: normalized.amount,\n'
    '      currency: normalized.currency,\n'
    '      reference_number: normalized.reference_number,\n',
    '      amount: normalized.amount,\n'
    '      currency: normalized.currency,\n'
    '      receiver_name: normalized.receiver_name,\n'
    '      receiver_account: normalized.receiver_account,\n'
    '      receiver_identifier_type: normalized.receiver_identifier_type,\n'
    '      reference_number: normalized.reference_number,\n',
    'persist receiver projection',
)

index = replace_once(
    index,
    '      metadata: {\n'
    '        model: GEMINI_MODEL,\n'
    '        attempts: result.attempts,\n'
    '        schema_enforced: true,\n'
    '      },\n'
    '    });\n\n'
    '    return jsonResponse({\n',
    '      metadata: {\n'
    '        model: GEMINI_MODEL,\n'
    '        attempts: result.attempts,\n'
    '        schema_enforced: true,\n'
    '        extraction_pipeline_version: EXTRACTION_PIPELINE_VERSION,\n'
    '        quality_complete: finalAssessment.complete,\n'
    '        review_required: reviewRequired,\n'
    '        recovery_used: Boolean(recoveryResult),\n'
    '        selected_identifier: finalAssessment.selectedIdentifier,\n'
    '      },\n'
    '    });\n\n'
    '    return jsonResponse({\n',
    'analysis total quality telemetry',
)

index_path.write_text(index, encoding='utf-8')

helper = helper_path.read_text(encoding='utf-8')
helper = replace_once(
    helper,
    "  const escalationReasons: string[] = [];\n  const conflicts = identifierConflicts(record);\n\n",
    "  const escalationReasons: string[] = [];\n"
    "  const conflicts = identifierConflicts(record);\n"
    "  const selectedType = selectedIdentifier?.type ?? null;\n"
    "  const selectedValue = selectedIdentifier?.value ?? '';\n"
    "  const receiverScalar = numericIdentifier(record.receiver_account);\n"
    "  const receiverEvidence = comparable((record.field_evidence as Record<string, unknown> | undefined)?.receiver_account);\n"
    "  const identityOnlyReceiver = Boolean(selectedIdentifier)\n"
    "    && ['national_id', 'passport_number'].includes(selectedType || '')\n"
    "    && (receiverScalar === selectedValue || /(^|\\s)(بط|بطاقة|هوية|ج|جواز)(\\s|$)/.test(receiverEvidence));\n\n",
    'identity-only receiver assessment',
)
helper = replace_once(
    helper,
    "  if (conflicts.length > 0) escalationReasons.push('financial_identity_conflict');\n",
    "  if (conflicts.length > 0) escalationReasons.push('financial_identity_conflict');\n"
    "  if (identityOnlyReceiver) escalationReasons.push('identity_only_receiver_requires_account_recovery');\n",
    'identity-only escalation reason',
)
helper = replace_once(
    helper,
    "    complete: missing.length === 0 && confidence >= 0.82 && conflicts.length === 0,\n",
    "    complete: missing.length === 0 && confidence >= 0.82 && conflicts.length === 0 && !identityOnlyReceiver,\n",
    'identity-only completion gate',
)
helper_path.write_text(helper, encoding='utf-8')

print('Extraction v3.2 live benchmark corrections applied.')

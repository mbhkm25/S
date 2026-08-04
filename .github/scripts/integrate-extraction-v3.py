from pathlib import Path

BRANCH = 'feature/operation-details-v3-extraction-preview-hardening'
index_path = Path('supabase/functions/sanad-v3-analyze-operation/index.ts')
ui_path = Path('src/features/operations/OperationDetailsRuntimeV2.tsx')
currency_path = Path('src/lib/currencyRegistry.ts')
doc_path = Path('docs/operation-details-v3-implementation.md')

source = index_path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

source = replace_once(
    source,
    'import { jsonrepair } from "npm:jsonrepair@3.13.1";\n',
    'import { jsonrepair } from "npm:jsonrepair@3.13.1";\nimport {\n  assessCoreExtraction,\n  buildExtractionV3Rules,\n  EXTRACTION_PIPELINE_VERSION,\n  reconcileExtraction,\n} from "./extraction-v3.ts";\n',
    'extraction imports',
)

source = replace_once(
    source,
    'const GEMINI_FAST_MODEL = Deno.env.get("GEMINI_FAST_MODEL") || GEMINI_MODEL;\n',
    'const GEMINI_FAST_MODEL = Deno.env.get("GEMINI_FAST_MODEL") || GEMINI_MODEL;\nconst GEMINI_RECOVERY_MODEL = Deno.env.get("GEMINI_RECOVERY_MODEL") || GEMINI_FAST_MODEL;\n',
    'recovery model',
)

targeted_schema = '''const TARGETED_RECOVERY_SCHEMA = {
  type: "OBJECT",
  properties: {
    financial_entity: { type: "STRING", enum: FINANCIAL_ENTITIES },
    document_template: { type: "STRING", enum: DOCUMENT_TEMPLATES },
    transaction_type: { type: "STRING", enum: TRANSACTION_TYPES },
    transaction_direction: { type: "STRING", enum: TRANSACTION_DIRECTIONS },
    amount: nullableNumber,
    currency: { type: "STRING", enum: ["YER", "SAR", "USD"], nullable: true },
    receiver_name: nullableString,
    receiver_account: nullableString,
    receiver_identifier_type: { type: "STRING", enum: IDENTIFIER_TYPES },
    reference_number: nullableString,
    transaction_datetime: nullableString,
    transaction_time_present: { type: "BOOLEAN" },
    transaction_date_source: nullableString,
    confidence_score: { type: "NUMBER" },
    field_confidences: {
      type: "OBJECT",
      properties: {
        financial_entity: { type: "NUMBER" },
        transaction_type: { type: "NUMBER" },
        amount: { type: "NUMBER" },
        currency: { type: "NUMBER" },
        receiver_name: { type: "NUMBER" },
        receiver_account: { type: "NUMBER" },
        reference_number: { type: "NUMBER" },
        transaction_datetime: { type: "NUMBER" },
      },
    },
    field_evidence: {
      type: "OBJECT",
      properties: {
        financial_entity: nullableString,
        transaction_type: nullableString,
        amount: nullableString,
        currency: nullableString,
        receiver_name: nullableString,
        receiver_account: nullableString,
        reference_number: nullableString,
        transaction_datetime: nullableString,
      },
    },
  },
  required: [
    "financial_entity",
    "document_template",
    "transaction_type",
    "transaction_direction",
    "amount",
    "currency",
    "receiver_name",
    "receiver_account",
    "receiver_identifier_type",
    "reference_number",
    "transaction_datetime",
    "transaction_time_present",
    "transaction_date_source",
    "confidence_score",
    "field_confidences",
    "field_evidence",
  ],
};

'''
source = replace_once(source, 'function mustGetEnv(name: string): string {\n', targeted_schema + 'function mustGetEnv(name: string): string {\n', 'targeted schema')

prompt_function = '''function buildTargetedRecoveryPrompt(primary: Record<string, unknown>, reasons: string[]): string {
  const compactPrimary = {
    financial_entity: primary.financial_entity ?? null,
    document_template: primary.document_template ?? null,
    transaction_type: primary.transaction_type ?? null,
    transaction_direction: primary.transaction_direction ?? null,
    amount: primary.amount ?? null,
    currency: primary.currency ?? null,
    receiver_name: primary.receiver_name ?? null,
    receiver_account: primary.receiver_account ?? null,
    reference_number: primary.reference_number ?? null,
    transaction_datetime: primary.transaction_datetime ?? null,
  };
  return [
    "أعد JSON فقط وفق المخطط. هذه مراجعة مالية مستهدفة وليست تلخيصًا.",
    "استخرج الحقول الجوهرية من المستند الأصلي نفسه، ولا تعتمد على الملخص النصي وحده.",
    "صحح الحقول الناقصة أو الخاطئة فقط، ولا تخترع قيمة غير ظاهرة.",
    `أسباب المراجعة: ${reasons.join(" | ") || "quality_gate"}`,
    `النتيجة الأولية للمقارنة: ${JSON.stringify(compactPrimary)}`,
    buildExtractionV3Rules(),
  ].join("\\n");
}

'''
source = replace_once(source, 'function supabaseHeaders(extra: HeadersInit = {}): HeadersInit {\n', prompt_function + 'function supabaseHeaders(extra: HeadersInit = {}): HeadersInit {\n', 'recovery prompt')

old_normalize = '''    const normalized = normalizeExtracted(result.extracted);
    const persistStartedAtMs = Date.now();
'''
new_normalize = '''    let normalized = normalizeExtracted(result.extracted);
    const primaryNormalized = normalized;
    const primaryAssessment = assessCoreExtraction(primaryNormalized);
    let recoveryResult: Awaited<ReturnType<typeof callGemini>> | null = null;
    let reconciliation = reconcileExtraction(primaryNormalized);

    if (primaryAssessment.escalationReasons.length > 0) {
      const recoveryStartedAtMs = Date.now();
      try {
        recoveryResult = await callGemini({
          model: GEMINI_RECOVERY_MODEL,
          mimeType,
          base64,
          promptText: buildTargetedRecoveryPrompt(primaryNormalized, primaryAssessment.escalationReasons),
          responseSchema: TARGETED_RECOVERY_SCHEMA,
          maxAttempts: 1,
        });
        const recoveryCandidate = normalizeExtracted({
          ...primaryNormalized,
          ...recoveryResult.extracted,
          is_financial_document: primaryNormalized.is_financial_document,
          field_confidences: {
            ...primaryNormalized.field_confidences,
            ...(recoveryResult.extracted?.field_confidences || {}),
          },
          field_evidence: {
            ...primaryNormalized.field_evidence,
            ...(recoveryResult.extracted?.field_evidence || {}),
          },
          ai_flags: primaryNormalized.ai_flags,
          missing_fields: primaryNormalized.missing_fields,
          visual_integrity_notes: primaryNormalized.visual_integrity_notes,
          sanad_attention_points: primaryNormalized.sanad_attention_points,
        });
        reconciliation = reconcileExtraction(primaryNormalized, recoveryCandidate);
        normalized = reconciliation.selected as typeof normalized;
        await recordSpan({
          operationId: operation.id,
          runId,
          pipeline: "analysis",
          stage: "targeted_recovery",
          status: "success",
          startedAtMs: recoveryStartedAtMs,
          metadata: {
            model: GEMINI_RECOVERY_MODEL,
            attempts: recoveryResult.attempts,
            reasons: primaryAssessment.escalationReasons,
            conflicts: reconciliation.conflicts,
          },
        });
      } catch (recoveryError) {
        await recordSpan({
          operationId: operation.id,
          runId,
          pipeline: "analysis",
          stage: "targeted_recovery",
          status: "error",
          startedAtMs: recoveryStartedAtMs,
          metadata: {
            model: GEMINI_RECOVERY_MODEL,
            reasons: primaryAssessment.escalationReasons,
            error: truncateText(recoveryError instanceof Error ? recoveryError.message : String(recoveryError), 800),
          },
        });
      }
    }

    const finalAssessment = assessCoreExtraction(normalized);
    const reviewRequired = reconciliation.reviewRequired === true || !finalAssessment.complete;
    if (reviewRequired && !normalized.ai_flags.includes("extraction_review_required")) {
      normalized.ai_flags.push("extraction_review_required");
    }
    normalized.missing_fields = finalAssessment.missing;
    normalized.confidence_score = finalAssessment.confidence;

    const persistStartedAtMs = Date.now();
'''
source = replace_once(source, old_normalize, new_normalize, 'quality gate integration')

source = replace_once(
    source,
    '        response_schema: "strict-v2",\n        gemini_metadata: {\n',
    '        response_schema: "strict-v2",\n        extraction_pipeline_version: EXTRACTION_PIPELINE_VERSION,\n        extraction_quality: {\n          primary: primaryAssessment,\n          final: finalAssessment,\n          recovery_model: recoveryResult ? GEMINI_RECOVERY_MODEL : null,\n          recovery_attempts: recoveryResult?.attempts ?? 0,\n          reconciliation_source: reconciliation.source,\n          conflicts: reconciliation.conflicts,\n          unresolved_conflicts: reconciliation.unresolvedConflicts || [],\n          review_required: reviewRequired,\n        },\n        gemini_metadata: {\n',
    'quality metadata',
)

source = replace_once(
    source,
    '      confidence_score: normalized.confidence_score,\n      ai_confidence_score: normalized.confidence_score,\n      possible_fraud: normalized.possible_fraud,\n',
    '      confidence_score: normalized.confidence_score,\n      ai_confidence_score: normalized.confidence_score,\n      sanad_confidence_score: finalAssessment.confidence,\n      sanad_review_status: reviewRequired ? "needs_review" : "not_required",\n      sanad_risk_level: reviewRequired ? "medium" : "low",\n      possible_fraud: normalized.possible_fraud,\n',
    'review persistence',
)

source = replace_once(
    source,
    '      missing_fields: normalized.missing_fields,\n',
    '      missing_fields: finalAssessment.missing,\n',
    'final missing fields',
)

source = replace_once(
    source,
    '      schema_enforced: true,\n      confidence_score: normalized.confidence_score,\n',
    '      schema_enforced: true,\n      extraction_pipeline_version: EXTRACTION_PIPELINE_VERSION,\n      quality_complete: finalAssessment.complete,\n      review_required: reviewRequired,\n      recovery_used: Boolean(recoveryResult),\n      confidence_score: normalized.confidence_score,\n',
    'completion event quality',
)

source = replace_once(
    source,
    '      normalized,\n    });\n',
    '      quality: {\n        pipeline_version: EXTRACTION_PIPELINE_VERSION,\n        primary: primaryAssessment,\n        final: finalAssessment,\n        review_required: reviewRequired,\n        recovery_used: Boolean(recoveryResult),\n        recovery_model: recoveryResult ? GEMINI_RECOVERY_MODEL : null,\n        conflicts: reconciliation.conflicts,\n      },\n      normalized,\n    });\n',
    'response quality',
)

index_path.write_text(source, encoding='utf-8')

# Remove all currency symbol rendering while retaining canonical ISO/name presentation.
currency = currency_path.read_text(encoding='utf-8')
currency = currency.replace('  symbol: string;\n  symbolAsset?: string;\n', '')
for line in [
    "    symbol: 'ر.س',\n",
    "    symbolAsset: 'https://www.sama.gov.sa/ar-sa/Currency/Documents/Saudi_Riyal_Symbol-2.svg',\n",
    "    symbol: 'ر.ي',\n",
    "    symbol: '$',\n",
    "    symbol: 'د.إ',\n",
    "    symbol: 'ر.ع.',\n",
    '    symbol: fallback,\n',
]:
    currency = currency.replace(line, '')
currency_path.write_text(currency, encoding='utf-8')

ui = ui_path.read_text(encoding='utf-8')
old_amount = '''              <div className="flex items-end justify-end gap-1.5">
                <strong className="text-[38px] font-black leading-none tracking-tight text-slate-950">{amount}</strong>
                {runtime.operation.currency === 'SAR' && currency.symbolAsset ? <img src={currency.symbolAsset} alt="" className="mb-1 h-5 w-5 object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <span className="mb-0.5 text-[12px] font-black text-emerald-700">{currency.symbol}</span>}
              </div>
'''
new_amount = '''              <div className="flex items-end justify-end gap-1.5">
                <strong className="text-[38px] font-black leading-none tracking-tight text-slate-950">{amount}</strong>
                <span className="mb-0.5 text-[11px] font-black text-emerald-700">{currency.code || runtime.operation.currency || ''}</span>
              </div>
'''
ui = replace_once(ui, old_amount, new_amount, 'remove currency symbols from UI')
ui = ui.replace('disabled={acting || !analysisReady}', "disabled={acting || !analysisReady || runtime.operation.review_status === 'needs_review'}")
ui_path.write_text(ui, encoding='utf-8')

if doc_path.exists():
    doc = doc_path.read_text(encoding='utf-8')
    start = doc.find('## Currency registry')
    end = doc.find('\n## Current checkpoints', start)
    if start >= 0 and end > start:
        doc = doc[:start] + '## Currency presentation\n\nCurrency symbols are explicitly deferred. The runtime currently presents canonical ISO codes and localized currency names only. No external or bundled currency-symbol asset is part of this release.\n' + doc[end:]
    doc = doc.replace('- local bundling of the official SAR SVG;\n', '')
    doc_path.write_text(doc, encoding='utf-8')

print('Extraction v3.1 integration patch applied successfully.')

import type { CoreFinancialExtraction } from "../contracts.ts";
import type { OcrExtractionResult } from "./contracts.ts";
import {
  blocksInRelativeRegion,
  detectGeometryProfile,
  type RecoverableField,
  type RelativeRegion,
} from "./template-geometry.ts";

export type RecoveryAction = {
  field: RecoverableField;
  reason: string;
  priority: number;
  regions: RelativeRegion[];
  evidenceText: string;
};

export interface FieldRecoveryPlan {
  required: boolean;
  templateProfile?: string;
  actions: RecoveryAction[];
}

const CRITICAL: RecoverableField[] = [
  "documentReference",
  "transactionDatetime",
  "amount",
  "currency",
  "senderIdentifier",
  "receiverIdentifier",
];

function hasValue(extraction: CoreFinancialExtraction, field: RecoverableField): boolean {
  switch (field) {
    case "documentReference":
      return Boolean(extraction.documentReference?.trim());
    case "transactionDatetime":
      return Boolean(extraction.transactionDatetime?.trim());
    case "amount":
      return Number.isFinite(extraction.amount) && extraction.amount > 0;
    case "currency":
      return Boolean(extraction.currency);
    case "senderIdentifier":
      return Boolean(extraction.sender?.identifiers?.some((x) => x.value?.trim()));
    case "receiverIdentifier":
      return Boolean(extraction.receiver?.identifiers?.some((x) => x.value?.trim()));
  }
}

function fieldConfidence(extraction: CoreFinancialExtraction, field: RecoverableField): number {
  const fc = extraction.fieldConfidence as Record<string, number> | undefined;
  if (!fc) return extraction.confidence ?? 0;
  if (field === "senderIdentifier") return fc.sender ?? fc.senderIdentifier ?? extraction.confidence ?? 0;
  if (field === "receiverIdentifier") return fc.receiver ?? fc.receiverIdentifier ?? extraction.confidence ?? 0;
  return fc[field] ?? extraction.confidence ?? 0;
}

function suspiciousIdentifier(value: string): boolean {
  const compact = value.replace(/\D/g, "");
  return compact.length > 0 && compact.length < 6;
}

function identifierLooksSuspicious(extraction: CoreFinancialExtraction, field: RecoverableField): boolean {
  const ids = field === "senderIdentifier" ? extraction.sender?.identifiers : extraction.receiver?.identifiers;
  return Boolean(ids?.some((x) => suspiciousIdentifier(x.value ?? "")));
}

export function buildFieldRecoveryPlan(
  extraction: CoreFinancialExtraction,
  ocr: OcrExtractionResult,
  minConfidence = 0.92,
): FieldRecoveryPlan {
  const profile = detectGeometryProfile(ocr.rawText);
  const actions: RecoveryAction[] = [];

  for (const field of CRITICAL) {
    const missing = !hasValue(extraction, field);
    const confidence = fieldConfidence(extraction, field);
    const suspicious = (field === "senderIdentifier" || field === "receiverIdentifier") &&
      identifierLooksSuspicious(extraction, field);
    if (!missing && confidence >= minConfidence && !suspicious) continue;

    const regions = profile?.regions[field] ?? [{ x: 0, y: 0, width: 1, height: 1 }];
    const evidenceBlocks = regions.flatMap((region) => blocksInRelativeRegion(ocr.blocks, region));
    const evidenceText = [...new Set(evidenceBlocks.map((b) => b.text).filter(Boolean))].join("\n").slice(0, 1800);
    const reason = missing
      ? "missing_critical_field"
      : suspicious
      ? "suspicious_identifier_shape"
      : `field_confidence_below_${minConfidence}`;
    const priority = missing || suspicious ? 100 : Math.round((1 - confidence) * 100);

    actions.push({ field, reason, priority, regions, evidenceText });
  }

  actions.sort((a, b) => b.priority - a.priority);
  return {
    required: actions.length > 0,
    templateProfile: profile?.id,
    actions,
  };
}
